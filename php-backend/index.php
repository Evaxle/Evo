<?php
// Simple router for PHP backend API
require_once __DIR__ . '/helpers.php';
$pdo = require __DIR__ . '/db.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Basic CORS for development convenience
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
if ($method === 'OPTIONS') exit;

// health
if ($path === '/api/health') {
  json_response(['ok' => true]);
}

// register
if ($path === '/api/register' && $method === 'POST') {
  $data = get_json_body();
  $email = $data['email'] ?? null; $password = $data['password'] ?? null;
  if (!$email || !$password) json_response(['error'=>'email and password required'], 400);
  $hash = password_hash($password, PASSWORD_DEFAULT);
  try {
    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $stmt->execute([$email, $hash]);
    $id = $pdo->lastInsertId();
    $token = jwt_sign(['id'=>$id, 'email'=>$email]);
    json_response(['user'=>['id'=>$id,'email'=>$email], 'token'=>$token]);
  } catch (PDOException $e) {
    json_response(['error'=>'email already exists'], 409);
  }
}

// login
if ($path === '/api/login' && $method === 'POST') {
  $data = get_json_body();
  $email = $data['email'] ?? null; $password = $data['password'] ?? null;
  if (!$email || !$password) json_response(['error'=>'email and password required'], 400);
  $stmt = $pdo->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
  $stmt->execute([$email]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$u) json_response(['error'=>'invalid credentials'], 401);
  if (!password_verify($password, $u['password_hash'])) json_response(['error'=>'invalid credentials'], 401);
  $token = jwt_sign(['id'=>$u['id'], 'email'=>$u['email']]);
  json_response(['user'=>['id'=>$u['id'],'email'=>$u['email']],'token'=>$token]);
}

// projects list & create
if ($path === '/api/projects' && $method === 'GET') {
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $stmt = $pdo->prepare('SELECT id,name,created_at,updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC');
  $stmt->execute([$user['id']]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  json_response(['projects'=>$rows]);
}

if ($path === '/api/projects' && $method === 'POST') {
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $data = get_json_body(); $name = $data['name'] ?? null; $content = $data['content'] ?? '';
  if (!$name) json_response(['error'=>'project name required'],400);
  $stored = is_array($content) ? json_encode($content) : $content;
  $stmt = $pdo->prepare('INSERT INTO projects (user_id,name,content) VALUES (?,?,?)');
  $stmt->execute([$user['id'],$name,$stored]);
  $id = $pdo->lastInsertId();
  $stmt2 = $pdo->prepare('SELECT id,name,content,created_at,updated_at FROM projects WHERE id = ?');
  $stmt2->execute([$id]); $proj = $stmt2->fetch(PDO::FETCH_ASSOC);
  $maybe = json_decode($proj['content'], true); if ($maybe) $proj['content'] = $maybe;
  json_response(['project'=>$proj]);
}

// get, update project by id
if (preg_match('#^/api/projects/([0-9]+)$#', $path, $m)) {
  $id = intval($m[1]);
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id,name,content,created_at,updated_at FROM projects WHERE id = ? AND user_id = ?');
    $stmt->execute([$id,$user['id']]); $proj = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$proj) json_response(['error'=>'not found'],404);
    $maybe = json_decode($proj['content'], true); if ($maybe) $proj['content'] = $maybe;
    json_response(['project'=>$proj]);
  }
  if ($method === 'PUT') {
    $data = get_json_body(); $content = $data['content'] ?? '';
    $stored = is_array($content) ? json_encode($content) : $content;
    $stmt = $pdo->prepare('UPDATE projects SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
    $stmt->execute([$stored,$id,$user['id']]);
    $stmt2 = $pdo->prepare('SELECT id,name,content,created_at,updated_at FROM projects WHERE id = ? AND user_id = ?');
    $stmt2->execute([$id,$user['id']]); $proj = $stmt2->fetch(PDO::FETCH_ASSOC);
    $maybe = json_decode($proj['content'], true); if ($maybe) $proj['content'] = $maybe;
    json_response(['project'=>$proj]);
  }
}

// GitHub OAuth start: redirect user to GitHub authorize URL
if ($path === '/github/connect') {
  $client = env('GITHUB_CLIENT_ID','');
  $redirect = env('GITHUB_REDIRECT_URI','http://localhost:8080/github/callback');
  $state = bin2hex(random_bytes(8));
  // store state in a temporary cookie for this demo
  setcookie('gh_state', $state, time()+300, '/');
  $url = "https://github.com/login/oauth/authorize?client_id={$client}&redirect_uri=".urlencode($redirect)."&scope=repo,user&state={$state}";
  header('Location: ' . $url);
  exit;
}

// GitHub callback
if ($path === '/github/callback') {
  $code = $_GET['code'] ?? null; $state = $_GET['state'] ?? null;
  $savedState = $_COOKIE['gh_state'] ?? null;
  if (!$code || !$state || $state !== $savedState) {
    echo 'Invalid OAuth state'; exit;
  }
  // exchange code for access token
  $client = env('GITHUB_CLIENT_ID','');
  $secret = env('GITHUB_CLIENT_SECRET','');
  $tokenUrl = 'https://github.com/login/oauth/access_token';
  $post = http_build_query(['client_id'=>$client,'client_secret'=>$secret,'code'=>$code]);
  $opts = [
    'http' => [
      'method' => 'POST',
      'header' => "Accept: application/json\r\nContent-Type: application/x-www-form-urlencoded\r\n",
      'content' => $post
    ]
  ];
  $resp = file_get_contents($tokenUrl, false, stream_context_create($opts));
  $obj = json_decode($resp, true);
  if (empty($obj['access_token'])) { echo 'GitHub token exchange failed'; exit; }
  $access = $obj['access_token'];
  // For demo, we'll redirect back to the client and include the access token in the URL fragment
  // (fragment is not sent to server; client JS can read it and complete the link flow).
  $clientRedirect = 'http://localhost:3000/#gh_token=' . urlencode($access);
  header('Location: ' . $clientRedirect);
  exit;
}

// GitHub API proxy endpoints (requires user to be authenticated and have linked token)
if ($path === '/api/github/repos' && $method === 'GET') {
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $token = $user['github_token'] ?? null;
  if (!$token) json_response(['error'=>'no_github_linked'],400);
  $opts = [
    'http' => ['header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\n"]
  ];
  $res = file_get_contents('https://api.github.com/user/repos', false, stream_context_create($opts));
  $repos = json_decode($res, true);
  json_response(['repos'=>$repos]);
}

// endpoint to link GitHub token to user (client should call after OAuth flow where cookie was set)
if ($path === '/api/github/link' && $method === 'POST') {
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  // Accept token either from cookie (existing flow) or from POST body (safer for cross-origin dev flow)
  $token = $_COOKIE['gh_token'] ?? null;
  if (!$token) {
    $data = get_json_body();
    $token = $data['token'] ?? null;
  }
  if (!$token) json_response(['error'=>'no_token_provided'],400);
  $stmt = $pdo->prepare('UPDATE users SET github_token = ? WHERE id = ?');
  $stmt->execute([$token, $user['id']]);
  json_response(['ok'=>true]);
}

// GitHub repo tree listing: GET /api/github/repos/:owner/:repo/tree?ref=branch
if (preg_match('#^/api/github/repos/([^/]+)/([^/]+)/tree$#', $path, $m) && $method === 'GET') {
  $owner = $m[1]; $repo = $m[2];
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $token = $user['github_token'] ?? null; if (!$token) json_response(['error'=>'no_github_linked'],400);
  $ref = $_GET['ref'] ?? 'main';
  $apiUrl = "https://api.github.com/repos/".urlencode($owner)."/".urlencode($repo)."/git/trees/".urlencode($ref)."?recursive=1";
  $opts = ['http' => ['header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\n"]];
  $res = @file_get_contents($apiUrl, false, stream_context_create($opts));
  if ($res === false) json_response(['error'=>'failed_fetch_tree'], 502);
  $obj = json_decode($res, true);
  json_response(['tree'=>$obj]);
}

// GitHub get file contents: GET /api/github/repos/:owner/:repo/file?path=path&ref=branch
if (preg_match('#^/api/github/repos/([^/]+)/([^/]+)/file$#', $path, $m) && $method === 'GET') {
  $owner = $m[1]; $repo = $m[2];
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $token = $user['github_token'] ?? null; if (!$token) json_response(['error'=>'no_github_linked'],400);
  $filePath = $_GET['path'] ?? null; if (!$filePath) json_response(['error'=>'path required'],400);
  $ref = $_GET['ref'] ?? 'main';
  $apiUrl = "https://api.github.com/repos/".urlencode($owner)."/".urlencode($repo)."/contents/".rawurlencode($filePath)."?ref=".urlencode($ref);
  $opts = ['http' => ['header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\n"]];
  $res = @file_get_contents($apiUrl, false, stream_context_create($opts));
  if ($res === false) json_response(['error'=>'failed_fetch_file'], 502);
  $obj = json_decode($res, true);
  if (isset($obj['content'])) {
    $content = base64_decode($obj['content']);
    json_response(['path'=>$filePath,'content'=>$content,'sha'=>$obj['sha'],'encoding'=>$obj['encoding']]);
  }
  json_response(['raw'=>$obj]);
}

// GitHub contents proxy (directory listing or file): GET /api/github/repos/:owner/:repo/contents?path=...&ref=...
if (preg_match('#^/api/github/repos/([^/]+)/([^/]+)/contents$#', $path, $m) && $method === 'GET') {
  $owner = $m[1]; $repo = $m[2];
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $token = $user['github_token'] ?? null; if (!$token) json_response(['error'=>'no_github_linked'],400);
  $filePath = $_GET['path'] ?? '';
  $ref = $_GET['ref'] ?? 'main';
  // Build contents URL. If path empty use root
  $encodedPath = $filePath === '' ? '' : '/'.rawurlencode($filePath);
  $apiUrl = "https://api.github.com/repos/".urlencode($owner)."/".urlencode($repo)."/contents".$encodedPath."?ref=".urlencode($ref);
  $opts = ['http' => ['header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\n"]];
  $res = @file_get_contents($apiUrl, false, stream_context_create($opts));
  if ($res === false) {
    $err = error_get_last(); json_response(['error'=>'failed_fetch_contents','detail'=>$err],502);
  }
  $obj = json_decode($res, true);
  // If array, it's a directory listing. Normalize response to { items: [...] }
  if (is_array($obj) && array_keys($obj) === range(0, count($obj)-1)) {
    // map to lighter objects
    $items = array_map(function($it){
      return [
        'name' => $it['name'] ?? null,
        'path' => $it['path'] ?? null,
        'type' => $it['type'] ?? null, // 'file' or 'dir'
        'size' => $it['size'] ?? null,
        'sha' => $it['sha'] ?? null,
        'download_url' => $it['download_url'] ?? null
      ];
    }, $obj);
    json_response(['items'=>$items]);
  }
  // If object and has content, decode and return file content
  if (is_array($obj) && isset($obj['content'])) {
    $content = base64_decode($obj['content']);
    json_response(['path'=>$obj['path'] ?? $filePath, 'content'=>$content, 'sha'=>$obj['sha'] ?? null, 'encoding'=>$obj['encoding'] ?? null]);
  }
  // else, return raw
  json_response(['raw'=>$obj]);
}

// GitHub create/update file: POST /api/github/repos/:owner/:repo/commit  { path, content, message, branch }
if (preg_match('#^/api/github/repos/([^/]+)/([^/]+)/commit$#', $path, $m) && $method === 'POST') {
  $owner = $m[1]; $repo = $m[2];
  $user = auth_user($pdo); if (!$user) json_response(['error'=>'unauthenticated'],401);
  $token = $user['github_token'] ?? null; if (!$token) json_response(['error'=>'no_github_linked'],400);
  $data = get_json_body();
  $filePath = $data['path'] ?? null; $contentRaw = $data['content'] ?? null; $message = $data['message'] ?? 'Update from Evo'; $branch = $data['branch'] ?? 'main';
  if (!$filePath || $contentRaw === null) json_response(['error'=>'path and content required'],400);

  // check if file exists to get sha
  $getUrl = "https://api.github.com/repos/".urlencode($owner)."/".urlencode($repo)."/contents/".rawurlencode($filePath)."?ref=".urlencode($branch);
  $optsGet = ['http' => ['header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\n"]];
  $existing = @file_get_contents($getUrl, false, stream_context_create($optsGet));
  $sha = null;
  if ($existing !== false) {
    $exObj = json_decode($existing, true);
    if (!empty($exObj['sha'])) $sha = $exObj['sha'];
  }

  $apiUrl = "https://api.github.com/repos/".urlencode($owner)."/".urlencode($repo)."/contents/".rawurlencode($filePath);
  $body = ['message'=>$message, 'content'=>base64_encode($contentRaw), 'branch'=>$branch];
  if ($sha) $body['sha'] = $sha;
  $payload = json_encode($body);
  $opts = ['http' => ['method'=>'PUT', 'header' => "User-Agent: Evo-App\r\nAuthorization: token {$token}\r\nAccept: application/vnd.github.v3+json\r\nContent-Type: application/json\r\n", 'content'=>$payload]];
  $res = @file_get_contents($apiUrl, false, stream_context_create($opts));
  if ($res === false) {
    $err = error_get_last(); json_response(['error'=>'failed_commit','detail'=>$err],502);
  }
  $obj = json_decode($res, true);
  json_response(['result'=>$obj]);
}

// default
http_response_code(404); echo 'Not found';

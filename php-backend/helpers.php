<?php
// helpers: simple JWT (HS256), JSON responses, and request helpers
function env($k, $d = null) {
  $v = getenv($k);
  return $v === false ? $d : $v;
}

function jwt_sign($payload) {
  $secret = env('JWT_SECRET', 'change-me');
  $header = base64url_encode(json_encode(['alg'=>'HS256','typ'=>'JWT']));
  $body = base64url_encode(json_encode($payload));
  $sig = base64url_encode(hash_hmac('sha256', "$header.$body", $secret, true));
  return "$header.$body.$sig";
}

function jwt_verify($token) {
  $secret = env('JWT_SECRET', 'change-me');
  $parts = explode('.', $token);
  if (count($parts) !== 3) return false;
  [$h,$b,$s] = $parts;
  $check = base64url_encode(hash_hmac('sha256', "$h.$b", $secret, true));
  if (!hash_equals($check, $s)) return false;
  $payload = json_decode(base64url_decode($b), true);
  return $payload;
}

function base64url_encode($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
  $remainder = strlen($data) % 4;
  if ($remainder) $data .= str_repeat('=', 4 - $remainder);
  return base64_decode(strtr($data, '-_', '+/'));
}

function json_response($data, $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}

function get_json_body() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return $data ?: [];
}

function auth_user($pdo) {
  $hdr = getallheaders();
  $token = null;
  if (!empty($hdr['Authorization'])) $token = trim(str_replace('Bearer','',$hdr['Authorization']));
  if (!$token && !empty($_SERVER['HTTP_AUTHORIZATION'])) $token = trim(str_replace('Bearer','',$_SERVER['HTTP_AUTHORIZATION']));
  if (!$token) return null;
  $payload = jwt_verify($token);
  if (!$payload) return null;
  // fetch user from DB to ensure exists
  $stmt = $pdo->prepare('SELECT id,email,github_token FROM users WHERE id = ?');
  $stmt->execute([$payload['id']]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$u) return null;
  return $u;
}

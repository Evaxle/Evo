<?php
// DB Admin: simple explorer and editor for the project's SQLite DB.
// Access protected by HTTP Basic Auth; credentials live in ../config/php_admin.php

$cfgFile = __DIR__ . '/../config/php_admin.php';
if (!file_exists($cfgFile)) $cfgFile = __DIR__ . '/../../server/config/php_admin.php';
$cfg = file_exists($cfgFile) ? include $cfgFile : ['user'=>'admin','pass'=>'changeme'];
$USER = $cfg['user'] ?? 'admin';
$PASS = $cfg['pass'] ?? 'changeme';

// Basic auth
if (!isset($_SERVER['PHP_AUTH_USER'])) {
    header('WWW-Authenticate: Basic realm="DB Admin"');
    header('HTTP/1.0 401 Unauthorized');
    echo 'Authentication required.';
    exit;
}
$u = $_SERVER['PHP_AUTH_USER'];
$p = $_SERVER['PHP_AUTH_PW'] ?? '';
$valid = false;
if ($u === $USER) {
    // support password hash or plain text
    if (strlen($PASS) > 0 && $PASS[0] === '$') {
        $valid = password_verify($p, $PASS);
    } else {
        $valid = ($p === $PASS);
    }
}
if (!$valid) {
    header('WWW-Authenticate: Basic realm="DB Admin"');
    header('HTTP/1.0 401 Unauthorized');
    echo 'Invalid credentials.';
    exit;
}

// find sqlite DB path (try env, then server/data/evo.db, then evo_local.db)
$dbPath = getenv('SQLITE_DB_PATH') ?: (__DIR__ . '/../data/evo.db');
if (!file_exists($dbPath)) {
    $alt = dirname(__DIR__, 2) . '/evo_local.db';
    if (file_exists($alt)) $dbPath = $alt;
}

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Exception $e) {
    echo "<h2>Could not open database: " . htmlspecialchars($e->getMessage()) . "</h2>";
    exit;
}

function h($s){ return htmlspecialchars($s); }

// helpers
function listTables($pdo){
    $st = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

function tableInfo($pdo, $table){
    $st = $pdo->query("PRAGMA table_info('" . str_replace("'","''",$table) . "')");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

// Handle actions: run SQL, update row, insert, delete
$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'exec_sql') {
        $sql = $_POST['sql'] ?? '';
        try {
            $res = $pdo->query($sql);
            if ($res instanceof PDOStatement) {
                $rows = $res->fetchAll(PDO::FETCH_ASSOC);
                $message = 'Query returned ' . count($rows) . ' rows.';
            } else {
                $message = 'Statement executed.';
            }
        } catch (Exception $e) { $message = 'SQL error: ' . $e->getMessage(); }
    } elseif ($action === 'update_row') {
        $table = $_POST['table'];
        $pkcol = $_POST['pkcol'];
        $pk = $_POST['pk'];
        $cols = json_decode($_POST['cols'], true) ?: [];
        $sets = [];
        $vals = [];
        foreach ($cols as $col) {
            if (isset($_POST['col_'. $col])) {
                $sets[] = "`$col` = ?";
                $vals[] = $_POST['col_'. $col];
            }
        }
        if (count($sets)>0) {
            $sql = "UPDATE `$table` SET " . implode(', ', $sets) . " WHERE `$pkcol` = ?";
            $vals[] = $pk;
            try { $st = $pdo->prepare($sql); $st->execute($vals); $message = 'Row updated.'; } catch (Exception $e) { $message = 'Update error: ' . $e->getMessage(); }
        }
    } elseif ($action === 'insert_row') {
        $table = $_POST['table'];
        $cols = json_decode($_POST['cols'], true) ?: [];
        $vals = [];
        $place = [];
        foreach ($cols as $col) {
            $place[] = '?'; $vals[] = $_POST['col_'. $col] ?? null;
        }
        $sql = "INSERT INTO `$table` (" . implode(', ', array_map(function($c){return "`$c`";}, $cols)) . ") VALUES (" . implode(', ', $place) . ")";
        try { $st = $pdo->prepare($sql); $st->execute($vals); $message = 'Row inserted.'; } catch (Exception $e) { $message = 'Insert error: ' . $e->getMessage(); }
    } elseif ($action === 'delete_row') {
        $table = $_POST['table'];
        $pkcol = $_POST['pkcol'];
        $pk = $_POST['pk'];
        try { $st = $pdo->prepare("DELETE FROM `$table` WHERE `$pkcol` = ?"); $st->execute([$pk]); $message = 'Row deleted.'; } catch (Exception $e) { $message = 'Delete error: ' . $e->getMessage(); }
    }
}

// Begin output
?><!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>DB Admin</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial; background:#0b0b0b; color:#fff; padding:18px}
    .card{background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; max-width:1100px}
    table{border-collapse:collapse;width:100%}
    th,td{padding:6px;border-bottom:1px solid rgba(255,255,255,0.03)}
    .muted{color:rgba(255,255,255,0.6)}
    .btn{background:#ff61d8;color:#000;padding:6px 10px;border-radius:6px;border:none}
    textarea{width:100%;min-height:120px}
    input[type=text]{width:100%}
  </style>
</head>
<body>
  <div class="card">
    <h2>Database Admin</h2>
    <div class="muted">DB path: <?php echo h($dbPath); ?></div>
    <?php if ($message): ?><div style="margin-top:8px;padding:8px;background:rgba(255,255,255,0.02);border-radius:6px;margin-bottom:8px"><?php echo h($message); ?></div><?php endif; ?>

    <h3>Tables</h3>
    <ul>
    <?php foreach (listTables($pdo) as $t): ?>
      <li><a href="?table=<?php echo urlencode($t); ?>"><?php echo h($t); ?></a></li>
    <?php endforeach; ?>
    </ul>

    <h3>Run SQL</h3>
    <form method="post">
      <input type="hidden" name="action" value="exec_sql" />
      <textarea name="sql" placeholder="SELECT * FROM users LIMIT 10"></textarea>
      <div style="margin-top:8px"><button class="btn" type="submit">Run</button></div>
    </form>

    <?php if (!empty($_GET['table'])): 
        $table = $_GET['table'];
        $info = tableInfo($pdo, $table);
        if (!$info) { echo '<div class="muted">No such table</div>'; }
        else {
          // determine primary key column
          $pkcol = null;
          foreach ($info as $col) if ($col['pk']) { $pkcol = $col['name']; break; }
          if (!$pkcol) $pkcol = 'rowid';
    ?>
      <h3>Table: <?php echo h($table); ?></h3>
      <div class="muted">Columns: <?php echo implode(', ', array_map(function($c){return $c['name'];}, $info)); ?></div>

      <h4>Insert new row</h4>
      <form method="post">
        <input type="hidden" name="action" value="insert_row" />
        <input type="hidden" name="table" value="<?php echo h($table); ?>" />
        <input type="hidden" name="cols" value='<?php echo json_encode(array_map(function($c){return $c['name'];}, $info)); ?>' />
        <?php foreach ($info as $col): ?>
          <div style="margin-bottom:6px"><label><?php echo h($col['name']); ?> <input type="text" name="col_<?php echo h($col['name']); ?>" /></label></div>
        <?php endforeach; ?>
        <div><button class="btn" type="submit">Insert</button></div>
      </form>

      <h4>Rows (first 200)</h4>
      <?php
        $st = $pdo->query("SELECT * FROM `$table` LIMIT 200");
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) { echo '<div class="muted">No rows</div>'; }
        else {
      ?>
      <table>
        <thead><tr><?php foreach (array_keys($rows[0]) as $c) echo '<th>'.h($c).'</th>'; ?><th>Actions</th></tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
          <tr>
            <?php foreach ($r as $cell) echo '<td>'.h($cell).'</td>'; ?>
            <td>
              <a href="?table=<?php echo urlencode($table); ?>&edit=<?php echo urlencode($r[$pkcol] ?? $r['rowid'] ?? ''); ?>">Edit</a>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php } ?>

      <?php if (!empty($_GET['edit'])):
          $editPk = $_GET['edit'];
          $st = $pdo->prepare("SELECT * FROM `$table` WHERE `". ($pkcol==='rowid' ? 'rowid' : $pkcol) ."` = ? LIMIT 1");
          $st->execute([$editPk]);
          $row = $st->fetch(PDO::FETCH_ASSOC);
          if ($row):
      ?>
        <h4>Edit row <?php echo h($editPk); ?></h4>
        <form method="post">
          <input type="hidden" name="action" value="update_row" />
          <input type="hidden" name="table" value="<?php echo h($table); ?>" />
          <input type="hidden" name="pkcol" value="<?php echo h($pkcol); ?>" />
          <input type="hidden" name="pk" value="<?php echo h($editPk); ?>" />
          <input type="hidden" name="cols" value='<?php echo json_encode(array_keys($row)); ?>' />
          <?php foreach ($row as $k=>$v): ?>
            <div style="margin-bottom:6px"><label><?php echo h($k); ?> <input type="text" name="col_<?php echo h($k); ?>" value="<?php echo h($v); ?>" /></label></div>
          <?php endforeach; ?>
          <div style="display:flex;gap:8px"><button class="btn" type="submit">Save</button>
          <form method="post" style="display:inline;margin:0;padding:0">
            <input type="hidden" name="action" value="delete_row" />
            <input type="hidden" name="table" value="<?php echo h($table); ?>" />
            <input type="hidden" name="pkcol" value="<?php echo h($pkcol); ?>" />
            <input type="hidden" name="pk" value="<?php echo h($editPk); ?>" />
            <button class="btn" type="submit" onclick="return confirm('Delete this row?')">Delete</button>
          </form>
          </div>
        </form>
      <?php else: echo '<div class="muted">Row not found</div>'; endif; endif; ?>

    <?php }
    endif; ?>

  </div>
</body>
</html>

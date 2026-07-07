<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../conexion.php';

// ——— DEBUG en local (coméntalo en producción) ———
ini_set('display_errors', '1');
error_reporting(E_ALL);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'message' => 'Método no permitido']);
  exit;
}

$identifier = trim($_POST['identifier'] ?? '');
$password   = $_POST['password'] ?? '';

if ($identifier === '' || $password === '') {
  echo json_encode(['ok' => false, 'message' => 'Ingresa tu usuario/email y contraseña']);
  exit;
}

try {
  // Busca por email, username o name (por si tu tabla usa uno u otro)
$sql = '
  SELECT
    id,
    COALESCE(username, name) AS username,
    name,
    email,
    password_hash
  FROM users
  WHERE (email = ? OR username = ? OR name = ?)
  LIMIT 1
';
$st = $pdo->prepare($sql);
$st->execute([$identifier, $identifier, $identifier]);
$user = $st->fetch(PDO::FETCH_ASSOC);


  if (!$user) {
    echo json_encode(['ok' => false, 'message' => 'Usuario o email no existe']);
    exit;
  }

  if (!password_verify($password, $user['password_hash'])) {
    echo json_encode(['ok' => false, 'message' => 'Contraseña incorrecta']);
    exit;
  }

  if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT)) {
    $newHash = password_hash($password, PASSWORD_BCRYPT);
    $upd = $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?');
    $upd->execute([$newHash, (int)$user['id']]);
  }

  $_SESSION['user_id']   = (int)$user['id'];
  // Prioriza username; si está vacío usa name
  $_SESSION['user_name'] = $user['username'] ?: ($user['name'] ?? '');

  echo json_encode(['ok' => true]);

} catch (Throwable $e) {
  error_log('[login.php] '.$e->getMessage());
  // Para depurar en local, devuelve el error exacto:
  echo json_encode(['ok' => false, 'message' => 'Error al iniciar sesión', 'debug' => $e->getMessage()]);
  http_response_code(500);
}

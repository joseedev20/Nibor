<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../conexion.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'message' => 'Method Not Allowed']); exit;
}

$email    = strtolower(trim($_POST['email'] ?? ''));
$username = strtolower(trim($_POST['username'] ?? ''));
$password = $_POST['password'] ?? '';

if ($email === '' || $username === '' || $password === '') {
  echo json_encode(['ok' => false, 'message' => 'Email, usuario y contraseña son obligatorios']); exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  echo json_encode(['ok' => false, 'message' => 'Email inválido']); exit;
}
if (!preg_match('/^[a-z0-9_]{3,20}$/i', $username)) {
  echo json_encode(['ok' => false, 'message' => 'Usuario inválido. Usa 3–20 caracteres [a-zA-Z0-9_]']); exit;
}

try {
  // Duplicados
  $chkU = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
  $chkU->execute([$username]);
  if ($chkU->fetch()) {
    echo json_encode(['ok' => false, 'message' => 'Ese usuario ya existe']); exit;
  }

  $chkE = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
  $chkE->execute([$email]);
  if ($chkE->fetch()) {
    echo json_encode(['ok' => false, 'message' => 'Ese email ya está registrado']); exit;
  }

  $hash = password_hash($password, PASSWORD_DEFAULT);

  $ins = $pdo->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
  $ins->execute([$username, $email, $hash]);

  $userId = (int)$pdo->lastInsertId();

  // Autologin (opcional)
  $_SESSION['user_id']   = $userId;
  $_SESSION['user_name'] = $username;

  echo json_encode(['ok' => true, 'message' => 'Cuenta creada', 'user_id' => $userId]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Error creando el usuario']);
}

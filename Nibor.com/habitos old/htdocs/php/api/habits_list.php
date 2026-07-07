<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../conexion.php';

if (!isset($_SESSION['user_id'])) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'message' => 'No autenticado']);
  exit;
}

$userId = (int) $_SESSION['user_id'];

$sql = "
  SELECT id, name, emoji, color, sort_index
  FROM habits
  WHERE user_id = :uid AND is_active = 1
  ORDER BY sort_index ASC, id ASC
";
$stmt = $pdo->prepare($sql);
$stmt->execute([':uid' => $userId]);
$habits = $stmt->fetchAll();

echo json_encode(['ok' => true, 'habits' => $habits], JSON_UNESCAPED_UNICODE);

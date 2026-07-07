<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/../conexion.php';

if (!isset($_SESSION['user_id'])) {
  http_response_code(401); echo json_encode(['ok'=>false,'message'=>'No autenticado']); exit;
}

$userId  = (int) $_SESSION['user_id'];
$habitId = (int) ($_POST['habit_id'] ?? 0);
if ($habitId<=0) { http_response_code(400); echo json_encode(['ok'=>false,'message'=>'habit_id requerido']); exit; }

$own = $pdo->prepare("SELECT id FROM habits WHERE id=? AND user_id=?");
$own->execute([$habitId, $userId]);
if (!$own->fetch()) { http_response_code(403); echo json_encode(['ok'=>false,'message'=>'Sin permiso']); exit; }

try {
  $pdo->beginTransaction();
  $pdo->prepare("DELETE FROM habit_events WHERE habit_id=?")->execute([$habitId]);
  $pdo->prepare("DELETE FROM habit_schedule WHERE habit_id=?")->execute([$habitId]);
  $pdo->prepare("DELETE FROM habit_defer WHERE habit_id=? AND user_id=?")->execute([$habitId, $userId]);
  $pdo->prepare("DELETE FROM habits WHERE id=? AND user_id=?")->execute([$habitId, $userId]);
  $pdo->commit();
  echo json_encode(['ok'=>true,'message'=>'Hábito eliminado']);
} catch(Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500); echo json_encode(['ok'=>false,'message'=>'Error eliminando']);
}

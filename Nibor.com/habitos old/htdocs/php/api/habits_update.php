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
$name    = trim($_POST['name'] ?? '');
$target  = (int) ($_POST['target_per_day'] ?? 1);
$emoji   = trim($_POST['emoji'] ?? '');
$color   = trim($_POST['color'] ?? '#b7b2e7');

$days = $_POST['days'] ?? [];
if (is_string($days)) {
  $tmp = json_decode($days, true);
  if (is_array($tmp)) $days = $tmp;
  else $days = array_filter(array_map('trim', explode(',', $days)), 'strlen');
}
$days = array_values(array_unique(array_map('intval', (array)$days)));
$days = array_values(array_filter($days, fn($d)=> $d>=0 && $d<=6));

if ($habitId<=0 || $name==='') { http_response_code(400); echo json_encode(['ok'=>false,'message'=>'Datos inválidos']); exit; }

$own = $pdo->prepare("SELECT id FROM habits WHERE id=? AND user_id=?");
$own->execute([$habitId, $userId]);
if (!$own->fetch()) { http_response_code(403); echo json_encode(['ok'=>false,'message'=>'Sin permiso']); exit; }

if ($target < 1) $target = 1; if ($target > 50) $target = 50;

try {
  $pdo->beginTransaction();

  $u = $pdo->prepare("UPDATE habits 
                      SET name=:n, target_per_day=:t, emoji=:e, color=:c, updated_at=NOW() 
                      WHERE id=:id AND user_id=:uid");
  $u->execute([':n'=>$name, ':t'=>$target, ':e'=>$emoji, ':c'=>$color, ':id'=>$habitId, ':uid'=>$userId]);

  // Reemplaza agenda (0 filas = aparece todos los días)
  $pdo->prepare("DELETE FROM habit_schedule WHERE habit_id=?")->execute([$habitId]);
  if (!empty($days)) {
    $ins = $pdo->prepare("INSERT IGNORE INTO habit_schedule (habit_id, day_of_week) VALUES (:hid,:dow)");
    foreach ($days as $dow) $ins->execute([':hid'=>$habitId, ':dow'=>$dow]);
  }

  $pdo->commit();
  echo json_encode(['ok'=>true,'message'=>'Hábito actualizado']);
} catch(Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500); echo json_encode(['ok'=>false,'message'=>'Error actualizando']);
}

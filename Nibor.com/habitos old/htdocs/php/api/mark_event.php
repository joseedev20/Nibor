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

$userId  = (int)$_SESSION['user_id'];
$habitId = isset($_POST['habit_id']) ? (int)$_POST['habit_id'] : 0;
if ($habitId <= 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'habit_id requerido']);
  exit;
}

// 1) Traer target y conteo de HOY
$check = $pdo->prepare("
  SELECT h.target_per_day,
         (SELECT COUNT(*) FROM habit_events e
          WHERE e.habit_id = h.id AND DATE(e.event_time) = CURDATE()) AS done_today
  FROM habits h
  WHERE h.id = ? AND h.user_id = ? LIMIT 1
");
$check->execute([$habitId, $userId]);
$row = $check->fetch();
if (!$row) { http_response_code(404); echo json_encode(['ok'=>false,'message'=>'Hábito no existe']); exit; }

$target = (int)$row['target_per_day'];
$done   = (int)$row['done_today'];

if ($done >= $target) {
  // Ya estaba en meta: no insertes más
  echo json_encode(['ok'=>true, 'met'=>true, 'done_today'=>$done, 'target'=>$target]);
  exit;
}

// 2) Insertar evento
$ins = $pdo->prepare('INSERT INTO habit_events (habit_id, event_time, source, note) VALUES (?, NOW(), "manual", NULL)');
$ins->execute([$habitId]);

$doneNew = $done + 1;
$metNow  = $doneNew >= $target;

echo json_encode(['ok'=>true, 'met'=>$metNow, 'done_today'=>$doneNew, 'target'=>$target]);

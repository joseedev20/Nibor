<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/../conexion.php';

if (!isset($_SESSION['user_id'])) {
  http_response_code(401); echo json_encode(['ok'=>false,'message'=>'No autenticado']); exit;
}

$userId  = (int) $_SESSION['user_id'];
$habitId = (int) ($_GET['habit_id'] ?? $_POST['habit_id'] ?? 0);
if ($habitId <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'message'=>'habit_id requerido']); exit; }

$h = $pdo->prepare("SELECT id, name, emoji, color, target_per_day FROM habits WHERE id=? AND user_id=? LIMIT 1");
$h->execute([$habitId, $userId]);
$habit = $h->fetch();
if (!$habit) { http_response_code(404); echo json_encode(['ok'=>false,'message'=>'No encontrado']); exit; }

$d = $pdo->prepare("SELECT day_of_week FROM habit_schedule WHERE habit_id=? ORDER BY day_of_week");
$d->execute([$habitId]);
$days = $d->fetchAll(PDO::FETCH_COLUMN);

echo json_encode(['ok'=>true, 'habit'=>$habit, 'days'=>array_map('intval',$days)], JSON_UNESCAPED_UNICODE);

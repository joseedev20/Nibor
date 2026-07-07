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

// Datos
$name   = trim($_POST['name'] ?? '');
$target = (int) ($_POST['target_per_day'] ?? 1);
$emoji  = trim($_POST['emoji'] ?? '');
$color  = trim($_POST['color'] ?? '#b7b2e7'); // tu violeta

// days puede venir como days[] o como JSON/csv
$days = $_POST['days'] ?? [];
if (is_string($days)) {
  $tryJson = json_decode($days, true);
  if (is_array($tryJson)) $days = $tryJson;
  else $days = array_filter(array_map('trim', explode(',', $days)), 'strlen');
}

if ($name === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'El nombre es obligatorio']);
  exit;
}
if ($target < 1) $target = 1;
if ($target > 50) $target = 50; // límite sano

// Normaliza días a ints 0..6 únicos (0=Dom,1=Lun,...6=Sáb)
$days = array_values(array_unique(array_map('intval', (array)$days)));
$days = array_values(array_filter($days, fn($d) => $d >= 0 && $d <= 6));

try {
  $pdo->beginTransaction();

  // sort_index = último + 1 para el usuario
  $q = $pdo->prepare("SELECT COALESCE(MAX(sort_index), -1) + 1 FROM habits WHERE user_id = :uid");
  $q->execute([':uid' => $userId]);
  $sortIndex = (int) $q->fetchColumn();

  // Inserta hábito
  $ins = $pdo->prepare("
    INSERT INTO habits
      (user_id, name, description, emoji, color, sort_index, target_per_day, is_active, start_date, created_at)
    VALUES
      (:uid, :name, NULL, :emoji, :color, :sidx, :target, 1, CURDATE(), NOW())
  ");
  $ins->execute([
    ':uid'    => $userId,
    ':name'   => $name,
    ':emoji'  => $emoji,
    ':color'  => $color,
    ':sidx'   => $sortIndex,
    ':target' => $target,
  ]);
  $habitId = (int) $pdo->lastInsertId();

  // Si se eligieron días, inserta agenda (si no, aparece todos los días)
  if (!empty($days)) {
    // Asegura UNIQUE (habit_id, day_of_week) en la tabla para evitar duplicados.
    $insDay = $pdo->prepare("INSERT IGNORE INTO habit_schedule (habit_id, day_of_week) VALUES (:hid, :dow)");
    foreach ($days as $dow) {
      $insDay->execute([':hid' => $habitId, ':dow' => $dow]);
    }
  }

  $pdo->commit();

  echo json_encode([
    'ok'   => true,
    'habit'=> [
      'id'             => $habitId,
      'name'           => $name,
      'emoji'          => $emoji,
      'color'          => $color,
      'sort_index'     => $sortIndex,
      'target_per_day' => $target,
      'days'           => $days,
    ],
    'message' => 'Hábito creado'
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Error al crear hábito']);
}

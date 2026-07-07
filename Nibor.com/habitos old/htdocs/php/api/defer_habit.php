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

$userId  = (int) $_SESSION['user_id'];
$habitId = isset($_POST['habit_id']) ? (int) $_POST['habit_id'] : 0;

if ($habitId <= 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'habit_id requerido']);
  exit;
}

// Verificar que el hábito pertenece al usuario (defensa básica)
$chk = $pdo->prepare('SELECT id FROM habits WHERE id = ? AND user_id = ? LIMIT 1');
$chk->execute([$habitId, $userId]);
if (!$chk->fetch()) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'message' => 'Hábito no existe o no pertenece al usuario']);
  exit;
}

try {
  // UPSERT: si existe fila de hoy, incrementa; si no, crea con 1.
  $sql = "
    INSERT INTO habit_defer (user_id, habit_id, day_date, defer_rank)
    VALUES (:uid, :hid, CURDATE(), 1)
    ON DUPLICATE KEY UPDATE
      defer_rank = defer_rank + 1,
      updated_at = NOW()
  ";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([':uid' => $userId, ':hid' => $habitId]);

  // Devolver el rank actual
  $sel = $pdo->prepare("
    SELECT defer_rank
    FROM habit_defer
    WHERE user_id = :uid AND habit_id = :hid AND day_date = CURDATE()
    LIMIT 1
  ");
  $sel->execute([':uid' => $userId, ':hid' => $habitId]);
  $row = $sel->fetch();

  echo json_encode([
    'ok'         => true,
    'habit_id'   => $habitId,
    'defer_rank' => (int)($row['defer_rank'] ?? 1),
    'message'    => 'Pospuesto para el final del día'
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Error al posponer hábito']);
}

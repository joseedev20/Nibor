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

$userId = (int)$_SESSION['user_id'];

$sql = "
SELECT
  h.id,
  h.name,
  h.emoji,
  h.color,
  h.target_per_day,
  COALESCE(today.count_done, 0) AS done_today
FROM habits h
LEFT JOIN (
  SELECT habit_id, COUNT(*) AS count_done
  FROM habit_events
  WHERE DATE(event_time) = CURDATE()
  GROUP BY habit_id
) AS today ON today.habit_id = h.id

-- orden del día (pospuestos)
LEFT JOIN habit_defer d
  ON d.user_id  = h.user_id
 AND d.habit_id = h.id
 AND d.day_date = CURDATE()

WHERE h.user_id = :uid
  AND h.is_active = 1

  -- mostrar si no tiene agenda o si está agendado para HOY (0=Dom .. 6=Sáb)
  AND (
        NOT EXISTS (SELECT 1 FROM habit_schedule s2 WHERE s2.habit_id = h.id)
     OR EXISTS (
          SELECT 1
          FROM habit_schedule s3
          WHERE s3.habit_id = h.id
            AND s3.day_of_week = (DAYOFWEEK(CURDATE()) + 6) % 7
        )
      )

  -- ocultar los ya completos hoy
  AND COALESCE(today.count_done, 0) < h.target_per_day

GROUP BY
  h.id, h.name, h.emoji, h.color, h.target_per_day, done_today, d.defer_rank

ORDER BY
  (d.defer_rank IS NULL) DESC,                          -- 1) primero los NO pospuestos (NULL)
  CASE WHEN d.defer_rank IS NULL THEN h.sort_index END, -- 2) dentro de NO pospuestos: sort_index
  CASE WHEN d.defer_rank IS NOT NULL THEN d.defer_rank END, -- 3) dentro de pospuestos: defer_rank
  CASE WHEN d.defer_rank IS NOT NULL THEN h.sort_index END, -- 4) empate entre pospuestos: sort_index
  h.id DESC;

";


$stmt = $pdo->prepare($sql);
$stmt->execute([':uid' => $userId]);
$habits = $stmt->fetchAll();

echo json_encode(['ok' => true, 'habits' => $habits], JSON_UNESCAPED_UNICODE);

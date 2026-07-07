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

$uid = (int)$_SESSION['user_id'];

/* Ventanas de tiempo */
$now = new DateTime('now');
$today = (clone $now)->setTime(0,0,0);

$weekStart = (clone $now)->modify('monday this week')->setTime(0,0,0);
$weekEnd   = (clone $weekStart)->modify('+1 week');

$monthStart = (clone $now)->modify('first day of this month')->setTime(0,0,0);
$monthEnd   = (clone $monthStart)->modify('+1 month');

$month = (int)$now->format('n');
$quarterStartMonth = (int)(floor(($month-1)/3)*3 + 1);
$quarterStart = new DateTime($now->format('Y').'-'.$quarterStartMonth.'-01 00:00:00');
$quarterEnd   = (clone $quarterStart)->modify('+3 months');

$halfStartMonth = ($month <= 6) ? 1 : 7;
$halfStart = new DateTime($now->format('Y').'-'.$halfStartMonth.'-01 00:00:00');
$halfEnd   = (clone $halfStart)->modify('+6 months');

$yearStart = new DateTime($now->format('Y').'-01-01 00:00:00');
$yearEnd   = (clone $yearStart)->modify('+1 year');

/* Hábitos del usuario */
$sqlHab = "SELECT id, name, emoji, color, target_per_day
           FROM habits
           WHERE user_id = :uid AND is_active = 1
           ORDER BY sort_index ASC, id ASC";
$stHab = $pdo->prepare($sqlHab);
$stHab->execute([':uid' => $uid]);
$habits = $stHab->fetchAll(PDO::FETCH_ASSOC);

/* Días programados por hábito (para calcular % real) */
$sqlSched = "SELECT habit_id, day_of_week FROM habit_schedule
             WHERE habit_id IN (SELECT id FROM habits WHERE user_id = :uid)";
$stSched = $pdo->prepare($sqlSched);
$stSched->execute([':uid' => $uid]);
$schedule = []; // habit_id => [days...]
foreach ($stSched->fetchAll(PDO::FETCH_ASSOC) as $r) {
  $schedule[(int)$r['habit_id']][] = (int)$r['day_of_week'];
}

/* Helpers */
$cntEventsSql = "SELECT COUNT(*)
                 FROM habit_events e
                 WHERE e.habit_id = :hid
                   AND e.event_time >= :a AND e.event_time < :b";
$cntDaysSql   = "SELECT COUNT(DISTINCT DATE(e.event_time))
                 FROM habit_events e
                 WHERE e.habit_id = :hid
                   AND e.event_time >= :a AND e.event_time < :b";
$cntE = $pdo->prepare($cntEventsSql);
$cntD = $pdo->prepare($cntDaysSql);

/* Lista de fechas con eventos por hábito (últimos 365 días, suficiente para racha + heatmap) */
$histStart = (clone $today)->modify('-365 days');
$sqlHist = "SELECT DATE(event_time) AS d, COUNT(*) AS c
            FROM habit_events
            WHERE habit_id = :hid AND event_time >= :a
            GROUP BY DATE(event_time)";
$stHist = $pdo->prepare($sqlHist);

/* Cuenta días "esperados" en un rango según schedule (si no hay schedule = todos los días) */
function diasEsperados(DateTime $a, DateTime $b, array $diasProgramados, int $targetPorDia): int {
  $count = 0;
  $cursor = clone $a;
  while ($cursor < $b) {
    $dow = (int)$cursor->format('w'); // 0=Dom ... 6=Sab
    if (empty($diasProgramados) || in_array($dow, $diasProgramados, true)) {
      $count++;
    }
    $cursor->modify('+1 day');
  }
  return $count * max(1, $targetPorDia);
}

/* Calcula racha actual y máxima a partir de un mapa fecha=>conteo y target */
function calcRachas(array $byDate, int $target, array $diasProgramados, DateTime $today): array {
  // racha actual: contando hacia atrás desde hoy (o ayer si hoy no aplica)
  $current = 0;
  $cursor = clone $today;
  // si hoy no es día programado, empieza desde ayer
  $skipToday = !empty($diasProgramados) && !in_array((int)$cursor->format('w'), $diasProgramados, true);
  if ($skipToday) $cursor->modify('-1 day');

  while (true) {
    $dow = (int)$cursor->format('w');
    if (!empty($diasProgramados) && !in_array($dow, $diasProgramados, true)) {
      // día no programado, no rompe la racha pero tampoco suma
      $cursor->modify('-1 day');
      // límite de seguridad: 3 años hacia atrás
      if ((int)$today->diff($cursor)->days > 1095) break;
      continue;
    }
    $key = $cursor->format('Y-m-d');
    $done = (int)($byDate[$key] ?? 0);
    if ($done >= $target) {
      $current++;
      $cursor->modify('-1 day');
    } else {
      break;
    }
    if ((int)$today->diff($cursor)->days > 1095) break;
  }

  // racha más larga en el último año
  $longest = 0;
  $run = 0;
  $cursor = (clone $today)->modify('-365 days');
  while ($cursor <= $today) {
    $dow = (int)$cursor->format('w');
    $isPlanned = empty($diasProgramados) || in_array($dow, $diasProgramados, true);
    if ($isPlanned) {
      $key = $cursor->format('Y-m-d');
      $done = (int)($byDate[$key] ?? 0);
      if ($done >= $target) {
        $run++;
        if ($run > $longest) $longest = $run;
      } else {
        $run = 0;
      }
    }
    $cursor->modify('+1 day');
  }

  return ['current' => $current, 'longest' => $longest];
}

/* Salida */
$out = [];
$totalDoneToday = 0;
$totalPlannedToday = 0;
$bestStreak = 0;

foreach ($habits as $h) {
  $hid = (int)$h['id'];
  $target = max(1, (int)$h['target_per_day']);
  $diasProg = $schedule[$hid] ?? [];

  // Historial de eventos por fecha (últimos 365 días)
  $stHist->execute([':hid' => $hid, ':a' => $histStart->format('Y-m-d 00:00:00')]);
  $byDate = [];
  foreach ($stHist->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $byDate[$r['d']] = (int)$r['c'];
  }

  // Hoy
  $todayKey = $today->format('Y-m-d');
  $doneToday = (int)($byDate[$todayKey] ?? 0);
  $isPlannedToday = empty($diasProg) || in_array((int)$today->format('w'), $diasProg, true);

  if ($isPlannedToday) {
    $totalPlannedToday += $target;
    $totalDoneToday += min($doneToday, $target);
  }

  // Rachas
  $rachas = calcRachas($byDate, $target, $diasProg, $today);
  if ($rachas['current'] > $bestStreak) $bestStreak = $rachas['current'];

  // Heatmap últimos 30 días (más antiguo a más reciente)
  $heatmap = [];
  $cursor = (clone $today)->modify('-29 days');
  while ($cursor <= $today) {
    $dow = (int)$cursor->format('w');
    $isPlan = empty($diasProg) || in_array($dow, $diasProg, true);
    $key = $cursor->format('Y-m-d');
    $done = (int)($byDate[$key] ?? 0);
    $heatmap[] = [
      'date'    => $key,
      'planned' => $isPlan,
      'done'    => $done,
      'met'     => $done >= $target,
    ];
    $cursor->modify('+1 day');
  }

  $row = [
    'id'             => $hid,
    'name'           => $h['name'],
    'emoji'          => $h['emoji'],
    'color'          => $h['color'],
    'target_per_day' => $target,
    'done_today'     => $doneToday,
    'planned_today'  => $isPlannedToday,
    'streak_current' => $rachas['current'],
    'streak_longest' => $rachas['longest'],
    'heatmap'        => $heatmap,
  ];

  $ranges = [
    'weekly'     => [$weekStart,    $weekEnd],
    'monthly'    => [$monthStart,   $monthEnd],
    'quarterly'  => [$quarterStart, $quarterEnd],
    'semiannual' => [$halfStart,    $halfEnd],
    'annual'     => [$yearStart,    $yearEnd],
  ];

  foreach ($ranges as $key => [$a, $b]) {
    $params = [
      ':hid' => $hid,
      ':a'   => $a->format('Y-m-d H:i:s'),
      ':b'   => $b->format('Y-m-d H:i:s'),
    ];
    $cntE->execute($params);
    $events = (int)$cntE->fetchColumn();

    $cntD->execute($params);
    $days = (int)$cntD->fetchColumn();

    // Planificado real: solo días programados dentro del rango × target
    $planned = diasEsperados($a, $b, $diasProg, $target);
    $percent = $planned > 0 ? min(100, (int)round(($events / $planned) * 100)) : 0;

    $row[$key] = [
      'events'  => $events,
      'days'    => $days,
      'planned' => $planned,
      'percent' => $percent,
    ];
  }

  $out[] = $row;
}

$summary = [
  'total_habits'       => count($habits),
  'done_today'         => $totalDoneToday,
  'planned_today'      => $totalPlannedToday,
  'percent_today'      => $totalPlannedToday > 0
                          ? (int)round(($totalDoneToday / $totalPlannedToday) * 100)
                          : 0,
  'best_current_streak' => $bestStreak,
];

echo json_encode([
  'ok'      => true,
  'items'   => $out,
  'habits'  => $out,
  'summary' => $summary,
], JSON_UNESCAPED_UNICODE);

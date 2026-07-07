<?php
declare(strict_types=1);

/**
 * conexion.php
 * Selección automática de entorno (local vs prod) y conexión PDO
 */

// 1) Detecta entorno
//   - Si APP_ENV está definido -> lo usa
//   - Si no, asume "local" cuando el host/cliente es 127.0.0.1, ::1 o una IP de LAN
$env = getenv('APP_ENV');
if (!$env) {
  $host = $_SERVER['HTTP_HOST']   ?? '';
  $addr = $_SERVER['REMOTE_ADDR'] ?? '';
  $isLocalHost = preg_match('~^(localhost|127\.0\.0\.1)$~', $host);
  $isLocalIp   = preg_match('~^(127\.0\.0\.1|::1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)~', $addr);
  $env = ($isLocalHost || $isLocalIp) ? 'local' : 'prod';
}

// 2) Config según entorno
if ($env === 'local') {
  $cfg = [
    'host' => '127.0.0.1',
    'db'   => 'habits_app',
    'user' => 'root',
    'pass' => '',
    'charset' => 'utf8mb4',
  ];
} else {
  $cfg = [
    'host' => 'sql111.infinityfree.com',
    'db'   => 'if0_40034937_habits_app',
    'user' => 'if0_40034937',
    'pass' => 'kkWc2rw9NII',  // <-- pon tu password real
    'charset' => 'utf8mb4',
  ];
}

// 3) Conecta PDO
$dsn = "mysql:host={$cfg['host']};dbname={$cfg['db']};charset={$cfg['charset']}";
$options = [
  PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
  $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $options);

  // (Opcional) establece TZ de MySQL a la del servidor PHP
  // $offset = (new DateTimeZone(date_default_timezone_get()))->getOffset(new DateTime('now'));
  // $sign = $offset >= 0 ? '+' : '-';
  // $hh = str_pad((int)(abs($offset)/3600), 2, '0', STR_PAD_LEFT);
  // $mm = str_pad((int)((abs($offset)%3600)/60), 2, '0', STR_PAD_LEFT);
  // $pdo->exec("SET time_zone = '{$sign}{$hh}:{$mm}'");

} catch (PDOException $e) {
  http_response_code(500);
  echo "DB connection error: " . htmlspecialchars($e->getMessage());
  exit;
}

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

// Recibir JSON: { order: [3,1,5,...] }
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || !isset($data['order']) || !is_array($data['order']) || count($data['order']) === 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Payload inválido']);
  exit;
}

$order = array_values(array_filter($data['order'], fn($v) => is_numeric($v)));
if (empty($order)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Lista vacía']);
  exit;
}

// Verificar que todos los hábitos pertenecen al usuario
$inPlaceQ = implode(',', array_fill(0, count($order), '?'));
$chk = $pdo->prepare("SELECT id FROM habits WHERE user_id = ? AND id IN ($inPlaceQ)");
$chk->execute(array_merge([$userId], $order));
$validIds = $chk->fetchAll(PDO::FETCH_COLUMN);

if (count($validIds) !== count($order)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'message' => 'Hay hábitos que no pertenecen al usuario']);
  exit;
}

/**
 * UPDATE sin CASE usando FIELD(id, ...)
 * - sort_index queda 0..N-1 según el orden recibido.
 * - Usamos dos juegos de placeholders (f0..fN) y (i0..iN)
 *   para evitar reutilizar el mismo nombre en dos sitios.
 */
$fieldPh = [];
$inPh    = [];
$params  = [':uid' => $userId];

foreach ($order as $i => $id) {
  $fieldPh[] = ':f' . $i;
  $inPh[]    = ':i' . $i;
  $params[':f' . $i] = (int)$id; // para FIELD
  $params[':i' . $i] = (int)$id; // para IN
}

$sql = "
  UPDATE habits
  SET sort_index = FIELD(id, " . implode(',', $fieldPh) . ") - 1
  WHERE user_id = :uid
    AND id IN (" . implode(',', $inPh) . ")
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['ok' => true, 'message' => 'Orden actualizado']);

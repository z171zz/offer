<?php
// webhook.php — Recebe webhooks da SigiloPay e salva em /pagamentos/transactionId.json
// SÓ cria o arquivo quando a transação estiver PAGA (status COMPLETED)

declare(strict_types=1);
date_default_timezone_set('America/Recife');

$DIR      = __DIR__ . '/../pagamentos';
$LOG_FILE = __DIR__ . '/../webhook.log';

if (!is_dir($DIR)) { mkdir($DIR, 0775, true); }

function wlog(string $msg): void {
    global $LOG_FILE;
    file_put_contents($LOG_FILE, '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL, FILE_APPEND);
}

// Log request
$headers = [];
foreach ($_SERVER as $k => $v) {
    if (strpos($k, 'HTTP_') === 0) {
        $name = str_replace('_', '-', substr($k, 5));
        $headers[$name] = $v;
    }
}
wlog('REQ: ' . json_encode(['method' => $_SERVER['REQUEST_METHOD'] ?? '', 'uri' => $_SERVER['REQUEST_URI'] ?? '', 'headers' => $headers], JSON_UNESCAPED_SLASHES));

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
if (!$raw || trim($raw) === '') {
    wlog('RAW: [VAZIO]');
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'empty body']);
    exit;
}

wlog('RAW: ' . $raw);

$data = json_decode($raw, true);
if (!is_array($data)) {
    wlog('JSON INVALIDO');
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'invalid json']);
    exit;
}

$event       = $data['event'] ?? null;
$transaction = $data['transaction'] ?? null;

if (!is_array($transaction)) {
    wlog('SEM transaction NO PAYLOAD');
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'no transaction']);
    exit;
}

$status = $transaction['status'] ?? null;

// Only save when actually PAID
if (
    !in_array($event, ['TRANSACTION_PAID', 'TRANSACTION_COMPLETED'], true) &&
    $status !== 'COMPLETED'
) {
    wlog('IGNORADO (NAO PAGO): event=' . json_encode($event) . ' status=' . json_encode($status));
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'saved' => false, 'reason' => 'not paid yet']);
    exit;
}

$tid = $transaction['id'] ?? null;
if (!$tid || !is_string($tid)) {
    wlog('SEM transaction.id');
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'no transaction.id']);
    exit;
}

$tidClean = preg_replace('/[^a-zA-Z0-9_\-]/', '', $tid);
if ($tidClean === '') {
    wlog('transaction.id INVALIDO: ' . json_encode($tid));
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'invalid transaction.id']);
    exit;
}

$path = $DIR . '/' . $tidClean . '.json';
file_put_contents($path, $raw);
wlog('SALVO (PAGO): ' . $path);

http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => true, 'saved' => true, 'transactionId' => $tidClean], JSON_UNESCAPED_UNICODE);

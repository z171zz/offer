<?php
/**
 * Proxy SigiloPay - Gera PIX e verifica pagamento
 * POST => Cria transação PIX
 * GET ?check=1&tid=XXX => Verifica se foi pago (via arquivo local)
 * GET ?force_check=1&tid=XXX => Força verificação na API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

/* ========== CONFIG ========== */
$CONFIG = [
    'API_BASE'    => 'https://app.sigilopay.com.br/api/v1',
    'PUBLIC_KEY'  => 'sbck6bostinha_3i9zcuj3nr7ci5f9',
    'SECRET_KEY'  => 'eek1l57m7ao05mrw8paylvv1u640o022g8hfq27gch7ww089n3dlui3fvzzlthuy',
    'ENDPOINT'    => '/gateway/pix/receive',
    'CALLBACK_URL'=> '', // Set your webhook URL here for production
    'CLIENT'      => [
        'name'     => 'Cliente',
        'email'    => 'email@gmail.com',
        'phone'    => '00000000000',
        'document' => '21417470747',
    ],
];

$DIR = __DIR__ . '/../pagamentos';
if (!is_dir($DIR)) { mkdir($DIR, 0775, true); }

/* ========== CHECK PAYMENT (polling via local file) ========== */
if (isset($_GET['check']) && $_GET['check'] === '1') {
    $tid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['tid'] ?? '');
    if ($tid === '') { echo json_encode(['paid' => false]); exit; }
    $file = $DIR . '/' . $tid . '.json';
    echo json_encode(['paid' => is_file($file)]);
    exit;
}

/* ========== FORCE CHECK (via API) ========== */
if (isset($_GET['force_check']) && $_GET['force_check'] === '1') {
    $tid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['tid'] ?? '');
    if ($tid === '') { echo json_encode(['ok' => false, 'error' => 'TID invalido']); exit; }

    $url = rtrim($CONFIG['API_BASE'], '/') . '/gateway/transactions';
    $payload = json_encode(['transactionId' => $tid]);
    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'x-public-key: ' . $CONFIG['PUBLIC_KEY'],
        'x-secret-key: ' . $CONFIG['SECRET_KEY'],
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo json_encode([
        'ok' => ($httpCode >= 200 && $httpCode < 300),
        'statusCode' => $httpCode,
        'response' => json_decode($resp, true),
    ]);
    exit;
}

/* ========== CREATE PIX TRANSACTION (POST) ========== */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['amount'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing amount']);
        exit;
    }

    // Amount comes in cents from JS, convert to decimal for SigiloPay
    $amountCents = (int)$input['amount'];
    $amountDecimal = $amountCents / 100;

    $identifier = 'cashin_' . date('YmdHis') . '_' . bin2hex(random_bytes(3));

    // Use customer data from frontend or fallback to config
    $client = $CONFIG['CLIENT'];
    if (!empty($input['customer']['name'])) $client['name'] = $input['customer']['name'];
    if (!empty($input['customer']['email'])) $client['email'] = $input['customer']['email'];
    if (!empty($input['customer']['document'])) $client['document'] = $input['customer']['document'];

    $payload = [
        'identifier' => $identifier,
        'amount' => $amountDecimal,
        'client' => $client,
    ];

    if (!empty($CONFIG['CALLBACK_URL'])) {
        $payload['callbackUrl'] = $CONFIG['CALLBACK_URL'];
    }

    $url = rtrim($CONFIG['API_BASE'], '/') . $CONFIG['ENDPOINT'];
    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'x-public-key: ' . $CONFIG['PUBLIC_KEY'],
        'x-secret-key: ' . $CONFIG['SECRET_KEY'],
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($resp === false) {
        http_response_code(500);
        echo json_encode(['error' => 'API connection failed: ' . $curlErr]);
        exit;
    }

    $json = json_decode($resp, true);

    if ($httpCode < 200 || $httpCode >= 300) {
        http_response_code($httpCode);
        echo $resp;
        exit;
    }

    // Extract PIX data
    $pixCode = null;
    $qrImage = null;
    $transactionId = $json['transactionId'] ?? null;
    $orderUrl = null;
    $orderId = null;

    // Get order info
    if (isset($json['order']['url'])) {
        $orderUrl = $json['order']['url'];
    }
    if (isset($json['order']['id'])) {
        $orderId = $json['order']['id'];
    }

    // Try to get PIX code from initial response
    $pixNode = $json['pix'] ?? ($json['order']['pix'] ?? null);
    if (is_array($pixNode)) {
        $pixCode = $pixNode['code'] ?? $pixNode['payload'] ?? $pixNode['emv']
            ?? $pixNode['qrCode'] ?? $pixNode['qrcode'] ?? null;
        if ($pixCode === '') $pixCode = null;

        if (!empty($pixNode['base64'])) {
            $b64 = $pixNode['base64'];
            $qrImage = (strpos($b64, 'data:image') === 0) ? $b64 : 'data:image/png;base64,' . $b64;
        } elseif (!empty($pixNode['image'])) {
            $qrImage = $pixNode['image'];
        } elseif (!empty($pixNode['imageUrl'])) {
            $qrImage = $pixNode['imageUrl'];
        } elseif (!empty($pixNode['qrCodeImageUrl'])) {
            $qrImage = $pixNode['qrCodeImageUrl'];
        }
    }

    // If pix code is empty, poll the transaction API to get the real PIX EMV code
    if (!$pixCode && $transactionId) {
        $txUrl = rtrim($CONFIG['API_BASE'], '/') . '/gateway/transactions';
        $txHeaders = [
            'Content-Type: application/json',
            'Accept: application/json',
            'x-public-key: ' . $CONFIG['PUBLIC_KEY'],
            'x-secret-key: ' . $CONFIG['SECRET_KEY'],
        ];

        // Retry up to 3 times with 2s delay
        for ($attempt = 0; $attempt < 3 && !$pixCode; $attempt++) {
            if ($attempt > 0) sleep(2);

            $ch2 = curl_init($txUrl);
            curl_setopt_array($ch2, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(['transactionId' => $transactionId]),
                CURLOPT_HTTPHEADER => $txHeaders,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => true,
            ]);
            $txResp = curl_exec($ch2);
            curl_close($ch2);

            if ($txResp !== false) {
                $txJson = json_decode($txResp, true);
                if (is_array($txJson)) {
                    // Look for PIX code in transaction data
                    $txPix = $txJson['pix'] ?? ($txJson['transaction']['pix'] ?? ($txJson['order']['pix'] ?? null));
                    if (is_array($txPix)) {
                        $found = $txPix['code'] ?? $txPix['payload'] ?? $txPix['emv']
                            ?? $txPix['qrCode'] ?? $txPix['qrcode'] ?? null;
                        if ($found && $found !== '') {
                            $pixCode = $found;
                        }
                    }
                    // Also search recursively in the response for EMV pattern
                    if (!$pixCode) {
                        $flat = json_encode($txJson);
                        if (preg_match('/"(00020126[^"]{50,})"/', $flat, $m)) {
                            $pixCode = $m[1];
                        }
                    }
                    // Try to get QR image
                    if (!$qrImage && is_array($txPix)) {
                        if (!empty($txPix['base64'])) {
                            $b64 = $txPix['base64'];
                            $qrImage = (strpos($b64, 'data:image') === 0) ? $b64 : 'data:image/png;base64,' . $b64;
                        } elseif (!empty($txPix['image'])) {
                            $qrImage = $txPix['image'];
                        }
                    }
                }
            }
        }
    }

    // If still no code, try scraping the order page
    if (!$pixCode && $orderUrl) {
        $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "Accept: text/html\r\n"]]);
        $pageHtml = @file_get_contents($orderUrl, false, $ctx);
        if ($pageHtml !== false) {
            // Look for PIX EMV code patterns
            if (preg_match('/"(00020126[^"]{50,})"/', $pageHtml, $m)) {
                $pixCode = $m[1];
            } elseif (preg_match("/'(00020126[^']{50,})'/", $pageHtml, $m)) {
                $pixCode = $m[1];
            } elseif (preg_match('/>(00020126\S{50,})</', $pageHtml, $m)) {
                $pixCode = $m[1];
            }
        }
    }

    // Build QR from PIX code if we have it
    if ($pixCode && !$qrImage) {
        $qrImage = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' . urlencode($pixCode);
    }

    // Fallback: QR from order URL (for scanning), but don't set pixCode to URL
    if (!$qrImage && $orderUrl) {
        $qrImage = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' . urlencode($orderUrl);
    }

    echo json_encode([
        'success' => true,
        'transactionId' => $transactionId,
        'identifier' => $identifier,
        'pix_qr_code' => $pixCode,
        'qr_image' => $qrImage,
        'order_url' => $orderUrl,
        'raw' => $json,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['error' => 'Invalid request']);

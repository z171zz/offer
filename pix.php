<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$token = 'qj1YsxyIQdY1B9LMndaNnMqjhZgeF7s6Bdp6aNdVH2nKfzTFUkFqLBFLSttm';
$base = 'https://api.ironpayapp.com.br/api/public/v1';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $ch = curl_init($base . '/transactions?api_token=' . $token);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $input,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($code);
    echo $res;
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['hash'])) {
    $ch = curl_init($base . '/transactions/' . $_GET['hash'] . '?api_token=' . $token);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($code);
    echo $res;
} else {
    echo json_encode(['error' => 'Invalid request']);
}

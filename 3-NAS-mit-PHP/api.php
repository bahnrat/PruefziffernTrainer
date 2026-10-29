<?php
/*
 * Prüfziffer-Trainer – Speicher-Schnittstelle für ein NAS oder einen Webserver mit PHP.
 * Läuft ab PHP 7.0. Liegt zusammen mit index.html in einem Web-Ordner. Die Daten landen im Unterordner
 * „Pruefziffer-Daten“ (per .htaccess vor direktem Abruf geschützt).
 *
 *   GET  api.php?p=<datei>            lesen (404 = gibt es nicht)
 *   POST api.php?p=<datei>            schreiben (JSON im Rumpf)
 *   POST api.php?p=<datei>&delete=1   löschen
 *   GET  api.php?p=ping               Lebenszeichen
 */
declare(strict_types=1);

const MAX_BODY = 2 * 1024 * 1024;
$dataDir = __DIR__ . '/Pruefziffer-Daten';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

/** Nur Anfragen aus dem Heimnetz (privat, Loopback). */
function fromHomeNetwork(string $ip): bool {
    if ($ip === '::1' || strncmp($ip, '127.', 4) === 0) return true;
    if (strncmp($ip, '::ffff:', 7) === 0) $ip = substr($ip, 7);
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE) === false
        && filter_var($ip, FILTER_VALIDATE_IP) !== false;
}

function fail(int $code, string $msg) {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $msg;
    exit;
}

if (!fromHomeNetwork($_SERVER['REMOTE_ADDR'] ?? '')) fail(403, 'Nur im Heimnetz erreichbar');

$p = isset($_GET['p']) ? (string)$_GET['p'] : '';
if ($p === 'ping') {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'name' => 'NAS (PHP)', 'qr' => false, 'urls' => []]);
    exit;
}
if (!preg_match('~^(config\.json|users\.json|exams\.json|users/[0-9a-f]{16}\.json)$~', $p)) fail(400, 'Datei nicht erlaubt');

if (!is_dir($dataDir . '/users') && !@mkdir($dataDir . '/users', 0775, true)) fail(500, 'Datenordner lässt sich nicht anlegen – Schreibrechte des Web-Ordners prüfen');
if (!is_file($dataDir . '/.htaccess')) @file_put_contents($dataDir . '/.htaccess', "Require all denied\nDeny from all\n");
$path = $dataDir . '/' . $p;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if (!is_file($path)) fail(404, 'nicht vorhanden');
    header('Content-Type: application/json; charset=utf-8');
    readfile($path);
    exit;
}
if ($method !== 'POST') fail(405, 'Methode nicht erlaubt');

$lock = fopen($dataDir . '/.lock', 'c');
flock($lock, LOCK_EX);
if (($_GET['delete'] ?? '') === '1') {
    if (is_file($path) && !unlink($path)) fail(500, 'Löschen fehlgeschlagen');
    http_response_code(204);
    exit;
}
$body = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($body === false || strlen($body) > MAX_BODY || json_decode($body) === null) fail(400, 'Ungültige Daten');
// erst Hilfsdatei, dann austauschen – nie halb geschriebene Dateien
$tmp = $path . '.tmp';
if (file_put_contents($tmp, $body) === false || !rename($tmp, $path)) {
    @unlink($tmp);
    fail(500, 'Schreiben fehlgeschlagen – Schreibrechte prüfen');
}
http_response_code(204);

<?php
// /app/php_app/lib/response.php

function json_response($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function error_response(string $message, int $code = 400): void {
    json_response(['detail' => $message], $code);
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_fields(array $data, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($data[$f]) || $data[$f] === '' || $data[$f] === null) {
            error_response("Missing field: $f", 400);
        }
    }
}

function sanitize_str($v, int $max = 500): ?string {
    if ($v === null || $v === '') return null;
    $s = is_string($v) ? trim($v) : (string)$v;
    return mb_substr($s, 0, $max);
}

function sanitize_email($v): ?string {
    if (!$v) return null;
    $s = trim((string)$v);
    return filter_var($s, FILTER_VALIDATE_EMAIL) ? strtolower($s) : null;
}

function sanitize_float($v, float $default = 0): float {
    if ($v === null || $v === '') return $default;
    return (float)str_replace(',', '.', (string)$v);
}

function sanitize_int($v, int $default = 0): int {
    if ($v === null || $v === '') return $default;
    return (int)$v;
}

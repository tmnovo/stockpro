<?php
// /app/php_app/api/settings.php
require_once __DIR__ . '/../lib/auth.php';

function handle_settings(array $segs, string $method): void {
    if ($method === 'GET') { settings_get(); return; }
    if ($method === 'PUT') { settings_update(); return; }
    error_response('Method not allowed', 405);
}

function settings_get(): void {
    current_user();
    $stmt = db()->prepare('SELECT * FROM settings WHERE id = ?');
    $stmt->execute(['global']);
    $s = $stmt->fetch();
    if (!$s) {
        $s = ['id' => 'global', 'company_name' => 'ProdStock V1.1 Beta', 'company_logo' => null];
    }
    json_response($s);
}

function settings_update(): void {
    $u = require_admin();
    $d = read_json_body();
    $name = sanitize_str($d['company_name'] ?? null, 200);
    $logo = $d['company_logo'] ?? null;
    if ($logo && strlen($logo) > 2 * 1024 * 1024) error_response('Logo too large (max 2MB)', 400);
    db()->prepare('INSERT INTO settings (id, company_name, company_logo) VALUES ("global", ?, ?) ON DUPLICATE KEY UPDATE company_name = VALUES(company_name), company_logo = VALUES(company_logo)')
        ->execute([$name, $logo]);
    log_action($u, 'update', 'settings', 'global', 'Updated settings');
    settings_get();
}

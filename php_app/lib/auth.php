<?php
// /app/php_app/lib/auth.php - JWT + bcrypt + RBAC

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';

const JWT_ALG = 'HS256';
const ACCESS_TTL = 28800;     // 8 hours
const REFRESH_TTL = 604800;   // 7 days

function jwt_secret(): string {
    $cfg = require __DIR__ . '/../config/config.php';
    return $cfg['jwt_secret'];
}

function hash_pw(string $pw): string {
    return password_hash($pw, PASSWORD_BCRYPT);
}

function verify_pw(string $pw, string $hash): bool {
    return password_verify($pw, $hash);
}

function make_access_token(array $user): string {
    $payload = [
        'sub' => $user['id'],
        'email' => $user['email'],
        'role' => $user['role'],
        'type' => 'access',
        'exp' => time() + ACCESS_TTL,
    ];
    return JWT::encode($payload, jwt_secret(), JWT_ALG);
}

function make_refresh_token(string $user_id): string {
    $payload = [
        'sub' => $user_id,
        'type' => 'refresh',
        'exp' => time() + REFRESH_TTL,
    ];
    return JWT::encode($payload, jwt_secret(), JWT_ALG);
}

function set_auth_cookies(string $access, string $refresh): void {
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $opts_access = [
        'expires' => time() + ACCESS_TTL,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    $opts_refresh = array_merge($opts_access, ['expires' => time() + REFRESH_TTL]);
    setcookie('access_token', $access, $opts_access);
    setcookie('refresh_token', $refresh, $opts_refresh);
}

function clear_auth_cookies(): void {
    $opts = ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax'];
    setcookie('access_token', '', $opts);
    setcookie('refresh_token', '', $opts);
}

function get_token_from_request(): ?string {
    if (!empty($_COOKIE['access_token'])) return $_COOKIE['access_token'];
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (stripos($h, 'Bearer ') === 0) return substr($h, 7);
    return null;
}

function current_user(): array {
    $tok = get_token_from_request();
    if (!$tok) error_response('Not authenticated', 401);
    try {
        $payload = (array) JWT::decode($tok, new Key(jwt_secret(), JWT_ALG));
    } catch (Throwable $e) {
        error_response('Invalid or expired token', 401);
    }
    if (($payload['type'] ?? '') !== 'access') error_response('Invalid token type', 401);
    $stmt = db()->prepare('SELECT id, email, name, role, permissions, active, created_at FROM users WHERE id = ?');
    $stmt->execute([$payload['sub']]);
    $u = $stmt->fetch();
    if (!$u) error_response('User not found', 401);
    if (!$u['active']) error_response('Account inactive', 403);
    $u['permissions'] = $u['permissions'] ? json_decode($u['permissions'], true) : [];
    $u['active'] = (bool)$u['active'];
    return $u;
}

function require_admin(): array {
    $u = current_user();
    if ($u['role'] !== 'admin') error_response('Admin only', 403);
    return $u;
}

function DEFAULT_PERMISSIONS(string $role): array {
    $all = [
        'admin' => [
            'clients' => ['view','create','update','delete','import','export'],
            'products' => ['view','create','update','delete','import','export'],
            'suppliers' => ['view','create','update','delete'],
            'orders' => ['view','create','update','delete','pdf'],
            'users' => ['view','create','update','delete'],
            'logs' => ['view'],
            'settings' => ['view','update'],
        ],
        'warehouse' => [
            'clients' => ['view'],
            'products' => ['view'],
            'suppliers' => ['view'],
            'orders' => ['view','update','pdf'],
            'users' => [],
            'logs' => [],
            'settings' => ['view'],
        ],
        'seller' => [
            'clients' => ['view','create','update','export'],
            'products' => ['view'],
            'suppliers' => ['view'],
            'orders' => ['view','create','update'],
            'users' => [],
            'logs' => [],
            'settings' => ['view'],
        ],
    ];
    return $all[$role] ?? $all['seller'];
}

function require_permission(string $resource, string $action): array {
    $u = current_user();
    if ($u['role'] === 'admin') return $u;
    $perms = $u['permissions'][$resource] ?? [];
    if (!in_array($action, $perms, true)) error_response("Permission denied: $resource.$action", 403);
    return $u;
}

function log_action(array $user, string $action, string $entity, ?string $entity_id = null, ?string $details = null): void {
    try {
        $stmt = db()->prepare('INSERT INTO audit_logs (id, user_id, user_email, user_name, action, entity, entity_id, details, timestamp) VALUES (?,?,?,?,?,?,?,?,?)');
        $stmt->execute([uuid(), $user['id'] ?? null, $user['email'] ?? null, $user['name'] ?? null, $action, $entity, $entity_id, $details, now_utc()]);
    } catch (Throwable $e) { /* swallow */ }
}

function user_public(array $u): array {
    return [
        'id' => $u['id'],
        'email' => $u['email'],
        'name' => $u['name'],
        'role' => $u['role'],
        'permissions' => is_string($u['permissions'] ?? null) ? json_decode($u['permissions'], true) : ($u['permissions'] ?? []),
        'active' => (bool)($u['active'] ?? true),
        'created_at' => $u['created_at'] ?? null,
    ];
}

// Brute force
function check_brute_force(string $identifier): void {
    $stmt = db()->prepare('SELECT count, last_attempt FROM login_attempts WHERE identifier = ?');
    $stmt->execute([$identifier]);
    $rec = $stmt->fetch();
    if ($rec && $rec['count'] >= 5) {
        $last = strtotime($rec['last_attempt']);
        if ($last && (time() - $last) < 900) {
            error_response('Too many failed attempts. Try again later.', 429);
        }
        $reset = db()->prepare('UPDATE login_attempts SET count = 0 WHERE identifier = ?');
        $reset->execute([$identifier]);
    }
}

function record_failed_attempt(string $identifier): void {
    $stmt = db()->prepare('INSERT INTO login_attempts (identifier, count, last_attempt) VALUES (?,1,?) ON DUPLICATE KEY UPDATE count = count + 1, last_attempt = VALUES(last_attempt)');
    $stmt->execute([$identifier, now_utc()]);
}

function clear_attempts(string $identifier): void {
    $stmt = db()->prepare('DELETE FROM login_attempts WHERE identifier = ?');
    $stmt->execute([$identifier]);
}

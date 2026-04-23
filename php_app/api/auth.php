<?php
// /app/php_app/api/auth.php
require_once __DIR__ . '/../lib/auth.php';

function handle_auth(array $segs, string $method): void {
    $action = $segs[1] ?? '';
    if ($action === 'login' && $method === 'POST') { auth_login(); return; }
    if ($action === 'logout' && $method === 'POST') { auth_logout(); return; }
    if ($action === 'me' && $method === 'GET') { auth_me(); return; }
    if ($action === 'refresh' && $method === 'POST') { auth_refresh(); return; }
    if ($action === 'change-password' && $method === 'POST') { auth_change_pw(); return; }
    error_response('Not found', 404);
}

function auth_login(): void {
    $data = read_json_body();
    require_fields($data, ['email', 'password']);
    $email = strtolower(trim($data['email']));
    $identifier = 'email:' . $email;
    check_brute_force($identifier);
    $stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if (!$u || !verify_pw($data['password'], $u['password_hash'])) {
        record_failed_attempt($identifier);
        error_response('Invalid email or password', 401);
    }
    if (!$u['active']) error_response('Account inactive', 403);
    clear_attempts($identifier);
    $u['permissions'] = $u['permissions'] ? json_decode($u['permissions'], true) : [];
    set_auth_cookies(make_access_token($u), make_refresh_token($u['id']));
    log_action($u, 'login', 'auth', $u['id'], "User {$email} logged in");
    json_response(user_public($u));
}

function auth_logout(): void {
    $u = current_user();
    clear_auth_cookies();
    log_action($u, 'logout', 'auth', $u['id']);
    json_response(['ok' => true]);
}

function auth_me(): void {
    json_response(user_public(current_user()));
}

function auth_refresh(): void {
    $tok = $_COOKIE['refresh_token'] ?? null;
    if (!$tok) error_response('No refresh token', 401);
    try {
        $payload = (array) Firebase\JWT\JWT::decode($tok, new Firebase\JWT\Key(jwt_secret(), JWT_ALG));
    } catch (Throwable $e) { error_response('Invalid refresh token', 401); }
    if (($payload['type'] ?? '') !== 'refresh') error_response('Invalid token type', 401);
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$payload['sub']]);
    $u = $stmt->fetch();
    if (!$u || !$u['active']) error_response('User not found', 401);
    $access = make_access_token($u);
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie('access_token', $access, ['expires' => time() + ACCESS_TTL, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
    json_response(['ok' => true]);
}

function auth_change_pw(): void {
    $u = current_user();
    $data = read_json_body();
    require_fields($data, ['current_password', 'new_password']);
    if (strlen($data['new_password']) < 6) error_response('Password min 6 chars', 400);
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$u['id']]);
    $hash = $stmt->fetchColumn();
    if (!verify_pw($data['current_password'], $hash)) error_response('Current password is incorrect', 400);
    $upd = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $upd->execute([hash_pw($data['new_password']), $u['id']]);
    log_action($u, 'change_password', 'user', $u['id'], 'Password changed');
    json_response(['ok' => true]);
}

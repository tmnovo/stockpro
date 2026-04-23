<?php
// /app/php_app/api/users.php
require_once __DIR__ . '/../lib/auth.php';

function handle_users(array $segs, string $method): void {
    $id = $segs[1] ?? null;
    if ($id === null && $method === 'GET') { users_list(); return; }
    if ($id === null && $method === 'POST') { users_create(); return; }
    if ($id && $method === 'PUT') { users_update($id); return; }
    if ($id && $method === 'DELETE') { users_delete($id); return; }
    error_response('Not found', 404);
}

function users_list(): void {
    require_admin();
    $rows = db()->query('SELECT id, email, name, role, permissions, active, created_at FROM users ORDER BY name')->fetchAll();
    foreach ($rows as &$r) {
        $r['permissions'] = $r['permissions'] ? json_decode($r['permissions'], true) : [];
        $r['active'] = (bool)$r['active'];
    }
    json_response($rows);
}

function users_create(): void {
    $u = require_admin();
    $d = read_json_body();
    require_fields($d, ['email', 'password', 'name', 'role']);
    $email = strtolower(trim($d['email']));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) error_response('Invalid email', 400);
    if (strlen($d['password']) < 6) error_response('Password min 6 chars', 400);
    if (!in_array($d['role'], ['admin','warehouse','seller'], true)) error_response('Invalid role', 400);
    $ck = db()->prepare('SELECT id FROM users WHERE email = ?');
    $ck->execute([$email]);
    if ($ck->fetchColumn()) error_response('Email already registered', 400);
    $id = uuid();
    $perms = DEFAULT_PERMISSIONS($d['role']);
    db()->prepare('INSERT INTO users (id,email,name,password_hash,role,permissions,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
        ->execute([$id, $email, trim($d['name']), hash_pw($d['password']), $d['role'], json_encode($perms), now_utc()]);
    log_action($u, 'create', 'user', $id, "Created user {$email} ({$d['role']})");
    users_fetch_and_respond($id);
}

function users_update(string $id): void {
    $u = require_admin();
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $exist = $stmt->fetch();
    if (!$exist) error_response('User not found', 404);
    $d = read_json_body();
    $fields = []; $params = [];
    if (isset($d['name'])) { $fields[] = 'name = ?'; $params[] = sanitize_str($d['name'], 100); }
    if (isset($d['role'])) {
        if (!in_array($d['role'], ['admin','warehouse','seller'], true)) error_response('Invalid role', 400);
        $fields[] = 'role = ?'; $params[] = $d['role'];
        if (!isset($d['permissions'])) { $fields[] = 'permissions = ?'; $params[] = json_encode(DEFAULT_PERMISSIONS($d['role'])); }
    }
    if (isset($d['permissions']) && is_array($d['permissions'])) { $fields[] = 'permissions = ?'; $params[] = json_encode($d['permissions']); }
    if (isset($d['active'])) { $fields[] = 'active = ?'; $params[] = $d['active'] ? 1 : 0; }
    if (!empty($d['password'])) {
        if (strlen($d['password']) < 6) error_response('Password min 6 chars', 400);
        $fields[] = 'password_hash = ?'; $params[] = hash_pw($d['password']);
    }
    if ($fields) {
        $params[] = $id;
        db()->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
    }
    log_action($u, 'update', 'user', $id, "Updated user {$exist['email']}");
    users_fetch_and_respond($id);
}

function users_delete(string $id): void {
    $u = require_admin();
    if ($id === $u['id']) error_response('Cannot delete yourself', 400);
    $stmt = db()->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $email = $stmt->fetchColumn();
    if (!$email) error_response('User not found', 404);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    log_action($u, 'delete', 'user', $id, "Deleted user {$email}");
    json_response(['ok' => true]);
}

function users_fetch_and_respond(string $id): void {
    $stmt = db()->prepare('SELECT id, email, name, role, permissions, active, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    $u['permissions'] = $u['permissions'] ? json_decode($u['permissions'], true) : [];
    $u['active'] = (bool)$u['active'];
    json_response($u);
}

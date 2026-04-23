<?php
// /app/php_app/api/orders.php
require_once __DIR__ . '/../lib/auth.php';

function handle_orders(array $segs, string $method): void {
    $id = $segs[1] ?? null;
    if ($id === 'daily-pdf' && $method === 'GET') {
        require __DIR__ . '/pdf.php';
        pdf_orders_daily(); return;
    }
    if ($id === null && $method === 'GET') { orders_list(); return; }
    if ($id === null && $method === 'POST') { orders_create(); return; }
    if ($id && $method === 'GET') { orders_get($id); return; }
    if ($id && $method === 'PUT') { orders_update($id); return; }
    if ($id && $method === 'DELETE') { orders_delete($id); return; }
    error_response('Not found', 404);
}

function enrich_order(array $o): array {
    $pdo = db();
    $cstmt = $pdo->prepare('SELECT name, discount FROM clients WHERE id = ?');
    $cstmt->execute([$o['client_id']]);
    $c = $cstmt->fetch();
    $o['client_name'] = $c['name'] ?? 'Unknown';
    $istmt = $pdo->prepare("SELECT oi.*, p.name AS product_name, p.unit, p.supplier_id FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?");
    $istmt->execute([$o['id']]);
    $items = $istmt->fetchAll();
    $subtotal = 0;
    foreach ($items as &$it) {
        $it['quantity'] = (int)$it['quantity'];
        $it['price'] = (float)$it['price'];
        $it['subtotal'] = round($it['price'] * $it['quantity'], 2);
        $subtotal += $it['subtotal'];
    }
    $o['items'] = $items;
    $o['subtotal'] = round($subtotal, 2);
    $o['discount'] = (float)$o['discount'];
    $o['total'] = round($subtotal * (1 - $o['discount'] / 100), 2);
    return $o;
}

function orders_list(): void {
    require_permission('orders', 'view');
    $status = $_GET['status'] ?? null;
    $date = $_GET['delivery_date'] ?? null;
    $sql = 'SELECT * FROM orders';
    $w = []; $p = [];
    if ($status) { $w[] = 'status = ?'; $p[] = $status; }
    if ($date) { $w[] = 'delivery_date = ?'; $p[] = $date; }
    if ($w) $sql .= ' WHERE ' . implode(' AND ', $w);
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($p);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[] = enrich_order($r);
    json_response($out);
}

function orders_get(string $id): void {
    require_permission('orders', 'view');
    $stmt = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) error_response('Order not found', 404);
    json_response(enrich_order($r));
}

function orders_create(): void {
    $u = require_permission('orders', 'create');
    $d = read_json_body();
    require_fields($d, ['client_id', 'items']);
    if (!is_array($d['items']) || count($d['items']) < 1) error_response('At least one item required', 400);
    $cstmt = db()->prepare('SELECT discount FROM clients WHERE id = ?');
    $cstmt->execute([$d['client_id']]);
    $c = $cstmt->fetch();
    if (!$c) error_response('Client not found', 400);
    $discount = isset($d['discount']) ? sanitize_float($d['discount']) : (float)$c['discount'];
    $id = uuid(); $n = now_utc();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO orders (id,client_id,delivery_date,status,notes,discount,created_by,created_by_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id, $d['client_id'], $d['delivery_date'] ?? null, $d['status'] ?? 'pending', sanitize_str($d['notes'] ?? null, 10000), $discount, $u['id'], $u['name'], $n, $n]);
        $ins = $pdo->prepare('INSERT INTO order_items (id,order_id,product_id,quantity,price) VALUES (?,?,?,?,?)');
        $pstmt = $pdo->prepare('SELECT id, price FROM products WHERE id = ?');
        foreach ($d['items'] as $it) {
            $pstmt->execute([$it['product_id'] ?? null]);
            $p = $pstmt->fetch();
            if (!$p) throw new Exception("Product {$it['product_id']} not found");
            $price = isset($it['price']) && $it['price'] !== null ? (float)$it['price'] : (float)$p['price'];
            $ins->execute([uuid(), $id, $p['id'], max(1, (int)($it['quantity'] ?? 1)), $price]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_response('Failed to create order: ' . $e->getMessage(), 400);
    }
    log_action($u, 'create', 'order', $id, 'Created order with ' . count($d['items']) . ' items');
    orders_get($id);
}

function orders_update(string $id): void {
    $u = require_permission('orders', 'update');
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    $exist = $stmt->fetch();
    if (!$exist) error_response('Order not found', 404);
    $d = read_json_body();
    $pdo->beginTransaction();
    try {
        $fields = [];
        $params = [];
        if (isset($d['client_id'])) { $fields[] = 'client_id = ?'; $params[] = $d['client_id']; }
        if (array_key_exists('delivery_date', $d)) { $fields[] = 'delivery_date = ?'; $params[] = $d['delivery_date'] ?: null; }
        if (isset($d['status'])) { $fields[] = 'status = ?'; $params[] = $d['status']; }
        if (array_key_exists('notes', $d)) { $fields[] = 'notes = ?'; $params[] = sanitize_str($d['notes'], 10000); }
        if (isset($d['discount'])) { $fields[] = 'discount = ?'; $params[] = sanitize_float($d['discount']); }
        if ($fields) {
            $params[] = $id;
            $pdo->prepare('UPDATE orders SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        }
        if (isset($d['items']) && is_array($d['items'])) {
            $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$id]);
            $ins = $pdo->prepare('INSERT INTO order_items (id,order_id,product_id,quantity,price) VALUES (?,?,?,?,?)');
            $pstmt = $pdo->prepare('SELECT id, price FROM products WHERE id = ?');
            foreach ($d['items'] as $it) {
                $pstmt->execute([$it['product_id'] ?? null]);
                $p = $pstmt->fetch();
                if (!$p) throw new Exception('Product not found');
                $price = isset($it['price']) && $it['price'] !== null ? (float)$it['price'] : (float)$p['price'];
                $ins->execute([uuid(), $id, $p['id'], max(1, (int)($it['quantity'] ?? 1)), $price]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_response('Failed to update: ' . $e->getMessage(), 400);
    }
    log_action($u, 'update', 'order', $id, 'Updated order');
    orders_get($id);
}

function orders_delete(string $id): void {
    $u = require_permission('orders', 'delete');
    $stmt = db()->prepare('SELECT id FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) error_response('Order not found', 404);
    $del = db()->prepare('DELETE FROM orders WHERE id = ?');
    $del->execute([$id]);
    log_action($u, 'delete', 'order', $id, 'Deleted order');
    json_response(['ok' => true]);
}

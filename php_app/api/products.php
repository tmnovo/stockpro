<?php
// /app/php_app/api/products.php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/import_export.php';

function handle_products(array $segs, string $method): void {
    $id = $segs[1] ?? null;
    if ($id === 'import' && $method === 'POST') { products_import(); return; }
    if ($id === 'export' && $method === 'GET') { products_export(); return; }
    if ($id === null && $method === 'GET') { products_list(); return; }
    if ($id === null && $method === 'POST') { products_create(); return; }
    if ($id && $method === 'PUT') { products_update($id); return; }
    if ($id && $method === 'DELETE') { products_delete($id); return; }
    error_response('Not found', 404);
}

function products_list(): void {
    require_permission('products', 'view');
    $supplier = $_GET['supplier_id'] ?? null;
    $sql = "SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id";
    $params = [];
    if ($supplier) { $sql .= ' WHERE p.supplier_id = ?'; $params[] = $supplier; }
    $sql .= ' ORDER BY p.name';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['price'] = (float)$r['price']; $r['stock'] = (int)$r['stock']; }
    json_response($rows);
}

function prod_payload(array $d): array {
    return [
        'name' => sanitize_str($d['name'] ?? '', 200),
        'sku' => sanitize_str($d['sku'] ?? null, 100),
        'barcode' => sanitize_str($d['barcode'] ?? null, 100),
        'category' => sanitize_str($d['category'] ?? null, 100),
        'description' => sanitize_str($d['description'] ?? null, 10000),
        'price' => max(0, sanitize_float($d['price'] ?? 0)),
        'stock' => max(0, sanitize_int($d['stock'] ?? 0)),
        'unit' => sanitize_str($d['unit'] ?? 'un', 30) ?: 'un',
        'supplier_id' => !empty($d['supplier_id']) ? sanitize_str($d['supplier_id'], 36) : null,
    ];
}

function products_create(): void {
    $u = require_permission('products', 'create');
    $d = prod_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $id = uuid();
    $stmt = db()->prepare('INSERT INTO products (id,name,sku,barcode,category,description,price,stock,unit,supplier_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = now_utc();
    $stmt->execute([$id,$d['name'],$d['sku'],$d['barcode'],$d['category'],$d['description'],$d['price'],$d['stock'],$d['unit'],$d['supplier_id'],$n,$n]);
    log_action($u, 'create', 'product', $id, "Created product {$d['name']}");
    json_response(products_fetch($id));
}

function products_update(string $id): void {
    $u = require_permission('products', 'update');
    $stmt = db()->prepare('SELECT * FROM products WHERE id = ?');
    $stmt->execute([$id]);
    $exist = $stmt->fetch();
    if (!$exist) error_response('Product not found', 404);
    $d = prod_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $upd = db()->prepare('UPDATE products SET name=?,sku=?,barcode=?,category=?,description=?,price=?,stock=?,unit=?,supplier_id=? WHERE id=?');
    $upd->execute([$d['name'],$d['sku'],$d['barcode'],$d['category'],$d['description'],$d['price'],$d['stock'],$d['unit'],$d['supplier_id'],$id]);
    log_action($u, 'update', 'product', $id, "Updated product {$exist['name']}");
    json_response(products_fetch($id));
}

function products_fetch(string $id): array {
    $stmt = db()->prepare("SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?");
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    $r['price'] = (float)$r['price']; $r['stock'] = (int)$r['stock'];
    return $r;
}

function products_delete(string $id): void {
    $u = require_permission('products', 'delete');
    $stmt = db()->prepare('SELECT name FROM products WHERE id = ?');
    $stmt->execute([$id]);
    $name = $stmt->fetchColumn();
    if (!$name) error_response('Product not found', 404);
    try {
        $del = db()->prepare('DELETE FROM products WHERE id = ?');
        $del->execute([$id]);
    } catch (PDOException $e) {
        error_response('Cannot delete: product is in orders', 400);
    }
    log_action($u, 'delete', 'product', $id, "Deleted product {$name}");
    json_response(['ok' => true]);
}

function products_import(): void {
    $u = require_permission('products', 'import');
    if (empty($_FILES['file'])) error_response('No file uploaded', 400);
    $rows = parse_excel_or_csv($_FILES['file']['tmp_name'], $_FILES['file']['name']);
    $stmt = db()->prepare('INSERT INTO products (id,name,sku,barcode,category,description,price,stock,unit,supplier_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = now_utc();
    $inserted = 0; $skipped = 0;
    foreach ($rows as $r) {
        $name = trim((string)($r['name'] ?? $r['nome'] ?? $r['descrição_/_nome'] ?? $r['descricao_/_nome'] ?? $r['descrição'] ?? $r['descricao'] ?? ''));
        if (!$name) { $skipped++; continue; }
        $stmt->execute([
            uuid(), mb_substr($name, 0, 200),
            sanitize_str($r['sku'] ?? $r['código'] ?? $r['codigo'] ?? null, 100),
            sanitize_str($r['barcode'] ?? $r['código_de_barras_(ean)'] ?? $r['codigo_de_barras_(ean)'] ?? $r['ean'] ?? null, 100),
            sanitize_str($r['category'] ?? $r['família'] ?? $r['familia'] ?? $r['categoria'] ?? null, 100),
            sanitize_str($r['description'] ?? $r['descricao'] ?? null, 10000),
            sanitize_float($r['price'] ?? $r['preco'] ?? $r['preço'] ?? $r['preço_sem_iva'] ?? $r['preço_de_venda_iva_incluído'] ?? $r['preco_de_venda_iva_incluido'] ?? 0),
            sanitize_int($r['stock'] ?? $r['estoque'] ?? 0),
            sanitize_str($r['unit'] ?? $r['unidade'] ?? $r['uni.'] ?? $r['uni'] ?? 'un', 30) ?: 'un',
            null,
            $n, $n,
        ]);
        $inserted++;
    }
    log_action($u, 'import', 'product', null, "Imported {$inserted} products (skipped {$skipped})");
    json_response(['inserted' => $inserted, 'skipped' => $skipped]);
}

function products_export(): void {
    require_permission('products', 'export');
    $rows = db()->query("SELECT p.id, p.name, p.sku, p.barcode, p.category, p.description, p.price, p.stock, p.unit, s.name AS supplier FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.name")->fetchAll();
    export_xlsx('products.xlsx', 'Products', $rows);
}

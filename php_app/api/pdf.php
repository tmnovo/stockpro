<?php
// /app/php_app/api/pdf.php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../vendor/autoload.php';

function handle_pdf(array $segs, string $method): void {
    if ($method !== 'GET') error_response('Method not allowed', 405);
    $kind = $segs[1] ?? '';
    if ($kind === 'orders-daily') { pdf_orders_daily(); return; }
    if ($kind === 'clients') { pdf_clients(); return; }
    if ($kind === 'supplier') { pdf_supplier_products(); return; }
    error_response('Not found', 404);
}

function get_company(): array {
    $stmt = db()->prepare('SELECT * FROM settings WHERE id = ?');
    $stmt->execute(['global']);
    $s = $stmt->fetch();
    return [
        'name' => $s['company_name'] ?? 'Order Management',
        'logo' => $s['company_logo'] ?? null,
    ];
}

function new_pdf(string $title): TCPDF {
    $pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8', false);
    $pdf->SetCreator('Order Management');
    $pdf->SetAuthor('OMS');
    $pdf->SetTitle($title);
    $pdf->SetMargins(12, 22, 12);
    $pdf->SetHeaderMargin(5);
    $pdf->SetAutoPageBreak(true, 15);
    $pdf->setPrintHeader(false);
    $pdf->setPrintFooter(false);
    $pdf->AddPage();
    return $pdf;
}

function write_pdf_header(TCPDF $pdf, string $title, string $subtitle): void {
    $company = get_company();
    if (!empty($company['logo']) && str_starts_with($company['logo'], 'data:image')) {
        $parts = explode(',', $company['logo'], 2);
        if (count($parts) === 2) {
            $img = base64_decode($parts[1]);
            $ext = str_contains($parts[0], 'png') ? 'png' : (str_contains($parts[0], 'jpeg') || str_contains($parts[0], 'jpg') ? 'jpg' : 'png');
            $tmp = tempnam(sys_get_temp_dir(), 'lg') . '.' . $ext;
            file_put_contents($tmp, $img);
            try { $pdf->Image($tmp, 12, 10, 20, 0, '', '', 'T', false); } catch (Throwable $e) {}
            @unlink($tmp);
        }
    }
    $pdf->SetFont('dejavusans', 'B', 16);
    $pdf->SetTextColor(0, 82, 255);
    $pdf->SetXY(35, 10);
    $pdf->Cell(0, 8, $company['name'], 0, 1);
    $pdf->SetFont('dejavusans', '', 10);
    $pdf->SetTextColor(60, 60, 60);
    $pdf->SetX(35);
    $pdf->Cell(0, 5, $title, 0, 1);
    $pdf->SetX(35);
    $pdf->SetFont('dejavusans', '', 8);
    $pdf->SetTextColor(120, 120, 120);
    $pdf->Cell(0, 4, $subtitle . ' · Gerado: ' . date('Y-m-d H:i'), 0, 1);
    $pdf->Ln(6);
    $pdf->SetTextColor(0, 0, 0);
}

function table_style(TCPDF $pdf, array $headers, array $rows, array $widths, array $aligns = []): void {
    $pdf->SetFont('dejavusans', 'B', 9);
    $pdf->SetFillColor(0, 82, 255);
    $pdf->SetTextColor(255, 255, 255);
    foreach ($headers as $i => $h) {
        $pdf->Cell($widths[$i], 7, $h, 1, 0, 'L', true);
    }
    $pdf->Ln();
    $pdf->SetFont('dejavusans', '', 8);
    $pdf->SetTextColor(0, 0, 0);
    $fill = false;
    foreach ($rows as $row) {
        $pdf->SetFillColor(249, 249, 251);
        foreach ($row as $i => $v) {
            $a = $aligns[$i] ?? 'L';
            $pdf->Cell($widths[$i], 6, (string)$v, 'LR', 0, $a, $fill);
        }
        $pdf->Ln();
        $fill = !$fill;
    }
    $pdf->Cell(array_sum($widths), 0, '', 'T');
    $pdf->Ln(4);
}

function pdf_orders_daily(): void {
    $u = require_permission('orders', 'pdf');
    $date = $_GET['target_date'] ?? date('Y-m-d', strtotime('+1 day'));
    $pdo = db();
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE delivery_date = ? AND status <> 'cancelled' ORDER BY client_id");
    $stmt->execute([$date]);
    $orders = $stmt->fetchAll();

    // Aggregate product totals
    $productTotals = [];
    foreach ($orders as &$o) {
        $istmt = $pdo->prepare("SELECT oi.*, p.name AS product_name, p.unit FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?");
        $istmt->execute([$o['id']]);
        $items = $istmt->fetchAll();
        $o['items'] = $items;
        foreach ($items as $it) {
            $k = $it['product_name'];
            if (!isset($productTotals[$k])) $productTotals[$k] = ['qty' => 0, 'unit' => $it['unit'] ?? 'un'];
            $productTotals[$k]['qty'] += (int)$it['quantity'];
        }
        $cstmt = $pdo->prepare('SELECT name FROM clients WHERE id = ?');
        $cstmt->execute([$o['client_id']]);
        $o['client_name'] = $cstmt->fetchColumn() ?: 'Unknown';
    }

    $pdf = new_pdf("Encomendas do dia {$date}");
    write_pdf_header($pdf, "Relatório de Encomendas — Entrega: {$date}", count($orders) . ' encomendas');

    if (empty($orders)) {
        $pdf->SetFont('dejavusans', '', 11);
        $pdf->Cell(0, 10, 'Sem encomendas para a data seleccionada.', 0, 1);
    } else {
        $pdf->SetFont('dejavusans', 'B', 12);
        $pdf->Cell(0, 7, 'Resumo de Produtos', 0, 1);
        ksort($productTotals);
        $rows = [];
        foreach ($productTotals as $name => $info) $rows[] = [$name, $info['qty'], $info['unit']];
        table_style($pdf, ['Produto', 'Qtd Total', 'Unidade'], $rows, [110, 40, 36], ['L', 'R', 'L']);

        $pdf->SetFont('dejavusans', 'B', 12);
        $pdf->Cell(0, 7, 'Encomendas por Cliente', 0, 1);
        foreach ($orders as $o) {
            $subtotal = 0;
            foreach ($o['items'] as $it) $subtotal += (float)$it['price'] * (int)$it['quantity'];
            $total = $subtotal * (1 - ((float)$o['discount']) / 100);
            $pdf->SetFont('dejavusans', 'B', 9);
            $pdf->Cell(0, 5, "Cliente: {$o['client_name']}  ·  Estado: {$o['status']}  ·  Total: €" . number_format($total, 2, ',', '.') . ($o['discount'] > 0 ? ' (desconto ' . $o['discount'] . '%)' : ''), 0, 1);
            if (!empty($o['notes'])) {
                $pdf->SetFont('dejavusans', 'I', 8);
                $pdf->Cell(0, 4, 'Notas: ' . $o['notes'], 0, 1);
            }
            $rows = [];
            foreach ($o['items'] as $it) {
                $rows[] = [
                    $it['product_name'],
                    (int)$it['quantity'],
                    '€' . number_format((float)$it['price'], 2, ',', '.'),
                    '€' . number_format((float)$it['price'] * (int)$it['quantity'], 2, ',', '.'),
                ];
            }
            table_style($pdf, ['Produto', 'Qtd', 'Preço', 'Subtotal'], $rows, [100, 22, 30, 34], ['L', 'R', 'R', 'R']);
        }
    }
    log_action($u, 'pdf_export', 'order', null, "PDF diário para {$date}");
    output_pdf($pdf, "encomendas_{$date}.pdf");
}

function pdf_clients(): void {
    $u = require_permission('clients', 'export');
    $rows = db()->query('SELECT name, tax_id, phone, email, city, discount FROM clients ORDER BY name')->fetchAll();
    $pdf = new_pdf('Lista de Clientes');
    write_pdf_header($pdf, 'Lista de Clientes', count($rows) . ' clientes');
    $data = [];
    foreach ($rows as $r) $data[] = [$r['name'], $r['tax_id'] ?: '—', $r['phone'] ?: '—', $r['email'] ?: '—', $r['city'] ?: '—', ($r['discount'] > 0 ? number_format((float)$r['discount'], 1) . '%' : '—')];
    table_style($pdf, ['Nome', 'NIF', 'Telefone', 'Email', 'Localidade', 'Desc.'], $data, [55, 22, 25, 55, 28, 16], ['L','L','L','L','L','R']);
    log_action($u, 'pdf_export', 'client', null, 'PDF lista clientes');
    output_pdf($pdf, 'clientes.pdf');
}

function pdf_supplier_products(): void {
    $u = require_permission('products', 'export');
    $sid = $_GET['supplier_id'] ?? null;
    if (!$sid) error_response('supplier_id required', 400);
    $s = db()->prepare('SELECT * FROM suppliers WHERE id = ?');
    $s->execute([$sid]);
    $supp = $s->fetch();
    if (!$supp) error_response('Supplier not found', 404);
    $pstmt = db()->prepare('SELECT * FROM products WHERE supplier_id = ? ORDER BY name');
    $pstmt->execute([$sid]);
    $prods = $pstmt->fetchAll();

    $pdf = new_pdf("Produtos — {$supp['name']}");
    write_pdf_header($pdf, "Produtos do Fornecedor: {$supp['name']}", count($prods) . ' produtos · NIF: ' . ($supp['tax_id'] ?: '—'));
    $data = [];
    foreach ($prods as $p) {
        $data[] = [
            $p['sku'] ?: '—',
            $p['name'],
            $p['category'] ?: '—',
            '€' . number_format((float)$p['price'], 2, ',', '.'),
            (int)$p['stock'] . ' ' . ($p['unit'] ?: 'un'),
        ];
    }
    if (empty($data)) $data[] = ['—', 'Sem produtos', '—', '—', '—'];
    table_style($pdf, ['SKU', 'Produto', 'Categoria', 'Preço', 'Stock'], $data, [30, 75, 35, 20, 26], ['L','L','L','R','R']);
    log_action($u, 'pdf_export', 'supplier', $sid, "PDF produtos de {$supp['name']}");
    output_pdf($pdf, 'fornecedor_' . preg_replace('/[^a-z0-9]/i', '_', $supp['name']) . '.pdf');
}

function output_pdf(TCPDF $pdf, string $filename): void {
    while (ob_get_level()) ob_end_clean();
    $pdf->Output($filename, 'D');
    exit;
}

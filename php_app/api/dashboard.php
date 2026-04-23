<?php
// /app/php_app/api/dashboard.php
require_once __DIR__ . '/../lib/auth.php';

function handle_dashboard(array $segs, string $method): void {
    if ($method !== 'GET') error_response('Method not allowed', 405);
    current_user();
    $sub = $segs[1] ?? 'stats';
    if ($sub === 'stats') { dashboard_stats(); return; }
    error_response('Not found', 404);
}

function dashboard_stats(): void {
    $pdo = db();
    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));

    $totals = [
        'clients' => (int)$pdo->query('SELECT COUNT(*) FROM clients')->fetchColumn(),
        'products' => (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn(),
        'suppliers' => (int)$pdo->query('SELECT COUNT(*) FROM suppliers')->fetchColumn(),
        'orders' => (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(),
        'active_orders' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE status IN ('pending','in_progress')")->fetchColumn(),
    ];
    $tstmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE delivery_date = ? AND status <> 'cancelled'");
    $tstmt->execute([$tomorrow]);
    $totals['orders_tomorrow'] = (int)$tstmt->fetchColumn();

    // Active orders per client
    $perClient = $pdo->query("SELECT c.id AS client_id, c.name AS client_name, COUNT(o.id) AS count FROM clients c JOIN orders o ON o.client_id = c.id WHERE o.status IN ('pending','in_progress') GROUP BY c.id, c.name ORDER BY count DESC LIMIT 10")->fetchAll();
    foreach ($perClient as &$r) $r['count'] = (int)$r['count'];

    // Products going tomorrow
    $pstmt = $pdo->prepare("SELECT p.name AS product_name, SUM(oi.quantity) AS quantity FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE o.delivery_date = ? AND o.status <> 'cancelled' GROUP BY p.id, p.name ORDER BY quantity DESC LIMIT 15");
    $pstmt->execute([$tomorrow]);
    $productsTomorrow = $pstmt->fetchAll();
    foreach ($productsTomorrow as &$r) $r['quantity'] = (int)$r['quantity'];

    // Orders trend (last 7 days)
    $trend = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i day"));
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = ?");
        $stmt->execute([$d]);
        $trend[] = ['date' => $d, 'count' => (int)$stmt->fetchColumn()];
    }

    // Top selling products (last 30 days by quantity)
    $topProducts = $pdo->query("SELECT p.name AS product_name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.price) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND o.status <> 'cancelled' GROUP BY p.id, p.name ORDER BY quantity DESC LIMIT 10")->fetchAll();
    foreach ($topProducts as &$r) { $r['quantity'] = (int)$r['quantity']; $r['revenue'] = round((float)$r['revenue'], 2); }

    // Day with most orders (last 30 days)
    $dayStats = $pdo->query("SELECT DATE(created_at) AS day, COUNT(*) AS count FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY day ORDER BY count DESC LIMIT 1")->fetch();
    $busiestDay = $dayStats ? ['date' => $dayStats['day'], 'count' => (int)$dayStats['count']] : null;

    // Orders by weekday (last 90 days)
    $weekdayRaw = $pdo->query("SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS c FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) GROUP BY dow")->fetchAll();
    $weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    $byWeekday = [];
    $map = [];
    foreach ($weekdayRaw as $r) $map[(int)$r['dow']] = (int)$r['c'];
    for ($i = 1; $i <= 7; $i++) $byWeekday[] = ['day' => $weekdays[$i - 1], 'count' => $map[$i] ?? 0];

    // Revenue per supplier (last 30 days)
    $supplierRevenue = $pdo->query("SELECT COALESCE(s.name, '(Sem fornecedor)') AS supplier_name, SUM(oi.quantity * oi.price) AS revenue, SUM(oi.quantity) AS quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND o.status <> 'cancelled' GROUP BY s.id, s.name ORDER BY revenue DESC LIMIT 10")->fetchAll();
    foreach ($supplierRevenue as &$r) { $r['revenue'] = round((float)$r['revenue'], 2); $r['quantity'] = (int)$r['quantity']; }

    json_response([
        'totals' => $totals,
        'active_orders_per_client' => $perClient,
        'products_going_tomorrow' => $productsTomorrow,
        'orders_trend' => $trend,
        'top_products' => $topProducts,
        'busiest_day' => $busiestDay,
        'orders_by_weekday' => $byWeekday,
        'supplier_revenue' => $supplierRevenue,
    ]);
}

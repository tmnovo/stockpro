<?php
// /app/php_app/api/index.php - Main API router
// All endpoints prefixed by /api/ (handled by .htaccess rewrite)

// Check installation
if (!file_exists(__DIR__ . '/../config/config.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'Application not installed. Run install/index.php']);
    exit;
}

require_once __DIR__ . '/../lib/response.php';

// CORS
$cfg = require __DIR__ . '/../config/config.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_map('trim', explode(',', $cfg['cors_origins'] ?? ''));
if ($origin && (in_array('*', $allowed) || in_array($origin, $allowed))) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Parse path
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$base_pos = strpos($uri, '/api/');
$path = $base_pos !== false ? substr($uri, $base_pos + 5) : ltrim($uri, '/');
$path = trim($path, '/');
$segments = $path === '' ? [] : explode('/', $path);
$method = $_SERVER['REQUEST_METHOD'];

$resource = $segments[0] ?? '';

// Route to handler files
switch ($resource) {
    case '':
        json_response(['message' => 'ProdStock V1.1 Beta API', 'version' => '1.1-beta']);
    case 'auth':
        require __DIR__ . '/auth.php';
        handle_auth($segments, $method);
        break;
    case 'clients':
        require __DIR__ . '/clients.php';
        handle_clients($segments, $method);
        break;
    case 'products':
        require __DIR__ . '/products.php';
        handle_products($segments, $method);
        break;
    case 'suppliers':
        require __DIR__ . '/suppliers.php';
        handle_suppliers($segments, $method);
        break;
    case 'orders':
        require __DIR__ . '/orders.php';
        handle_orders($segments, $method);
        break;
    case 'users':
        require __DIR__ . '/users.php';
        handle_users($segments, $method);
        break;
    case 'logs':
        require __DIR__ . '/logs.php';
        handle_logs($segments, $method);
        break;
    case 'dashboard':
        require __DIR__ . '/dashboard.php';
        handle_dashboard($segments, $method);
        break;
    case 'settings':
        require __DIR__ . '/settings.php';
        handle_settings($segments, $method);
        break;
    case 'pdf':
        require __DIR__ . '/pdf.php';
        handle_pdf($segments, $method);
        break;
    default:
        error_response('Not found', 404);
}

<?php
// Router for PHP built-in server (development only; Apache uses .htaccess in production)
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/api(/|$)#', $uri)) {
    require __DIR__ . '/api/index.php';
    return true;
}
// Serve static files as-is
$file = __DIR__ . $uri;
if ($uri !== '/' && file_exists($file) && !is_dir($file)) return false;
return false;

<?php
// /app/php_app/install/seed_sample.php
// Called from installer. Expects $SEED_PDO variable (PDO instance).

require_once __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

/** @var PDO $SEED_PDO */
if (!isset($SEED_PDO)) { throw new Exception('No PDO passed to seed'); }

function seed_uuid(): string {
    $d = random_bytes(16); $d[6] = chr(ord($d[6]) & 0x0f | 0x40); $d[8] = chr(ord($d[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function seed_str($v, int $max = 500): ?string {
    if ($v === null || $v === '') return null;
    $s = is_string($v) ? trim($v) : (string)$v;
    return $s === '' ? null : mb_substr($s, 0, $max);
}

$now = gmdate('Y-m-d H:i:s');

// -- CLIENTES --
$clientsFile = __DIR__ . '/../data/LISTA_CLIENTES_EXCEL.xlsx';
$imported_c = 0;
if (file_exists($clientsFile)) {
    try {
        $ss = IOFactory::load($clientsFile);
        $data = $ss->getActiveSheet()->toArray(null, true, true, false);

        // Find header row: scan rows until we find one with "Nome" or "NIF"
        $headerIdx = -1; $headers = [];
        foreach ($data as $i => $row) {
            $lower = array_map(fn($x) => mb_strtolower(trim((string)$x)), $row);
            if (in_array('nome', $lower, true) || in_array('nif', $lower, true)) {
                $headerIdx = $i;
                $headers = $lower;
                break;
            }
        }

        if ($headerIdx >= 0) {
            $idx = fn($name) => array_search($name, $headers, true);
            $cName = $idx('nome');
            $cNif = $idx('nif');
            $cTel = $idx('telefone');
            $cMob = $idx('telemóvel');
            $cEmail = $idx('e-mail');
            $cAddr = $idx('morada');
            $cZip = $idx('código postal');
            $cCity = $idx('localidade');
            $cCountry = $idx('país/região');

            $stmt = $SEED_PDO->prepare('INSERT INTO clients (id,name,email,phone,address,tax_id,postal_code,city,country,notes,discount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)');
            for ($i = $headerIdx + 1; $i < count($data); $i++) {
                $row = $data[$i];
                $name = seed_str($cName !== false ? $row[$cName] ?? null : null, 200);
                if (!$name) continue;
                $phone = seed_str(($cMob !== false && !empty($row[$cMob])) ? $row[$cMob] : ($cTel !== false ? $row[$cTel] ?? null : null), 50);
                $stmt->execute([
                    seed_uuid(), $name,
                    seed_str($cEmail !== false ? $row[$cEmail] ?? null : null, 200),
                    $phone,
                    seed_str($cAddr !== false ? $row[$cAddr] ?? null : null, 500),
                    seed_str($cNif !== false ? $row[$cNif] ?? null : null, 50),
                    seed_str($cZip !== false ? $row[$cZip] ?? null : null, 20),
                    seed_str($cCity !== false ? $row[$cCity] ?? null : null, 100),
                    seed_str($cCountry !== false ? $row[$cCountry] ?? null : null, 100),
                    null, $now, $now,
                ]);
                $imported_c++;
            }
        }
    } catch (Throwable $e) { /* skip */ }
}

// -- SUPPLIERS + PRODUTOS --
// Create a default supplier for the products in the Excel
$supplierId = seed_uuid();
$SEED_PDO->prepare('INSERT INTO suppliers (id,name,email,phone,tax_id,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    ->execute([$supplierId, 'Fornecedor Principal', null, null, null, null, 'Fornecedor importado automaticamente', $now, $now]);

$prodsFile = __DIR__ . '/../data/PRODUTOS_EXCEL.xlsx';
$imported_p = 0;
if (file_exists($prodsFile)) {
    try {
        $ss = IOFactory::load($prodsFile);
        $data = $ss->getActiveSheet()->toArray(null, true, true, false);

        $headerIdx = -1; $headers = [];
        foreach ($data as $i => $row) {
            $lower = array_map(fn($x) => mb_strtolower(trim((string)$x)), $row);
            if (in_array('código', $lower, true) || in_array('descrição / nome', $lower, true) || in_array('descricao / nome', $lower, true)) {
                $headerIdx = $i; $headers = $lower; break;
            }
        }

        if ($headerIdx >= 0) {
            $idx = fn($name) => array_search($name, $headers, true);
            $cCod = $idx('código');
            $cEan = $idx('código de barras (ean)');
            $cCat = $idx('família');
            $cName = $idx('descrição / nome') !== false ? $idx('descrição / nome') : $idx('descricao / nome');
            $cUnit = $idx('uni.');
            $cPrice1 = $idx('preço sem iva');
            $cPrice2 = $idx('preço de venda iva incluído');

            $stmt = $SEED_PDO->prepare('INSERT INTO products (id,name,sku,barcode,category,description,price,stock,unit,supplier_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)');
            for ($i = $headerIdx + 1; $i < count($data); $i++) {
                $row = $data[$i];
                $name = seed_str($cName !== false ? $row[$cName] ?? null : null, 200);
                if (!$name) continue;
                $priceStr = $cPrice2 !== false && !empty($row[$cPrice2]) ? $row[$cPrice2] : ($cPrice1 !== false ? $row[$cPrice1] ?? 0 : 0);
                $price = (float)str_replace([',', ' €', '€'], ['.', '', ''], (string)$priceStr);
                if ($price < 0) $price = 0;
                $stmt->execute([
                    seed_uuid(), $name,
                    seed_str($cCod !== false ? $row[$cCod] ?? null : null, 100),
                    seed_str($cEan !== false ? $row[$cEan] ?? null : null, 100),
                    seed_str($cCat !== false ? $row[$cCat] ?? null : null, 100),
                    null, $price,
                    seed_str($cUnit !== false ? $row[$cUnit] ?? 'un' : 'un', 30) ?: 'un',
                    $supplierId, $now, $now,
                ]);
                $imported_p++;
            }
        }
    } catch (Throwable $e) { /* skip */ }
}

// Log to stdout (visible in installer error log if any)
error_log("Seed: imported {$imported_c} clients and {$imported_p} products");

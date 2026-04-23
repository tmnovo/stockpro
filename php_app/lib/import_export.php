<?php
// /app/php_app/lib/import_export.php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/response.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

function parse_excel_or_csv(string $path, string $filename): array {
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === 'csv') {
        $rows = [];
        if (($h = fopen($path, 'r')) !== false) {
            $headers = fgetcsv($h);
            if ($headers) {
                $headers = array_map(fn($x) => normalize_key($x), $headers);
                while (($r = fgetcsv($h)) !== false) {
                    $rows[] = array_combine($headers, array_pad($r, count($headers), null));
                }
            }
            fclose($h);
        }
        return $rows;
    }
    // xlsx / xls via PhpSpreadsheet
    try {
        $ss = IOFactory::load($path);
        $sheet = $ss->getActiveSheet();
        $data = $sheet->toArray(null, true, true, false);
    } catch (Throwable $e) { error_response('Failed to parse file: ' . $e->getMessage(), 400); }
    if (!$data) return [];
    // Use first non-empty row as header
    $headers = [];
    $startIdx = 0;
    foreach ($data as $i => $row) {
        $nonEmpty = array_filter($row, fn($x) => $x !== null && $x !== '');
        if (count($nonEmpty) >= 2) {
            $headers = array_map(fn($x) => normalize_key((string)$x), $row);
            $startIdx = $i + 1;
            break;
        }
    }
    if (!$headers) return [];
    $rows = [];
    for ($i = $startIdx; $i < count($data); $i++) {
        $vals = array_pad($data[$i], count($headers), null);
        $assoc = [];
        foreach ($headers as $idx => $h) {
            if ($h !== '') $assoc[$h] = $vals[$idx] ?? null;
        }
        // Skip completely empty rows
        if (count(array_filter($assoc, fn($x) => $x !== null && $x !== '')) > 0) {
            $rows[] = $assoc;
        }
    }
    return $rows;
}

function normalize_key(string $s): string {
    $s = strtolower(trim($s));
    $s = str_replace([' ', '-'], '_', $s);
    return $s;
}

function export_xlsx(string $filename, string $sheetName, array $rows): void {
    $ss = new Spreadsheet();
    $sh = $ss->getActiveSheet();
    $sh->setTitle($sheetName);
    if (empty($rows)) {
        $sh->setCellValue('A1', 'No data');
    } else {
        $headers = array_keys($rows[0]);
        foreach ($headers as $i => $h) {
            $sh->setCellValueByColumnAndRow($i + 1, 1, $h);
        }
        foreach ($rows as $ri => $r) {
            foreach ($headers as $ci => $h) {
                $sh->setCellValueByColumnAndRow($ci + 1, $ri + 2, $r[$h] ?? '');
            }
        }
    }
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: max-age=0');
    $w = new Xlsx($ss);
    $w->save('php://output');
    exit;
}

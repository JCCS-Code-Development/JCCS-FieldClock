<?php
// Shared between index.php and item.php.

const VENDOR_INVOICE_SELECT =
    'SELECT vi.*, v.name AS vendor_name, v.type AS vendor_type, v.address AS vendor_address,
            cr.check_number AS check_number, cr.status AS check_status
     FROM vendor_invoices vi
     JOIN vendors v ON v.id = vi.vendor_id
     LEFT JOIN check_registry cr ON cr.id = vi.check_id';

// PDF / image upload — same rules as contractor invoices, but the file is
// optional for vendors (a lot of vendor bills are just a line item).
function saveVendorInvoiceFile(array $file, int $vendorId): array {
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    $allowed  = ['application/pdf' => 'pdf', 'image/jpeg' => 'image', 'image/png' => 'image', 'image/webp' => 'image'];
    if (!array_key_exists($mimeType, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Only PDF and image files (JPEG, PNG, WEBP) are allowed']));
    }
    if ($file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        exit(json_encode(['error' => 'File must be under 10 MB']));
    }
    $ext       = $mimeType === 'application/pdf' ? 'pdf' : pathinfo($file['name'], PATHINFO_EXTENSION);
    $uploadDir = __DIR__ . '/../uploads/vendor-invoices/' . $vendorId . '/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
    $filename    = bin2hex(random_bytes(16)) . '.' . $ext;
    $destination = $uploadDir . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        http_response_code(500);
        exit(json_encode(['error' => 'Failed to save file']));
    }
    return [
        'file_path'          => 'uploads/vendor-invoices/' . $vendorId . '/' . $filename,
        'file_original_name' => sanitizeString($file['name']),
        'file_type'          => $allowed[$mimeType],
    ];
}

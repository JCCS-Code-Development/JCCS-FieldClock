<?php
/**
 * One-time VAPID key generator.
 * Run once via CLI: php generate-vapid.php
 * Add the output to api/config/config.php and .env
 */

$key     = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
$details = openssl_pkey_get_details($key);

$x = str_pad($details['ec']['x'], 32, "\x00", STR_PAD_LEFT);
$y = str_pad($details['ec']['y'], 32, "\x00", STR_PAD_LEFT);
$pub_raw   = "\x04" . $x . $y;
$pub_b64   = rtrim(strtr(base64_encode($pub_raw), '+/', '-_'), '=');

openssl_pkey_export($key, $priv_pem);

echo "=== Add to api/config/config.php ===\n";
echo "define('VAPID_PUBLIC_KEY',    '{$pub_b64}');\n";
echo "define('VAPID_PRIVATE_KEY_PEM', <<<'EOK'\n{$priv_pem}EOK);\n";
echo "define('VAPID_SUBJECT',       'mailto:juliannaccalle@jccs-services.com');\n\n";
echo "=== Add to .env ===\n";
echo "VITE_VAPID_PUBLIC_KEY={$pub_b64}\n";

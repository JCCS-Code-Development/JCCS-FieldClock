<?php
// Sends an email via SMTP (SSL port 465) — no external dependencies.
function sendEmail(string $to, string $toName, string $subject, string $body): bool {
    $socket = @fsockopen('ssl://' . SMTP_HOST, SMTP_PORT, $errno, $errstr, 10);
    if (!$socket) return false;

    // Read one or more response lines; return the last one
    $read = function () use ($socket): string {
        $out = '';
        while ($line = fgets($socket, 512)) {
            $out = $line;
            if (isset($line[3]) && $line[3] === ' ') break; // end of multi-line response
        }
        return $out;
    };
    $cmd = function (string $c) use ($socket, $read): string {
        fwrite($socket, $c . "\r\n");
        return $read();
    };

    $read();                                        // 220 greeting
    $cmd('EHLO ' . SMTP_HOST);                     // EHLO (reads multi-line; $read loops until final line)
    // Need to drain remaining EHLO lines
    // (already drained by the loop inside $read)

    $cmd('AUTH LOGIN');
    $cmd(base64_encode(SMTP_USER));
    $auth = $cmd(base64_encode(SMTP_PASS));
    if (strpos($auth, '235') === false) {
        fclose($socket);
        error_log("SMTP auth failed: $auth");
        return false;
    }

    $cmd('MAIL FROM:<' . FROM_EMAIL . '>');
    $cmd('RCPT TO:<' . $to . '>');
    $cmd('DATA');

    $headers  = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\n";
    $headers .= "To: $toName <$to>\r\n";
    $headers .= "Subject: $subject\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "X-Mailer: JCCS-FieldClock/1.0\r\n";

    $result = $cmd($headers . "\r\n" . $body . "\r\n.");
    $cmd('QUIT');
    fclose($socket);

    return strpos($result, '250') !== false;
}

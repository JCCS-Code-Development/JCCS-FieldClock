<?php
// FieldClock operates in Eastern Time. cPanel/MySQL may use a different
// server timezone (the production host has returned timestamps three hours
// behind Eastern), so make both PHP and every database session explicit.
// TIMESTAMP values remain stored by MySQL as UTC and are converted to/from
// Eastern Time for the application.
const FIELDCLOCK_TIMEZONE = 'America/New_York';
date_default_timezone_set(FIELDCLOCK_TIMEZONE);

function getPDO(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        // Integration tests run the real API against a disposable database.
        // Environment overrides keep that database isolated without changing
        // or copying the production-only config.php file.
        $env = static function (string $name, string $fallback): string {
            $value = getenv($name);
            return $value === false ? $fallback : $value;
        };

        $host = $env('FIELDCLOCK_DB_HOST', DB_HOST);
        $name = $env('FIELDCLOCK_DB_NAME', DB_NAME);
        $user = $env('FIELDCLOCK_DB_USER', DB_USER);
        $pass = $env('FIELDCLOCK_DB_PASS', DB_PASS);

        $pdo = new PDO(
            'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4',
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );

        // Use a numeric offset because many shared MySQL hosts do not load
        // named timezone tables. Recomputed on each connection so DST is
        // handled automatically (-04:00 in summer, -05:00 in winter).
        $offset = (new DateTimeImmutable('now', new DateTimeZone(FIELDCLOCK_TIMEZONE)))->format('P');
        $pdo->exec('SET time_zone = ' . $pdo->quote($offset));
    }
    return $pdo;
}

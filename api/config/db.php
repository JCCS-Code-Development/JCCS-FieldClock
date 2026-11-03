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

        // Prefer the NAMED zone. A numeric offset (-04:00 / -05:00) is applied
        // to EVERY stored value, so after a DST change all entries from the
        // other side of the change read one hour off (e.g. after Nov 1, an
        // Oct 30 8:00 AM clock-in showed as 7:00 AM). The named zone converts
        // each value with the rule in effect on that value's own date.
        try {
            $pdo->exec('SET time_zone = ' . $pdo->quote(FIELDCLOCK_TIMEZONE));
        } catch (PDOException $e) {
            // Host has no MySQL timezone tables loaded: fall back to today's
            // offset. Correct for current data, but values from before the
            // last DST change will display one hour off until tables load.
            error_log('FieldClock: MySQL timezone tables missing, falling back to numeric offset (DST-shifted history): ' . $e->getMessage());
            $offset = (new DateTimeImmutable('now', new DateTimeZone(FIELDCLOCK_TIMEZONE)))->format('P');
            $pdo->exec('SET time_zone = ' . $pdo->quote($offset));
        }
    }
    return $pdo;
}

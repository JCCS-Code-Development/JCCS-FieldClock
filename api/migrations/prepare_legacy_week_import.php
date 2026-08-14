<?php
// Build a one-week, idempotent FieldClock SQL import from the old JCCS app's
// time_logs.csv export. This generator never connects to or changes FieldClock.
//
// Example:
//   php api/migrations/prepare_legacy_week_import.php \
//     --input="$HOME/Downloads/time_logs.csv" \
//     --map="$HOME/Downloads/employee_crosscheck.csv" \
//     --start=2026-07-27 --end=2026-08-02

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('This script must be run from the command line.');
}

$options = getopt('', ['input:', 'map:', 'start:', 'end:', 'output-dir::', 'max-hours::', 'no-gps']);
$home = getenv('HOME') ?: dirname(__DIR__, 3);
$inputPath = $options['input'] ?? ($home . '/Downloads/time_logs.csv');
$mapPath = $options['map'] ?? ($home . '/Downloads/employee_crosscheck.csv');
$outputDir = $options['output-dir'] ?? ($home . '/Downloads');
$startDate = $options['start'] ?? null;
$endDate = $options['end'] ?? null;
$maxHours = isset($options['max-hours']) ? (float)$options['max-hours'] : 24.0;
$noGps = array_key_exists('no-gps', $options);

if (!$startDate || !$endDate) {
    fwrite(STDERR, "--start=YYYY-MM-DD and --end=YYYY-MM-DD are required.\n");
    exit(1);
}

foreach ([$startDate, $endDate] as $date) {
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        fwrite(STDERR, "Invalid date: $date\n");
        exit(1);
    }
}

$start = $startDate . ' 00:00:00';
$endExclusive = (new DateTimeImmutable($endDate . ' 00:00:00'))->modify('+1 day')->format('Y-m-d H:i:s');
if ($start >= $endExclusive) {
    fwrite(STDERR, "The end date must not be before the start date.\n");
    exit(1);
}

if (!is_file($inputPath) || !is_readable($inputPath)) {
    fwrite(STDERR, "Cannot read time-log export: $inputPath\n");
    exit(1);
}
if (!is_file($mapPath) || !is_readable($mapPath)) {
    fwrite(STDERR, "Cannot read employee crosscheck: $mapPath\n");
    exit(1);
}
if (!is_dir($outputDir) || !is_writable($outputDir)) {
    fwrite(STDERR, "Output directory is not writable: $outputDir\n");
    exit(1);
}

function openCsv(string $path): array {
    $handle = fopen($path, 'r');
    if ($handle === false) {
        throw new RuntimeException("Could not open $path");
    }
    $headers = fgetcsv($handle, 0, ',', '"', '\\');
    if (!is_array($headers)) {
        fclose($handle);
        throw new RuntimeException("Missing CSV header in $path");
    }
    return [$handle, array_flip($headers)];
}

function requireColumns(array $index, array $required, string $path): void {
    $missing = array_values(array_filter($required, fn(string $column): bool => !array_key_exists($column, $index)));
    if ($missing) {
        throw new RuntimeException("Missing columns in $path: " . implode(', ', $missing));
    }
}

function csvValue(array $row, array $index, string $column): ?string {
    $value = $row[$index[$column]] ?? null;
    if ($value === null || $value === '' || strtoupper($value) === 'NULL') {
        return null;
    }
    return $value;
}

function sqlText(?string $value): string {
    if ($value === null) {
        return 'NULL';
    }
    if ($value === '') {
        return "''";
    }
    return 'CONVERT(0x' . bin2hex($value) . ' USING utf8mb4)';
}

function sqlNumber(?string $value): string {
    if ($value === null) {
        return 'NULL';
    }
    if (!is_numeric($value)) {
        throw new RuntimeException("Expected a numeric CSV value, got: $value");
    }
    return $value;
}

function writeCsv(string $path, array $headers, array $rows): void {
    $handle = fopen($path, 'w');
    if ($handle === false) {
        throw new RuntimeException("Could not write $path");
    }
    fputcsv($handle, $headers, ',', '"', '\\');
    foreach ($rows as $row) {
        fputcsv($handle, $row, ',', '"', '\\');
    }
    fclose($handle);
}

try {
    // Use only hand-confirmed employee mappings. Adolfo was subsequently added
    // to FieldClock as an inactive historical employee, so his late-July hours
    // attach to that exact-name record.
    [$mapHandle, $mapIndex] = openCsv($mapPath);
    requireColumns($mapIndex, ['legacy_id', 'legacy_name', 'fieldclock_name', 'confidence'], $mapPath);
    $employeeMap = [];
    $legacyNames = [];
    while (($row = fgetcsv($mapHandle, 0, ',', '"', '\\')) !== false) {
        $legacyId = (int)($row[$mapIndex['legacy_id']] ?? 0);
        if (!$legacyId) {
            continue;
        }
        $legacyNames[$legacyId] = trim((string)($row[$mapIndex['legacy_name']] ?? ''));
        $target = trim((string)($row[$mapIndex['fieldclock_name']] ?? ''));
        $confidence = trim((string)($row[$mapIndex['confidence']] ?? ''));
        if ($confidence === 'confirmed' && $target !== '') {
            $employeeMap[$legacyId] = $target;
        }
    }
    fclose($mapHandle);
    $employeeMap[3] = 'Adolfo Salamanca';

    [$logHandle, $logIndex] = openCsv($inputPath);
    requireColumns($logIndex, ['id', 'user_id', 'type', 'event_time', 'lat', 'lng', 'notes', 'worked_hours'], $inputPath);
    $logsByUser = [];
    while (($row = fgetcsv($logHandle, 0, ',', '"', '\\')) !== false) {
        $userId = (int)($row[$logIndex['user_id']] ?? 0);
        $logId = (int)($row[$logIndex['id']] ?? 0);
        $type = strtoupper((string)($row[$logIndex['type']] ?? ''));
        $eventTime = (string)($row[$logIndex['event_time']] ?? '');
        if (!$userId || !$logId || !in_array($type, ['IN', 'OUT'], true) || $eventTime === '') {
            continue;
        }
        $logsByUser[$userId][] = [
            'id' => $logId,
            'type' => $type,
            'event_time' => $eventTime,
            'lat' => $noGps ? null : csvValue($row, $logIndex, 'lat'),
            'lng' => $noGps ? null : csvValue($row, $logIndex, 'lng'),
            'notes' => csvValue($row, $logIndex, 'notes'),
            'worked_hours' => csvValue($row, $logIndex, 'worked_hours'),
        ];
    }
    fclose($logHandle);

    $staged = [];
    $exceptions = [];
    foreach ($logsByUser as $legacyUserId => $logs) {
        usort($logs, fn(array $a, array $b): int => [$a['event_time'], $a['id']] <=> [$b['event_time'], $b['id']]);
        $pendingIn = null;
        foreach ($logs as $log) {
            if ($log['type'] === 'IN') {
                if ($pendingIn !== null && $pendingIn['event_time'] >= $start && $pendingIn['event_time'] < $endExclusive) {
                    $exceptions[] = [
                        $legacyUserId, $legacyNames[$legacyUserId] ?? '', $employeeMap[$legacyUserId] ?? '',
                        $pendingIn['id'], '', $pendingIn['event_time'], '', 'NO MATCHING OUT',
                    ];
                }
                $pendingIn = $log;
                continue;
            }

            if ($pendingIn === null) {
                if ($log['event_time'] >= $start && $log['event_time'] < $endExclusive) {
                    $exceptions[] = [
                        $legacyUserId, $legacyNames[$legacyUserId] ?? '', $employeeMap[$legacyUserId] ?? '',
                        '', $log['id'], '', $log['event_time'], 'OUT WITH NO MATCHING IN',
                    ];
                }
                continue;
            }

            $in = $pendingIn;
            $pendingIn = null;
            if ($in['event_time'] < $start || $in['event_time'] >= $endExclusive) {
                continue;
            }

            $seconds = strtotime($log['event_time'] . ' UTC') - strtotime($in['event_time'] . ' UTC');
            $hours = $seconds / 3600;
            if ($seconds <= 0 || $hours > $maxHours) {
                $exceptions[] = [
                    $legacyUserId, $legacyNames[$legacyUserId] ?? '', $employeeMap[$legacyUserId] ?? '',
                    $in['id'], $log['id'], $in['event_time'], $log['event_time'],
                    $seconds <= 0 ? 'NON-POSITIVE DURATION' : ('OVER ' . $maxHours . ' HOURS'),
                ];
                continue;
            }

            $targetName = $employeeMap[$legacyUserId] ?? null;
            if ($targetName === null) {
                $exceptions[] = [
                    $legacyUserId, $legacyNames[$legacyUserId] ?? '', '', $in['id'], $log['id'],
                    $in['event_time'], $log['event_time'], 'NO CONFIRMED FIELDCLOCK EMPLOYEE',
                ];
                continue;
            }

            $oldReportedHours = $log['worked_hours'] !== null ? (float)$log['worked_hours'] : null;
            $durationMatchesOldApp = $oldReportedHours === null || abs($oldReportedHours - round($hours, 2)) <= 0.02;
            if (!$durationMatchesOldApp) {
                $exceptions[] = [
                    $legacyUserId, $legacyNames[$legacyUserId] ?? '', $targetName, $in['id'], $log['id'],
                    $in['event_time'], $log['event_time'], 'OLD REPORTED HOURS DO NOT MATCH PUNCHES',
                ];
                continue;
            }

            $noteParts = ["Imported from old JCCS app weekly hours (legacy IN #{$in['id']} / OUT #{$log['id']})."];
            if ($in['notes'] !== null) {
                $noteParts[] = 'Clock-in note: ' . $in['notes'];
            }
            if ($log['notes'] !== null) {
                $noteParts[] = 'Clock-out note: ' . $log['notes'];
            }
            $importNotes = implode("\n", $noteParts);
            $sourceHash = hash('sha256', json_encode([
                $legacyUserId, $in['id'], $log['id'], $in['event_time'], $log['event_time'],
                $in['lat'], $in['lng'], $log['lat'], $log['lng'], $in['notes'], $log['notes'], $targetName,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            $staged[] = [
                'legacy_user_id' => $legacyUserId,
                'legacy_name' => $legacyNames[$legacyUserId] ?? ('Legacy user #' . $legacyUserId),
                'target_name' => $targetName,
                'in_id' => $in['id'],
                'out_id' => $log['id'],
                'clock_in' => $in['event_time'],
                'clock_out' => $log['event_time'],
                'start_lat' => $in['lat'],
                'start_lng' => $in['lng'],
                'end_lat' => $log['lat'],
                'end_lng' => $log['lng'],
                'notes' => $importNotes,
                'source_hash' => $sourceHash,
                'hours' => $hours,
                'rounded_minutes' => (int)round($seconds / 60),
                'warning' => $hours > 16 ? 'LONG OVERNIGHT SHIFT; OLD HOURS MATCH' : '',
            ];
        }

        if ($pendingIn !== null && $pendingIn['event_time'] >= $start && $pendingIn['event_time'] < $endExclusive) {
            $exceptions[] = [
                $legacyUserId, $legacyNames[$legacyUserId] ?? '', $employeeMap[$legacyUserId] ?? '',
                $pendingIn['id'], '', $pendingIn['event_time'], '', 'NO MATCHING OUT',
            ];
        }
    }

    usort($staged, fn(array $a, array $b): int => [$a['target_name'], $a['clock_in'], $a['in_id']] <=> [$b['target_name'], $b['clock_in'], $b['in_id']]);

    // A source overlap is ambiguous even before checking FieldClock. Exclude all
    // involved shifts instead of choosing one silently.
    $overlapIndexes = [];
    $byTarget = [];
    foreach ($staged as $index => $shift) {
        $byTarget[$shift['target_name']][] = $index;
    }
    foreach ($byTarget as $indexes) {
        $count = count($indexes);
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $left = $staged[$indexes[$i]];
                $right = $staged[$indexes[$j]];
                if ($right['clock_in'] >= $left['clock_out']) {
                    break;
                }
                if ($left['clock_in'] < $right['clock_out']) {
                    $overlapIndexes[$indexes[$i]] = true;
                    $overlapIndexes[$indexes[$j]] = true;
                }
            }
        }
    }
    if ($overlapIndexes) {
        $clean = [];
        foreach ($staged as $index => $shift) {
            if (!isset($overlapIndexes[$index])) {
                $clean[] = $shift;
                continue;
            }
            $exceptions[] = [
                $shift['legacy_user_id'], $shift['legacy_name'], $shift['target_name'],
                $shift['in_id'], $shift['out_id'], $shift['clock_in'], $shift['clock_out'], 'OVERLAPS ANOTHER SOURCE SHIFT',
            ];
        }
        $staged = $clean;
    }

    $slug = str_replace('-', '', $startDate) . '_' . str_replace('-', '', $endDate);
    $reviewPath = $outputDir . "/legacy_week_{$slug}_review.csv";
    $summaryPath = $outputDir . "/legacy_week_{$slug}_summary.csv";
    $exceptionsPath = $outputDir . "/legacy_week_{$slug}_exceptions.csv";
    $sqlPath = $outputDir . "/fieldclock_legacy_week_{$slug}_import_v2.sql";

    $reviewRows = array_map(fn(array $s): array => [
        $s['legacy_user_id'], $s['legacy_name'], $s['target_name'], $s['in_id'], $s['out_id'],
        $s['clock_in'], $s['clock_out'], round($s['hours'], 2), round($s['rounded_minutes'] / 60, 2), $s['warning'],
    ], $staged);
    writeCsv($reviewPath, [
        'legacy_user_id', 'legacy_name', 'fieldclock_name', 'legacy_in_id', 'legacy_out_id',
        'clock_in', 'clock_out', 'punch_hours', 'fieldclock_report_hours', 'warning',
    ], $reviewRows);

    $summaryByEmployee = [];
    foreach ($staged as $shift) {
        $name = $shift['target_name'];
        if (!isset($summaryByEmployee[$name])) {
            $summaryByEmployee[$name] = ['shifts' => 0, 'minutes' => 0, 'long' => 0];
        }
        $summaryByEmployee[$name]['shifts']++;
        $summaryByEmployee[$name]['minutes'] += $shift['rounded_minutes'];
        $summaryByEmployee[$name]['long'] += $shift['warning'] !== '' ? 1 : 0;
    }
    ksort($summaryByEmployee, SORT_NATURAL | SORT_FLAG_CASE);
    $summaryRows = [];
    foreach ($summaryByEmployee as $name => $totals) {
        $summaryRows[] = [
            $name, $startDate, $endDate, $totals['shifts'],
            round($totals['minutes'] / 60, 2), $totals['long'],
        ];
    }
    writeCsv($summaryPath, [
        'fieldclock_name', 'week_start', 'week_end', 'shifts', 'fieldclock_report_hours', 'long_shift_warnings',
    ], $summaryRows);
    writeCsv($exceptionsPath, [
        'legacy_user_id', 'legacy_name', 'fieldclock_name', 'legacy_in_id', 'legacy_out_id',
        'clock_in', 'clock_out', 'reason',
    ], $exceptions);

    // FieldClock's own DB sessions always SET time_zone to Eastern before
    // touching TIMESTAMP columns (see api/config/db.php) so start_time/end_time
    // round-trip correctly. phpMyAdmin's SQL-tab session does not, and its
    // default has been observed 3 hours behind Eastern on this host - so a
    // literal like '16:27:00' pasted there gets stored as if it meant 16:27 in
    // that other zone, then redisplayed 3 hours off once the app reads it back
    // in Eastern. Setting the session's time_zone explicitly at the top of this
    // script (same session the whole paste runs in) makes the literals land
    // correctly the first time - no separate correction pass needed after.
    $eastern = new DateTimeZone('America/New_York');
    $tzOffset = (new DateTimeImmutable($startDate, $eastern))->format('P');

    $sql = [];
    $sql[] = '-- FieldClock one-week legacy time import, revision 3 (MySQL + MariaDB)';
    $sql[] = "-- Source: time_logs.csv | Week: $startDate through $endDate";
    $sql[] = ($noGps ? '-- GPS excluded by request: start_lat/start_lng/end_lat/end_lng are always NULL below.' : '-- Includes GPS lat/lng from the source punches.');
    $sql[] = '-- Generated review-first. Re-running is safe; source punch IDs are unique.';
    $sql[] = '-- The procedure aborts before inserting if a target employee is missing/duplicated,';
    $sql[] = '-- Oficina is missing, or any untracked FieldClock entry overlaps these shifts.';
    $sql[] = '';
    $sql[] = '-- Pin this session to Eastern time (matches FieldClock\'s app sessions) so the';
    $sql[] = '-- TIMESTAMP literals below land correctly without a follow-up timezone correction.';
    $sql[] = "SET time_zone = '" . $tzOffset . "';";
    $sql[] = '';
    $sql[] = 'CREATE TABLE IF NOT EXISTS `legacy_time_entry_imports` (';
    $sql[] = '  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,';
    $sql[] = '  `source_system` VARCHAR(64) NOT NULL,';
    $sql[] = '  `legacy_in_log_id` BIGINT UNSIGNED NOT NULL,';
    $sql[] = '  `legacy_out_log_id` BIGINT UNSIGNED NOT NULL,';
    $sql[] = '  `legacy_user_id` INT UNSIGNED NOT NULL,';
    $sql[] = '  `time_entry_id` INT UNSIGNED NOT NULL,';
    $sql[] = '  `source_hash` CHAR(64) NOT NULL,';
    $sql[] = '  `imported_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,';
    $sql[] = '  PRIMARY KEY (`id`),';
    $sql[] = '  UNIQUE KEY `uq_legacy_time_in` (`source_system`, `legacy_in_log_id`),';
    $sql[] = '  UNIQUE KEY `uq_legacy_time_out` (`source_system`, `legacy_out_log_id`),';
    $sql[] = '  UNIQUE KEY `uq_legacy_time_entry` (`time_entry_id`)';
    $sql[] = ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';
    $sql[] = '';
    $sql[] = 'DROP TEMPORARY TABLE IF EXISTS `tmp_legacy_week_hours`;';
    $sql[] = 'CREATE TEMPORARY TABLE `tmp_legacy_week_hours` (';
    $sql[] = '  `legacy_user_id` INT UNSIGNED NOT NULL,';
    $sql[] = '  `legacy_name` VARCHAR(120) NOT NULL,';
    $sql[] = '  `target_user_name` VARCHAR(120) NOT NULL,';
    $sql[] = '  `legacy_in_id` BIGINT UNSIGNED NOT NULL,';
    $sql[] = '  `legacy_out_id` BIGINT UNSIGNED NOT NULL,';
    $sql[] = '  `clock_in` DATETIME NOT NULL,';
    $sql[] = '  `clock_out` DATETIME NOT NULL,';
    $sql[] = '  `start_lat` DECIMAL(10,7) NULL,';
    $sql[] = '  `start_lng` DECIMAL(10,7) NULL,';
    $sql[] = '  `end_lat` DECIMAL(10,7) NULL,';
    $sql[] = '  `end_lng` DECIMAL(10,7) NULL,';
    $sql[] = '  `notes` TEXT NOT NULL,';
    $sql[] = '  `source_hash` CHAR(64) NOT NULL,';
    $sql[] = '  PRIMARY KEY (`legacy_in_id`),';
    $sql[] = '  UNIQUE KEY `uq_tmp_out` (`legacy_out_id`)';
    $sql[] = ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';
    $sql[] = '';

    foreach (array_chunk($staged, 75) as $chunk) {
        $sql[] = 'INSERT INTO `tmp_legacy_week_hours`';
        $sql[] = '(`legacy_user_id`, `legacy_name`, `target_user_name`, `legacy_in_id`, `legacy_out_id`, `clock_in`, `clock_out`, `start_lat`, `start_lng`, `end_lat`, `end_lng`, `notes`, `source_hash`) VALUES';
        $values = [];
        foreach ($chunk as $s) {
            $values[] = sprintf(
                '(%d,%s,%s,%d,%d,%s,%s,%s,%s,%s,%s,%s,%s)',
                $s['legacy_user_id'], sqlText($s['legacy_name']), sqlText($s['target_name']),
                $s['in_id'], $s['out_id'], sqlText($s['clock_in']), sqlText($s['clock_out']),
                sqlNumber($s['start_lat']), sqlNumber($s['start_lng']), sqlNumber($s['end_lat']), sqlNumber($s['end_lng']),
                sqlText($s['notes']), sqlText($s['source_hash'])
            );
        }
        $sql[] = implode(",\n", $values) . ';';
        $sql[] = '';
    }

    $procedureName = 'import_legacy_week_' . $slug;
    $sql[] = 'DELIMITER $$';
    $sql[] = "DROP PROCEDURE IF EXISTS `$procedureName`$$";
    $sql[] = "CREATE PROCEDURE `$procedureName`()";
    $sql[] = 'BEGIN';
    $sql[] = '  DECLARE v_done INT DEFAULT 0;';
    $sql[] = '  DECLARE v_legacy_user_id INT UNSIGNED;';
    $sql[] = '  DECLARE v_legacy_in_id BIGINT UNSIGNED;';
    $sql[] = '  DECLARE v_legacy_out_id BIGINT UNSIGNED;';
    $sql[] = '  DECLARE v_target_name VARCHAR(120);';
    $sql[] = '  DECLARE v_clock_in DATETIME;';
    $sql[] = '  DECLARE v_clock_out DATETIME;';
    $sql[] = '  DECLARE v_start_lat DECIMAL(10,7);';
    $sql[] = '  DECLARE v_start_lng DECIMAL(10,7);';
    $sql[] = '  DECLARE v_end_lat DECIMAL(10,7);';
    $sql[] = '  DECLARE v_end_lng DECIMAL(10,7);';
    $sql[] = '  DECLARE v_notes TEXT;';
    $sql[] = '  DECLARE v_source_hash CHAR(64);';
    $sql[] = '  DECLARE v_user_id INT UNSIGNED;';
    $sql[] = '  DECLARE v_job_id INT UNSIGNED;';
    $sql[] = '  DECLARE v_entry_id INT UNSIGNED;';
    $sql[] = '  DECLARE shift_cursor CURSOR FOR';
    $sql[] = '    SELECT s.legacy_user_id, s.legacy_in_id, s.legacy_out_id, s.target_user_name, s.clock_in, s.clock_out,';
    $sql[] = '           s.start_lat, s.start_lng, s.end_lat, s.end_lng, s.notes, s.source_hash, u.id,';
    $sql[] = "           IF(s.target_user_name IN ('Juliana Restrepo', 'Julianna Camila Calle'),";
    $sql[] = "              (SELECT MIN(id) FROM jobs WHERE HEX(name) = HEX('Oficina')), NULL)";
    $sql[] = '    FROM tmp_legacy_week_hours s';
    $sql[] = '    JOIN users u ON HEX(u.name) = HEX(s.target_user_name)';
    $sql[] = '    ORDER BY s.target_user_name, s.clock_in, s.legacy_in_id;';
    $sql[] = '  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;';
    $sql[] = '  DECLARE EXIT HANDLER FOR SQLEXCEPTION';
    $sql[] = '  BEGIN';
    $sql[] = '    ROLLBACK;';
    $sql[] = '    RESIGNAL;';
    $sql[] = '  END;';
    $sql[] = '';
    $sql[] = '  IF EXISTS (';
    $sql[] = '    SELECT s.target_user_name';
    $sql[] = '    FROM tmp_legacy_week_hours s LEFT JOIN users u ON HEX(u.name) = HEX(s.target_user_name)';
    $sql[] = '    GROUP BY s.target_user_name HAVING COUNT(DISTINCT u.id) <> 1';
    $sql[] = '  ) THEN';
    $sql[] = "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Import stopped: a FieldClock employee is missing or duplicated';";
    $sql[] = '  END IF;';
    $sql[] = '';
    $sql[] = "  IF EXISTS (SELECT 1 FROM tmp_legacy_week_hours WHERE target_user_name IN ('Juliana Restrepo', 'Julianna Camila Calle'))";
    $sql[] = "     AND (SELECT COUNT(*) FROM jobs WHERE HEX(name) = HEX('Oficina')) <> 1 THEN";
    $sql[] = "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Import stopped: exactly one Oficina job is required';";
    $sql[] = '  END IF;';
    $sql[] = '';
    $sql[] = '  IF EXISTS (';
    $sql[] = '    SELECT 1';
    $sql[] = '    FROM tmp_legacy_week_hours s';
    $sql[] = '    JOIN users u ON HEX(u.name) = HEX(s.target_user_name)';
    $sql[] = '    JOIN time_entries te ON te.user_id = u.id';
    $sql[] = "      AND COALESCE(te.cost_category, '') <> 'day_end'";
    $sql[] = '      AND te.start_time < s.clock_out';
    $sql[] = '      AND (te.end_time IS NULL OR te.end_time > s.clock_in)';
    $sql[] = '    LEFT JOIN legacy_time_entry_imports li';
    $sql[] = "      ON li.source_system = 'old_jccs_time_logs'";
    $sql[] = '      AND li.legacy_in_log_id = s.legacy_in_id';
    $sql[] = '      AND li.legacy_out_log_id = s.legacy_out_id';
    $sql[] = '      AND li.time_entry_id = te.id';
    $sql[] = '    WHERE li.id IS NULL';
    $sql[] = '  ) THEN';
    $sql[] = "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Import stopped: existing FieldClock time overlaps this legacy week';";
    $sql[] = '  END IF;';
    $sql[] = '';
    $sql[] = '  START TRANSACTION;';
    $sql[] = '  OPEN shift_cursor;';
    $sql[] = '  import_loop: LOOP';
    $sql[] = '    FETCH shift_cursor INTO v_legacy_user_id, v_legacy_in_id, v_legacy_out_id, v_target_name,';
    $sql[] = '      v_clock_in, v_clock_out, v_start_lat, v_start_lng, v_end_lat, v_end_lng, v_notes, v_source_hash,';
    $sql[] = '      v_user_id, v_job_id;';
    $sql[] = '    IF v_done = 1 THEN LEAVE import_loop; END IF;';
    $sql[] = '';
    $sql[] = "    IF NOT EXISTS (SELECT 1 FROM legacy_time_entry_imports WHERE source_system = 'old_jccs_time_logs' AND legacy_in_log_id = v_legacy_in_id) THEN";
    $sql[] = '      INSERT INTO time_entries';
    $sql[] = '        (user_id, created_by, created_via, job_id, status_label, cost_category, start_time, end_time,';
    $sql[] = '         start_lat, start_lng, end_lat, end_lng, approval_status, approved_by, approved_at, notes)';
    $sql[] = "      VALUES (v_user_id, NULL, 'legacy_week_import', v_job_id, 'working', 'direct_labor', v_clock_in, v_clock_out,";
    $sql[] = "              v_start_lat, v_start_lng, v_end_lat, v_end_lng, 'approved', NULL, NOW(), v_notes);";
    $sql[] = '      SET v_entry_id = LAST_INSERT_ID();';
    $sql[] = '';
    $sql[] = '      INSERT INTO time_entry_history (entry_id, action, changed_by, source, old_values, new_values)';
    $sql[] = "      SELECT te.id, 'create', NULL, 'legacy_week_import', NULL,";
    $sql[] = "             JSON_OBJECT('id', te.id, 'user_id', te.user_id, 'job_id', te.job_id,";
    $sql[] = "               'created_via', te.created_via, 'status_label', te.status_label,";
    $sql[] = "               'cost_category', te.cost_category, 'start_time', te.start_time,";
    $sql[] = "               'end_time', te.end_time, 'approval_status', te.approval_status, 'notes', te.notes)";
    $sql[] = '      FROM time_entries te WHERE te.id = v_entry_id;';
    $sql[] = '';
    $sql[] = '      INSERT INTO legacy_time_entry_imports';
    $sql[] = '        (source_system, legacy_in_log_id, legacy_out_log_id, legacy_user_id, time_entry_id, source_hash)';
    $sql[] = "      VALUES ('old_jccs_time_logs', v_legacy_in_id, v_legacy_out_id, v_legacy_user_id, v_entry_id, v_source_hash);";
    $sql[] = '    END IF;';
    $sql[] = '  END LOOP;';
    $sql[] = '  CLOSE shift_cursor;';
    $sql[] = '  COMMIT;';
    $sql[] = 'END$$';
    $sql[] = 'DELIMITER ;';
    $sql[] = '';
    $sql[] = "CALL `$procedureName`();";
    $sql[] = "DROP PROCEDURE `$procedureName`;";
    $sql[] = 'SELECT COUNT(*) AS tracked_imported_shifts';
    $sql[] = "FROM legacy_time_entry_imports WHERE source_system = 'old_jccs_time_logs'";
    $sql[] = '  AND legacy_in_log_id IN (SELECT legacy_in_id FROM tmp_legacy_week_hours);';
    $sql[] = 'DROP TEMPORARY TABLE `tmp_legacy_week_hours`;';
    $sql[] = '';

    file_put_contents($sqlPath, implode("\n", $sql));

    $totalMinutes = array_sum(array_column($staged, 'rounded_minutes'));
    $longCount = count(array_filter($staged, fn(array $s): bool => $s['warning'] !== ''));
    echo "Prepared week $startDate through $endDate\n";
    echo 'GPS data: ' . ($noGps ? 'excluded (NULL in review + SQL)' : 'included') . "\n";
    echo 'Importable shifts: ' . count($staged) . "\n";
    echo 'FieldClock rounded hours: ' . number_format($totalMinutes / 60, 2) . "\n";
    echo "Long overnight shifts retained for review: $longCount\n";
    echo 'Excluded exceptions: ' . count($exceptions) . "\n";
    echo "Review: $reviewPath\n";
    echo "Summary: $summaryPath\n";
    echo "Exceptions: $exceptionsPath\n";
    echo "SQL import: $sqlPath\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}

<?php
// Closes every lunch/dinner that has run past the 1-hour cap, even when
// nobody has the app open. CLI only (cPanel → Cron Jobs), e.g. every 5 min:
//   */5 * * * * /usr/local/bin/php /home/vm3xrrup9tqw/public_html/fieldclock/api/timeclock/cron-meal-cutoff.php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/_helper.php';

enforceOverdueMealCutoffsForAll(getPDO());

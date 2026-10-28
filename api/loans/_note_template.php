<?php
// Loan pagaré (promissory note) text — the single source of truth for what a
// borrower reads and signs. The server renders it (never the client) and
// stores the exact text in loan_notes, so the stored hash always matches what
// was on screen. Two variants: 'w2' (installments sent by Zelle to the owner;
// wages only touched as a late-payment fallback or on separation) and '1099'
// (installments withheld from the weekly payment for services). Both are
// rendered in English and Spanish; the borrower signs in their app language.
//
// Wording follows the South Carolina decisions in
// ~/.claude/plans/fieldclock-loan-pagare.md (SC Payment of Wages Act: written
// notice of deductions, 7 days' notice before a change). Any change to this
// text should be re-reviewed by the attorney before it's used.

const LOAN_LENDER_NAME     = 'JCCS Services LLC';
const LOAN_ZELLE_RECIPIENT = 'Laura Garcia';
const LOAN_FEDERAL_MIN_WAGE = 7.25;

// Weekly schedule: full installments of $weekly, the last one absorbing
// whatever is left so the total is exactly $principal.
function buildLoanSchedule(float $principal, float $weekly, string $firstDueDate): array {
    $schedule  = [];
    $remaining = round($principal, 2);
    $date      = new DateTimeImmutable($firstDueDate);
    while ($remaining > 0.004) {
        $amt = min($weekly, $remaining);
        $schedule[] = ['date' => $date->format('Y-m-d'), 'amount' => round($amt, 2)];
        $remaining  = round($remaining - $amt, 2);
        $date       = $date->modify('+7 days');
    }
    return $schedule;
}

function loanNoteMoney(float $n): string {
    return '$' . number_format($n, 2);
}

function loanNoteDate(string $ymd, string $lang): string {
    $d = new DateTimeImmutable($ymd);
    if ($lang === 'es') {
        $months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        return $d->format('j') . ' de ' . $months[(int)$d->format('n') - 1] . ' de ' . $d->format('Y');
    }
    return $d->format('F j, Y');
}

// $t keys: note_number, note_date (Y-m-d), kind ('original'|'amendment'|'repaper'),
// borrower_name, principal, weekly, first_due_date, variant ('w2'|'1099'),
// and for 'repaper'/'amendment': original_date, original_amount.
function renderLoanNote(array $t, string $lang): string {
    $es       = $lang === 'es';
    $is1099   = $t['variant'] === '1099';
    $schedule = buildLoanSchedule((float)$t['principal'], (float)$t['weekly'], $t['first_due_date']);
    $n        = count($schedule);
    $last     = end($schedule)['amount'];
    $money    = fn($v) => loanNoteMoney((float)$v);
    $date     = fn($v) => loanNoteDate($v, $lang);
    $lender   = LOAN_LENDER_NAME;
    $zelle    = LOAN_ZELLE_RECIPIENT;
    $minWage  = loanNoteMoney(LOAN_FEDERAL_MIN_WAGE);

    $lines = [];
    $lines[] = $es ? 'PAGARÉ' : 'PROMISSORY NOTE (PAGARÉ)';
    $lines[] = ($es ? 'Pagaré No. ' : 'Note No. ') . $t['note_number'] . ' · ' . ($es ? 'Fecha: ' : 'Date: ') . $date($t['note_date']);
    $lines[] = '';

    // 1. Promise to pay
    $lines[] = $es ? '1. PROMESA DE PAGO' : '1. PROMISE TO PAY';
    // A re-paper (loan predating this feature) or an amendment (e.g. a higher
    // weekly amount) both restate the existing loan and replace earlier terms.
    if ($t['kind'] !== 'original') {
        $lines[] = $es
            ? "Yo, {$t['borrower_name']} (el \"Deudor\"), reconozco que el {$date($t['original_date'])} recibí de {$lender}, una compañía de responsabilidad limitada de Carolina del Sur (la \"Compañía\"), un préstamo de {$money($t['original_amount'])}, y que a la fecha de este Pagaré adeudo un saldo de {$money($t['principal'])}. Por valor recibido, prometo pagar a la Compañía dicho saldo de {$money($t['principal'])} según los términos de este Pagaré, que sustituye cualquier acuerdo anterior sobre este préstamo."
            : "I, {$t['borrower_name']} (the \"Borrower\"), acknowledge that on {$date($t['original_date'])} I received from {$lender}, a South Carolina limited liability company (the \"Company\"), a loan of {$money($t['original_amount'])}, and that as of the date of this Note I owe a balance of {$money($t['principal'])}. For value received, I promise to pay the Company that balance of {$money($t['principal'])} on the terms of this Note, which replaces any earlier agreement about this loan.";
    } else {
        $lines[] = $es
            ? "Por valor recibido, yo, {$t['borrower_name']} (el \"Deudor\"), prometo pagar a {$lender}, una compañía de responsabilidad limitada de Carolina del Sur (la \"Compañía\"), la suma principal de {$money($t['principal'])}."
            : "For value received, I, {$t['borrower_name']} (the \"Borrower\"), promise to pay {$lender}, a South Carolina limited liability company (the \"Company\"), the principal sum of {$money($t['principal'])}.";
    }
    $lines[] = '';

    // 2. No interest
    $lines[] = $es ? '2. SIN INTERESES' : '2. NO INTEREST';
    $lines[] = $es
        ? 'Este Pagaré no genera intereses, ni antes ni después de cualquier incumplimiento. El Deudor puede pagar todo o parte del saldo por adelantado en cualquier momento, sin penalidad.'
        : 'This Note bears no interest, before or after any default. The Borrower may prepay all or part of the balance at any time without penalty.';
    $lines[] = '';

    // 3. Schedule
    $lines[] = $es ? '3. CALENDARIO DE PAGOS' : '3. PAYMENT SCHEDULE';
    $lines[] = $es
        ? "El Deudor pagará {$n} " . ($n === 1 ? 'cuota semanal' : 'cuotas semanales') . ", de {$money($t['weekly'])} cada una" . ($last != (float)$t['weekly'] ? " (la última de {$money($last)})" : '') . ", empezando la semana del {$date($t['first_due_date'])}:"
        : "The Borrower will pay {$n} weekly " . ($n === 1 ? 'installment' : 'installments') . " of {$money($t['weekly'])} each" . ($last != (float)$t['weekly'] ? " (the last one {$money($last)})" : '') . ", starting the week of {$date($t['first_due_date'])}:";
    foreach ($schedule as $i => $row) {
        $lines[] = '   ' . ($i + 1) . '. ' . $date($row['date']) . ' — ' . $money($row['amount']);
    }
    $lines[] = '';

    // 4. How payments are made
    $lines[] = $es ? '4. FORMA DE PAGO' : '4. HOW PAYMENTS ARE MADE';
    if ($is1099) {
        $lines[] = $es
            ? 'El Deudor autoriza a la Compañía a retener cada cuota del pago que la Compañía le deba por sus servicios en la semana correspondiente, y a compensar cualquier cantidad vencida de este Pagaré contra cualquier pago que la Compañía le deba. Si en alguna semana no hay pago suficiente para cubrir la cuota, el Deudor la pagará directamente mediante Zelle a ' . $zelle . ', en nombre de la Compañía, o como la Compañía indique por escrito.'
            : 'The Borrower authorizes the Company to withhold each installment from the payment the Company owes the Borrower for services in the corresponding week, and to offset any amount due under this Note against any payment the Company owes the Borrower. If in any week there is not enough payment to cover the installment, the Borrower will pay it directly by Zelle to ' . $zelle . ', on behalf of the Company, or as the Company directs in writing.';
    } else {
        $lines[] = $es
            ? "El Deudor pagará cada cuota mediante Zelle a {$zelle}, en nombre de la Compañía, o como la Compañía indique por escrito. Cada pago hecho de esta forma es un pago a la Compañía bajo este Pagaré."
            : "The Borrower will pay each installment by Zelle to {$zelle}, on behalf of the Company, or as the Company directs in writing. Each payment made this way is a payment to the Company under this Note.";
        $lines[] = $es
            ? 'Si una cuota sigue sin pagarse 14 días después de su vencimiento, el Deudor autoriza a la Compañía a descontar de su salario las cuotas atrasadas, siempre que la Compañía le haya dado aviso por escrito del monto y la fecha del descuento con al menos 7 días de anticipación.'
            : 'If any installment remains unpaid 14 days after it is due, the Borrower authorizes the Company to deduct the missed installments from the Borrower\'s wages, provided the Company has given the Borrower written notice of the amount and date of the deduction at least 7 days in advance.';
        $lines[] = $es
            ? 'Este Pagaré constituye el aviso por escrito y la autorización del Deudor respecto al monto y los términos de los descuentos aquí descritos.'
            : 'This Note is the Borrower\'s written notice of, and authorization for, the amount and terms of the deductions described in it.';
    }
    $lines[] = '';

    // 5. Default
    $lines[] = $es ? '5. INCUMPLIMIENTO' : '5. DEFAULT';
    $lines[] = $es
        ? 'Si el Deudor no paga dos cuotas consecutivas y no las pone al día dentro de los 14 días siguientes a un aviso por escrito de la Compañía, la Compañía podrá declarar exigible de inmediato el saldo pendiente total.'
        : 'If the Borrower misses two consecutive installments and does not bring them current within 14 days after written notice from the Company, the Company may declare the entire unpaid balance immediately due.';
    $lines[] = '';

    // 6. Separation (approved wording; 1099 says engagement/payments)
    $lines[] = $es ? '6. TERMINACIÓN DE LA RELACIÓN' : '6. SEPARATION';
    if ($is1099) {
        $lines[] = $es
            ? "Este Pagaré es una deuda independiente de la contratación del Deudor con la Compañía y subsiste después de que esta termine por cualquier motivo, voluntario o involuntario, con o sin causa. Al terminar la relación, el saldo pendiente total se vuelve exigible de inmediato. El Deudor autoriza a la Compañía a descontar el saldo pendiente de cualquier pago final que se le adeude, siempre que dicho descuento no reduzca el pago final por debajo de {$minWage} por cada hora trabajada en el último período de pago. Cualquier saldo restante deberá pagarse en su totalidad dentro de los treinta (30) días siguientes a la terminación."
            : "This Note is a debt independent of the Borrower's engagement with the Company and survives its end for any reason, voluntary or involuntary, with or without cause. Upon separation, the entire unpaid balance becomes immediately due. The Borrower authorizes the Company to deduct the unpaid balance from any final payment owed to the Borrower, except that the deduction shall not reduce the final payment below {$minWage} for each hour worked in the final pay period. Any balance remaining shall be paid in full within thirty (30) days of separation.";
    } else {
        $lines[] = $es
            ? 'Este Pagaré es una deuda independiente del empleo del Deudor y subsiste después de que este termine por cualquier motivo, voluntario o involuntario, con o sin causa. Al terminar el empleo, el saldo pendiente total se vuelve exigible de inmediato. El Deudor autoriza a la Compañía a descontar el saldo pendiente de su salario final, siempre que dicho descuento no reduzca el salario final por debajo del salario mínimo federal por las horas trabajadas en el último período de pago. Cualquier saldo restante deberá pagarse en su totalidad dentro de los treinta (30) días siguientes a la terminación.'
            : 'This Note is a debt independent of the Borrower\'s employment and survives its end for any reason, voluntary or involuntary, with or without cause. Upon separation, the entire unpaid balance becomes immediately due. The Borrower authorizes the Company to deduct the unpaid balance from the Borrower\'s final wages, except that the deduction shall not reduce the Borrower\'s final wages below the federal minimum wage for hours worked in the final pay period. Any balance remaining shall be paid in full within thirty (30) days of separation.';
    }
    $lines[] = '';

    // 7. Collection costs
    $lines[] = $es ? '7. COSTOS DE COBRANZA' : '7. COLLECTION COSTS';
    $lines[] = $es
        ? 'Si cualquier cantidad no se paga a su vencimiento, el Deudor pagará los costos razonables de cobranza, incluidos honorarios de abogado que no excedan el quince por ciento (15%) del saldo pendiente.'
        : 'If any amount is not paid when due, the Borrower shall pay reasonable costs of collection, including attorney\'s fees not exceeding fifteen percent (15%) of the unpaid balance.';
    $lines[] = '';

    // 8. Electronic signature and language
    $lines[] = $es ? '8. FIRMA ELECTRÓNICA E IDIOMA' : '8. ELECTRONIC SIGNATURE AND LANGUAGE';
    $lines[] = $es
        ? 'El Deudor acepta firmar este Pagaré electrónicamente; su firma electrónica tiene el mismo efecto que una firma a mano. El Deudor recibirá una copia firmada por correo electrónico y podrá verla en la aplicación en cualquier momento.'
        : 'The Borrower agrees to sign this Note electronically; the electronic signature has the same effect as a handwritten one. The Borrower will receive a signed copy by email and can view it in the app at any time.';
    $lines[] = $es
        ? 'El Deudor leyó este Pagaré en español y lo entendió. Esta versión en español es el acuerdo del Deudor.'
        : 'The Borrower read this Note in English and understood it. This English version is the Borrower\'s agreement.';
    $lines[] = '';

    // 9. General
    $lines[] = $es ? '9. DISPOSICIONES GENERALES' : '9. GENERAL';
    $lines[] = $es
        ? 'Este Pagaré se rige por las leyes del Estado de Carolina del Sur. Cualquier cambio debe hacerse por escrito y estar firmado por el Deudor y la Compañía. Si alguna disposición resulta inválida, las demás siguen vigentes.'
        : 'This Note is governed by the laws of the State of South Carolina. Any change must be in writing and signed by both the Borrower and the Company. If any provision is found invalid, the rest remain in effect.';

    return implode("\n", $lines);
}

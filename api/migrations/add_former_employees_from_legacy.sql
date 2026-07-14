-- One-time data fix: create FieldClock records for the people identified during
-- the historical-data-migration employee crosscheck (2026-07-13). Cristian Rojas
-- is added active (confirmed current salaried team member). The other 11 are
-- added deactivated (confirmed no longer with the company), so their historical
-- hours/loans/bonuses will have a FieldClock record to attach to later, and they
-- now show up correctly in Admin -> Employees -> Deactivated Employees.
--
-- Guarded with WHERE NOT EXISTS so this is safe to run more than once.
--
-- IMPORTANT: Cristian Rojas is inserted with a placeholder pay_rate of 0.00 —
-- edit his real weekly salary via Admin -> Employees -> Edit right after running this.

INSERT INTO users (name, role, pay_type, pay_structure, pay_rate, is_active)
SELECT 'Cristian Rojas', 'employee', 'w2', 'salary', 0.00, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Cristian Rojas');

INSERT INTO users (name, role, is_active)
SELECT 'Bryan Gonzalez', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Bryan Gonzalez');

INSERT INTO users (name, role, is_active)
SELECT 'Adolfo Salamanca', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Adolfo Salamanca');

INSERT INTO users (name, email, role, is_active)
SELECT 'Daniela Marquez', 'danielamarquez@jccs-services.com', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Daniela Marquez');

INSERT INTO users (name, role, is_active)
SELECT 'Darwin Martinez', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Darwin Martinez');

INSERT INTO users (name, role, is_active)
SELECT 'Diego Marquez Giraldo', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Diego Marquez Giraldo');

INSERT INTO users (name, role, is_active)
SELECT 'Luz Estella Palacio', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Luz Estella Palacio');

INSERT INTO users (name, email, role, is_active)
SELECT 'Santiago Marquez', 'santiagomarquez@jccs-services.com', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Santiago Marquez');

INSERT INTO users (name, role, is_active)
SELECT 'Ana Salamanca', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Ana Salamanca');

INSERT INTO users (name, role, is_active)
SELECT 'Ana Sofia Salamanca', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Ana Sofia Salamanca');

INSERT INTO users (name, role, is_active)
SELECT 'Crispin Leguizamo', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Crispin Leguizamo');

INSERT INTO users (name, role, is_active)
SELECT 'Ricardo Gallegos Morales', 'employee', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Ricardo Gallegos Morales');

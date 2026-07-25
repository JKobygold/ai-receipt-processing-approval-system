-- Employee's note to the manager, attached to the receipt (100-word limit
-- enforced by the API).
ALTER TABLE receipts ADD COLUMN employee_note TEXT;

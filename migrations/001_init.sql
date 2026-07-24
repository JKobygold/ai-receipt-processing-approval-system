-- Receipts: one row per uploaded receipt file, carrying extracted + edited data
CREATE TABLE receipts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name   TEXT NOT NULL,
    stored_path     TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    file_sha256     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'uploaded'
                    CHECK (status IN ('uploaded','processing','failed','review','submitted','approved','rejected')),
    merchant        TEXT,
    purchase_date   TEXT,
    total_amount    REAL,
    currency        TEXT,
    tax_amount      REAL,
    confidence      TEXT,               -- JSON: per-field confidence scores from the extractor
    extraction_error TEXT,
    duplicate_of_id INTEGER REFERENCES receipts(id),
    manager_comment TEXT,
    submitted_at    TEXT,
    reviewed_at     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE line_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id  INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity    REAL,
    unit_price  REAL,
    amount      REAL
);

CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id  INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
    actor       TEXT NOT NULL,          -- 'employee' | 'manager' | 'system'
    action      TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_receipts_sha256 ON receipts(file_sha256);
CREATE INDEX idx_audit_receipt ON audit_log(receipt_id);

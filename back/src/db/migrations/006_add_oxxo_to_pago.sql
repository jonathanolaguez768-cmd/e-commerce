ALTER TABLE pago
  ADD COLUMN IF NOT EXISTS metodo      VARCHAR(20) NOT NULL DEFAULT 'tarjeta',
  ADD COLUMN IF NOT EXISTS mp_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ticket_url  TEXT,
  ADD COLUMN IF NOT EXISTS referencia  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS expira_en   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pago_mp_order_id ON pago(mp_order_id);

--nueva migracion para oxxo, correr
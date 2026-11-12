CREATE TABLE IF NOT EXISTS pago (
    id SERIAL PRIMARY KEY,
    pedido_id INT NOT NULL REFERENCES pedido(id),
    mp_payment_id VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL,
    idempotency_key UUID NOT NULL UNIQUE,
    mp_amount DECIMAL(10,2) NOT NULL,
    payer_email VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

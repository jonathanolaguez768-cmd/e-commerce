CREATE TABLE IF NOT EXISTS public.intento_pago (
    idempotency_key UUID PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES public.usuario(id),
    request_hash CHAR(64) NOT NULL,

    estado VARCHAR(24) NOT NULL CHECK (
        estado IN (
            'processing',
            'provider_approved',
            'approved',
            'rejected',
            'pending',
            'unknown',
            'validation_failed'
        )
    ),

    pedido_id INTEGER REFERENCES public.pedido(id),
    mp_order_id VARCHAR(100),
    mp_payment_id VARCHAR(100),
    mp_status VARCHAR(50),
    mp_status_detail VARCHAR(100),
    reason_code VARCHAR(4) CHECK (
        reason_code IS NULL OR reason_code IN (
            'APRO', 'OTHE', 'CONT', 'CALL', 'FUND', 'SECU', 'EXPI', 'FORM'
        )
    ),
    error_code VARCHAR(60),

    total_amount NUMERIC(10,2),
    payer_email VARCHAR(150),
    order_snapshot JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intento_pago_usuario_created_idx
    ON public.intento_pago (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS intento_pago_mp_order_idx
    ON public.intento_pago (mp_order_id)
    WHERE mp_order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON TABLE public.intento_pago TO p26_app;

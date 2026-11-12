CREATE TABLE IF NOT EXISTS sesion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id INT REFERENCES usuario(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

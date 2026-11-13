CREATE TABLE pedido_restock (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    products JSON NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pedido_restock TO cetiverso_app;

GRANT USAGE, SELECT ON SEQUENCE pedido_restock_id_seq TO cetiverso_app;

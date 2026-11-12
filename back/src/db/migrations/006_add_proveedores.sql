CREATE TABLE proveedor (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE producto_proveedor (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    proveedor_id INTEGER NOT NULL,
    costo_unitario NUMERIC(10,2) NOT NULL,
    dias_entrega INTEGER NOT NULL,
    CONSTRAINT fk_prod_prov_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
    CONSTRAINT fk_prod_prov_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedor(id) ON DELETE CASCADE,
    CONSTRAINT uq_producto_proveedor UNIQUE (producto_id, proveedor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE proveedor, producto_proveedor TO p26_app;

GRANT USAGE, SELECT ON SEQUENCE proveedor_id_seq, producto_proveedor_id_seq TO p26_app;

INSERT INTO proveedor (nombre, email) VALUES
('Pin-Mania Express', 'contacto@pinmaniaexpress.com'),
('Distribuidora Pins & Stickers Co.', 'ventas@pinsystickersco.com'),
('Impresiones y Creaciones Híbridas', 'pedidos@creacioneshibridas.com')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO producto_proveedor (producto_id, proveedor_id, costo_unitario, dias_entrega) VALUES
(2, 1, 16.00, 4), -- Pin Fantasma
(3, 2, 14.50, 5), -- Pin Corazón
(4, 1, 15.00, 3), -- Pin Estrella
(5, 2, 18.00, 6), -- Pin Luna
(6, 1, 17.50, 4), -- Pin Sol
(7, 2, 20.00, 5), -- Pin Hongo
(8, 1, 16.50, 3), -- Pin Café
-- (id 9: Pin Planeta se deja SIN PROVEEDOR intencionalmente para pruebas)

(12, 3, 5.00, 4), -- Sticker Fantasma
(13, 3, 4.00, 3), -- Sticker Corazón
(14, 2, 4.50, 5), -- Sticker Luna
(15, 3, 4.00, 2), -- Sticker Estrella
(16, 2, 5.00, 6), -- Sticker Hongo
(17, 3, 6.00, 4), -- Sticker Planeta
(18, 2, 4.50, 3), -- Sticker Café
(19, 3, 5.00, 5)  -- Sticker Gato Negro
ON CONFLICT (producto_id, proveedor_id) DO NOTHING;

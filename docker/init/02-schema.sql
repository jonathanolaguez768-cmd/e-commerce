
-- Role enum type
CREATE TYPE rol_enum AS ENUM ('USER', 'ADMIN');

CREATE TABLE categoria (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    rol rol_enum NOT NULL DEFAULT 'USER'
);

CREATE TABLE producto (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    imagen VARCHAR(500) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    categoria_id INT NOT NULL,

    CONSTRAINT fk_producto_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categoria(id)
);

CREATE TABLE pedido (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    usuario_id INT NOT NULL,

    CONSTRAINT fk_pedido_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuario(id)
);

CREATE TABLE detalle_pedido (
    id SERIAL PRIMARY KEY,
    pedido_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio DECIMAL(10,2) NOT NULL,

    CONSTRAINT fk_detalle_pedido
        FOREIGN KEY (pedido_id)
        REFERENCES pedido(id),

    CONSTRAINT fk_detalle_producto
        FOREIGN KEY (producto_id)
        REFERENCES producto(id)
);

-- Grant table-level privileges to app role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cetiverso_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cetiverso_app;

-- Seed data
INSERT INTO categoria (id, nombre) VALUES
(1, 'Pins'),
(2, 'Stickers');

INSERT INTO producto
    (id, nombre, precio, imagen, stock, categoria_id)
VALUES
    (1,  'Pin Gato Negro',       45.00, 'https://placehold.co/300x300?text=Pin+Gato',             15, 1),
    (2,  'Pin Fantasma',         50.00, 'https://placehold.co/300x300?text=Pin+Fantasma',          12, 1),
    (3,  'Pin Corazón',          40.00, 'https://placehold.co/300x300?text=Pin+Corazon',           20, 1),
    (4,  'Pin Estrella',         45.00, 'https://placehold.co/300x300?text=Pin+Estrella',           8, 1),
    (5,  'Pin Luna',             55.00, 'https://placehold.co/300x300?text=Pin+Luna',              10, 1),
    (6,  'Pin Sol',              55.00, 'https://placehold.co/300x300?text=Pin+Sol',                6, 1),
    (7,  'Pin Hongo',            60.00, 'https://placehold.co/300x300?text=Pin+Hongo',             14, 1),
    (8,  'Pin Café',             50.00, 'https://placehold.co/300x300?text=Pin+Cafe',               9, 1),
    (9,  'Pin Planeta',          65.00, 'https://placehold.co/300x300?text=Pin+Planeta',            7, 1),
    (10, 'Pin Corazón Roto',     50.00, 'https://placehold.co/300x300?text=Pin+Corazon+Roto',       0, 1),
    (11, 'Sticker Gato',         20.00, 'https://placehold.co/300x300?text=Sticker+Gato',          30, 2),
    (12, 'Sticker Fantasma',     20.00, 'https://placehold.co/300x300?text=Sticker+Fantasma',      25, 2),
    (13, 'Sticker Corazón',      15.00, 'https://placehold.co/300x300?text=Sticker+Corazon',       40, 2),
    (14, 'Sticker Luna',         18.00, 'https://placehold.co/300x300?text=Sticker+Luna',          22, 2),
    (15, 'Sticker Estrella',     15.00, 'https://placehold.co/300x300?text=Sticker+Estrella',      35, 2),
    (16, 'Sticker Hongo',        20.00, 'https://placehold.co/300x300?text=Sticker+Hongo',         18, 2),
    (17, 'Sticker Planeta',      22.00, 'https://placehold.co/300x300?text=Sticker+Planeta',       27, 2),
    (18, 'Sticker Café',         18.00, 'https://placehold.co/300x300?text=Sticker+Cafe',          16, 2),
    (19, 'Sticker Gato Negro',   20.00, 'https://placehold.co/300x300?text=Sticker+Gato+Negro',    12, 2),
    (20, 'Sticker Corazón Roto', 18.00, 'https://placehold.co/300x300?text=Sticker+Corazon+Roto',   0, 2);

-- Reset sequences after explicit-id inserts
SELECT setval('categoria_id_seq', (SELECT MAX(id) FROM categoria));
SELECT setval('usuario_id_seq',   (SELECT MAX(id) FROM usuario));
SELECT setval('producto_id_seq',  (SELECT MAX(id) FROM producto));

-- Default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL PRIVILEGES ON TABLES TO cetiverso_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL PRIVILEGES ON SEQUENCES TO cetiverso_app;
GRANT USAGE ON SCHEMA public TO cetiverso_app;

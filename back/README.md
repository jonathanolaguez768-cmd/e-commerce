# Backend — P26 E-commerce

Backend de la práctica P2-6 de Programación Web II.

El proyecto implementa una API GraphQL utilizando Hono, TypeScript, Bun, Apollo Server y MySQL.

## Tecnologías

* Bun
* TypeScript
* Hono
* Apollo Server
* GraphQL
* MySQL
* mysql2
* Zod

## Estructura

```text
back/
├── src/
│   ├── graphql/
│   │   ├── schema.ts
│   │   └── resolvers.ts
│   ├── db/
│   │   └── database.ts
│   └── validation/
│       └── schemas.ts
├── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Base de datos

El backend utiliza una base de datos MySQL llamada:

```text
p26_ecommerce
```

Las principales tablas son:

* `categoria`
* `producto`
* `usuario`
* `pedido`
* `detalle_pedido`

Las relaciones principales son:

```text
categoria 1 ──── N producto

usuario 1 ──── N pedido

pedido 1 ──── N detalle_pedido

producto 1 ──── N detalle_pedido
```

El archivo `db.sql` incluido en la entrega contiene la creación de la base de datos, tablas, usuario de aplicación y datos iniciales.

## Configuración de MySQL

El backend utiliza un usuario específico para acceder a la base de datos:

```text
Usuario: p26_app
Base de datos: p26_ecommerce
Puerto: 3306
```

La conexión se encuentra en:

```text
src/db/database.ts
```

## Instalación

Desde la carpeta `back`:

```bash
bun install
```

## Ejecución

Para iniciar el servidor:

```bash
bun run dev
```

El backend utiliza el puerto:

```text
3000
```

El endpoint principal de GraphQL es:

```text
http://localhost:3000/graphql
```

## GraphQL

La API utiliza un único endpoint:

```text
POST /graphql
```

También se permite acceder mediante:

```text
GET /graphql
```

El esquema define entidades para:

* Categorías
* Productos
* Usuarios
* Pedidos
* Detalles de pedido

## Queries principales

Entre las consultas disponibles se encuentran:

```graphql
categorias
categoria(id: ID!)
productos(limite: Int!, cursor: ID)
producto(id: ID!)
pedidos
pedido(id: ID!)
usuarios
usuario(id: ID!)
```

## Paginación

El catálogo de productos utiliza paginación basada en cursor.

La consulta tiene la siguiente estructura:

```graphql
productos(
  limite: Int!
  cursor: ID
): ResultadoProductos!
```

El resultado contiene:

```graphql
type ResultadoProductos {
  productos: [Producto!]!
  siguienteCursor: ID
  hayMas: Boolean!
}
```

El cursor utiliza el `id` del último producto obtenido.

Por ejemplo:

```text
Primera consulta
1  2  3  4  5  6
                  ↓
              cursor = 6

Siguiente consulta
7  8  9  10  11  12
```

Este mecanismo permite utilizar el identificador del producto como punto de referencia para obtener los siguientes registros.

## Mutations

Las principales operaciones de escritura son:

```graphql
crearProducto
actualizarProducto
eliminarProducto
crearPedido
```

La creación de pedidos utiliza una transacción de MySQL para mantener la consistencia entre:

* Pedido
* Detalles del pedido
* Stock de productos

Antes de crear el pedido se verifica que exista el usuario y que haya suficiente stock.

Si alguna validación falla, la transacción realiza un rollback y no se crea el pedido.

## Validación

Las entradas de productos y pedidos son validadas mediante Zod.

Se validan aspectos como:

* Nombre obligatorio
* Precio mayor que cero
* Stock entero y no negativo
* IDs válidos
* Cantidades enteras y mayores que cero
* Pedidos con al menos un producto

## Relaciones GraphQL

GraphQL permite consultar las relaciones entre las entidades.

Por ejemplo:

```graphql
query {
  categorias {
    id
    nombre
    productos {
      id
      nombre
      precio
    }
  }
}
```

De esta forma una consulta puede obtener una categoría junto con sus productos relacionados.

## Problema N+1

Las relaciones mediante resolvers independientes pueden producir el problema conocido como N+1.

Este ocurre cuando se realiza una consulta inicial para obtener una colección y posteriormente se ejecuta una consulta adicional por cada elemento para obtener sus datos relacionados.

Por ejemplo:

```text
1 consulta → categorías

+ 1 consulta → productos de categoría 1
+ 1 consulta → productos de categoría 2
+ ...
```

Una posible solución para un sistema de mayor escala sería utilizar batching mediante DataLoader o realizar consultas SQL utilizando `JOIN`.

### Decisión para esta práctica

La optimización del problema N+1 **no se implementó en esta versión**.

Esto fue una decisión técnica consciente debido al tamaño reducido del conjunto de datos utilizado en el prototipo. Actualmente se trabaja con **2 categorías y 20 productos**, por lo que el número de consultas generado por estas relaciones es pequeño y la optimización no representa un beneficio significativo para este escenario.

La solución mediante batching o `JOIN` queda documentada como una mejora para una futura versión del sistema cuando el volumen de datos sea considerablemente mayor.

## Estado

El backend permite:

* Consultar categorías y productos.
* Consultar productos individualmente.
* Consultar usuarios y pedidos.
* Crear, actualizar y eliminar productos.
* Crear pedidos.
* Validar datos de entrada.
* Controlar stock durante la creación de pedidos.
* Utilizar transacciones para los pedidos.
* Consultar productos mediante paginación por cursor.
* Resolver relaciones entre las entidades mediante GraphQL.

## subscriptions
```bash
bun add graphql-subscriptions
```
### websockets
```bash
bun add graphql-ws ws @hono/node-server
bun add -d @types/ws
bun add graphql-ws ws @hono/node-server
bun add -d @types/ws
```
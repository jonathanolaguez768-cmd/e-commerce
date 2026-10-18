export const typeDefs = `#graphql
  enum RolUsuario {
    USER
    ADMIN
  }

  type Categoria {
    id: ID!
    nombre: String!
    productos: [Producto!]!
  }

  type Producto {
    id: ID!
    nombre: String!
    precio: Float!
    imagen: String!
    stock: Int!
    categoria_id: ID!
    categoria: Categoria!
  }

  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: RolUsuario!
    pedidos: [Pedido!]!
  }

  type Pedido {
    id: ID!
    fecha: String!
    total: Float!
    status: String!
    usuario_id: ID!
    usuario: Usuario!
    detalles: [DetallePedido!]!
  }

  type DetallePedido {
    id: ID!
    pedido_id: ID!
    producto_id: ID!
    cantidad: Int!
    precio: Float!
    pedido: Pedido!
    producto: Producto!
  }

  type ResultadoProductos {
    productos: [Producto!]!
    siguienteCursor: ID
    hayMas: Boolean!
  }

  input CrearProductoInput {
    nombre: String!
    precio: Float!
    imagen: String!
    stock: Int!
    categoria_id: ID!
  }

  input ActualizarProductoInput {
    nombre: String
    precio: Float
    imagen: String
    stock: Int
    categoria_id: ID
  }

  input DetallePedidoInput {
    producto_id: ID!
    cantidad: Int!
  }

  input CrearPedidoInput {
    usuario_id: ID!
    detalles: [DetallePedidoInput!]!
  }

  type Query {
    categorias: [Categoria!]!
    categoria(id: ID!): Categoria

    productos(
      limite: Int!
      cursor: ID
    ): ResultadoProductos!
    producto(id: ID!): Producto

    pedidos: [Pedido!]!
    pedido(id: ID!): Pedido

    usuarios: [Usuario!]!
    usuario(id: ID!): Usuario
  }

  type Mutation {
    crearProducto(
      input: CrearProductoInput!
    ): Producto!

    actualizarProducto(
      id: ID!
      input: ActualizarProductoInput!
    ): Producto

    eliminarProducto(id: ID!): Boolean!

    crearPedido(
      input: CrearPedidoInput!
    ): Pedido!
  }

  type Subscription {
    pedidoCreado: Pedido!
  }
`
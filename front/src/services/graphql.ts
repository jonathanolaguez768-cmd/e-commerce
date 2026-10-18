import { GRAPHQL_URL } from '../config'
import type { Category } from '../types/category'
import type { Order } from '../types/order'
import type { Product } from '../types/product'

export async function fetchGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  cookie?: string,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',

      ...(cookie
        ? {
          Cookie: cookie,
        }
        : {}),
    },

    credentials: 'include',

    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Error HTTP: ${response.status} `,
    )
  }

  const result = await response.json()

  if (result.errors) {
    throw new Error(
      result.errors[0]?.message ??
      'Error en GraphQL',
    )
  }

  return result.data
}

export async function getCategories(): Promise<Category[]> {
  const query = `
    query {
      categorias {
        id
        nombre
        productos {
          id
          nombre
          precio
          imagen
          stock
          categoria_id
        }
      }
    }
  `

  const data = await fetchGraphQL<{
    categorias: {
      id: string
      nombre: string
      productos: {
        id: string
        nombre: string
        precio: number
        imagen: string
        stock: number
        categoria_id: string
      }[]
    }[]
  }>(query)

  return data.categorias.map((category) => ({
    id: Number(category.id),
    name: category.nombre,

    products: category.productos.map(
      (product): Product => ({
        id: Number(product.id),
        name: product.nombre,
        price: product.precio,
        image: product.imagen,
        stock: product.stock,
        categoryId: Number(
          product.categoria_id,
        ),
      }),
    ),
  }))
}

export async function getCategoryById(
  id: number,
): Promise<Category | null> {
  const query = `
    query ObtenerCategoria($id: ID!) {
      categoria(id: $id) {
        id
        nombre
        productos {
          id
          nombre
          precio
          imagen
          stock
          categoria_id
        }
      }
    }
  `

  const data = await fetchGraphQL<{
    categoria: {
      id: string
      nombre: string
      productos: {
        id: string
        nombre: string
        precio: number
        imagen: string
        stock: number
        categoria_id: string
      }[]
    } | null
  }>(query, {
    id,
  })

  if (!data.categoria) {
    return null
  }

  return {
    id: Number(data.categoria.id),
    name: data.categoria.nombre,

    products: data.categoria.productos.map(
      (product): Product => ({
        id: Number(product.id),
        name: product.nombre,
        price: product.precio,
        image: product.imagen,
        stock: product.stock,
        categoryId: Number(
          product.categoria_id,
        ),
      }),
    ),
  }
}

export async function getProductById(
  id: number,
): Promise<Product | null> {
  const query = `
    query ObtenerProducto($id: ID!) {
      producto(id: $id) {
        id
        nombre
        precio
        imagen
        stock
        categoria_id
      }
    }
  `

  const data = await fetchGraphQL<{
    producto: {
      id: string
      nombre: string
      precio: number
      imagen: string
      stock: number
      categoria_id: string
    } | null
  }>(query, {
    id,
  })

  if (!data.producto) {
    return null
  }

  return {
    id: Number(data.producto.id),
    name: data.producto.nombre,
    price: data.producto.precio,
    image: data.producto.imagen,
    stock: data.producto.stock,
    categoryId: Number(
      data.producto.categoria_id,
    ),
  }
}

export type PaginatedProducts = {
  productos: Product[]
  siguienteCursor: string | null
  hayMas: boolean
}

export type PaginatedOrders = {
  orders: Order[]
  siguienteCursor: string | null
  hayMas: boolean
}

export type CreateOrderInput = {
  usuario_id: number
  detalles: {
    producto_id: number
    cantidad: number
  }[]
}

export type CreatedOrder = {
  id: string
  fecha: string
  total: number
  status: string
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  const mutation = `
    mutation CrearPedido(
      $input: CrearPedidoInput!
    ) {
      crearPedido(input: $input) {
        id
        fecha
        total
        status
      }
    }
  `

  const data = await fetchGraphQL<{
    crearPedido: CreatedOrder
  }>(mutation, { input })

  return data.crearPedido
}

export async function getProducts(
  limite: number,
  cursor?: string | null,
): Promise<PaginatedProducts> {
  const query = `
    query ObtenerProductos(
      $limite: Int!
      $cursor: ID
    ) {
      productos(
        limite: $limite
        cursor: $cursor
      ) {
        productos {
          id
          nombre
          precio
          imagen
          stock
          categoria_id
        }
        siguienteCursor
        hayMas
      }
    }
  `

  const data = await fetchGraphQL<{
    productos: {
      productos: {
        id: string
        nombre: string
        precio: number
        imagen: string
        stock: number
        categoria_id: string
      }[]
      siguienteCursor: string | null
      hayMas: boolean
    }
  }>(query, {
    limite,
    cursor: cursor ?? null,
  })

  return {
    productos: data.productos.productos.map(
      (product): Product => ({
        id: Number(product.id),
        name: product.nombre,
        price: product.precio,
        image: product.imagen,
        stock: product.stock,
        categoryId: Number(
          product.categoria_id,
        ),
      }),
    ),
    siguienteCursor:
      data.productos.siguienteCursor,
    hayMas: data.productos.hayMas,
  }
}

export async function getOrders(
  cookie?: string,
): Promise<Order[]> {
  const query = `
    query ObtenerPedidos {
      pedidos {
    id
    fecha
    total
        detalles {
      cantidad
      precio
          producto {
        id
        nombre
        precio
        imagen
        stock
        categoria_id
      }
    }
  }
}
`

  const data = await fetchGraphQL<{
    pedidos: {
      id: string
      fecha: string
      total: number
      detalles: {
        cantidad: number
        precio: number
        producto: {
          id: string
          nombre: string
          precio: number
          imagen: string
          stock: number
          categoria_id: string
        }
      }[]
    }[]
  }>(query, undefined, cookie)

  return data.pedidos.map(
    (order): Order => ({
      id: Number(order.id),
      date: order.fecha,
      total: order.total,

      products: order.detalles.map(
        (detalle): Product => ({
          id: Number(detalle.producto.id),
          name: detalle.producto.nombre,
          price: detalle.precio,
          image: detalle.producto.imagen,
          stock: detalle.producto.stock,
          categoryId: Number(
            detalle.producto.categoria_id,
          ),
        }),
      ),
    }),
  )
}

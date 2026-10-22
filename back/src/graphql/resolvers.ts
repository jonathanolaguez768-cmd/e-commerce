import { db } from '../db/database'
import {
    createOrderSchema,
    createProductSchema,
    updateProductSchema,
} from '../validation/schemas'

import type { SessionUser } from '../auth/session'
import { PEDIDO_CREADO, pubsub } from './pubsub'
interface GraphQLContext {
    user: SessionUser | null
}
function requireAuth(context: GraphQLContext): SessionUser {
    if (!context.user) {
        throw new Error('Unauthenticated')
    }

    return context.user
}

function requireAdmin(context: GraphQLContext): SessionUser {
    const user = requireAuth(context)

    if (user.rol !== 'ADMIN') {
        throw new Error('Forbidden: admin access required')
    }

    return user
}

export const resolvers = {
    Subscription: {
        pedidoCreado: {
            subscribe: (_: unknown, __: unknown, context: GraphQLContext) => {
                console.log(
                    '[SUBSCRIPTION] Solicitud recibida. Usuario:',
                    context.user?.id
                );

                if (!context.user) {
                    throw new Error('No autenticado para esta suscripción');
                }

                console.log('[SUBSCRIPTION] Escucha activa');

                return pubsub.asyncIterableIterator([PEDIDO_CREADO]);
            },
        },
    },

    Query: {
        categorias: async () => {
            const { rows } = await db.query(
                'SELECT id, nombre FROM categoria',
            )

            return rows
        },

        categoria: async (
            _: unknown,
            args: { id: string },
        ) => {
            const { rows } = await db.query(
                'SELECT id, nombre FROM categoria WHERE id = $1',
                [Number(args.id)],
            )

            const categories = rows as {
                id: number
                nombre: string
            }[]

            return categories[0] ?? null
        },

        productos: async (
            _: unknown,
            args: {
                limite: number
                cursor?: string | null
            },
        ) => {
            const limit = Math.min(
                Math.max(args.limite, 1),
                50,
            )

            const cursor = args.cursor
                ? Number(args.cursor)
                : 0

            if (!Number.isInteger(cursor) || cursor < 0) {
                throw new Error(
                    'Cursor must be a valid ID.',
                )
            }

            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE id > $1
                ORDER BY id ASC
                LIMIT $2
                `,
                [cursor, limit + 1],
            )

            const products = rows as {
                id: number
                nombre: string
                precio: number
                imagen: string
                stock: number
                categoria_id: number
            }[]

            const hasMore = products.length > limit

            if (hasMore) {
                products.pop()
            }

            const lastProduct = products[products.length - 1]

            const nextCursor =
                hasMore && lastProduct
                    ? String(lastProduct.id)
                    : null

            return {
                productos: products,
                siguienteCursor: nextCursor,
                hayMas: hasMore,
            }
        },

        producto: async (
            _: unknown,
            args: { id: string },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE id = $1
                `,
                [Number(args.id)],
            )

            const products = rows as {
                id: number
                nombre: string
                precio: number
                imagen: string
                stock: number
                categoria_id: number
            }[]

            return products[0] ?? null
        },

        pedidos: async (
            _: unknown,
            __: unknown,
            context: GraphQLContext,
        ) => {
            if (!context.user) {
                throw new Error('Unauthenticated')
            }

            const { rows } = await db.query(
                `
                SELECT
                    id,
                    TO_CHAR(
                    fecha,
                    'YYYY-MM-DD HH24:MI:SS'
                    ) AS fecha,
                    total,
                    status,
                    usuario_id
                FROM pedido
                WHERE usuario_id = $1
                ORDER BY fecha DESC
            `,
                [context.user.id],
            )

            return rows
        },

        pedido: async (
            _: unknown,
            args: { id: string },
            context: GraphQLContext,
        ) => {
            const user = requireAuth(context)

            const id = Number(args.id)

            if (!Number.isInteger(id) || id <= 0) {
                throw new Error('Invalid order ID')
            }

            const { rows } = await db.query(
                `
        SELECT
            id,
            TO_CHAR(
                fecha,
                'YYYY-MM-DD HH24:MI:SS'
            ) AS fecha,
            total,
            status,
            usuario_id
        FROM pedido
        WHERE id = $1
          AND usuario_id = $2
        `,
                [id, user.id],
            )

            return rows[0] ?? null
        },

        usuarios: async (
            _: unknown,
            __: unknown,
            context: GraphQLContext,
        ) => {
            requireAdmin(context)
            const { rows } = await db.query(`
                SELECT
                    id,
                    nombre,
                    email,
                    rol
                FROM usuario
            `)

            return rows
        },

        usuario: async (
            _: unknown,
            args: { id: string },
            context: GraphQLContext,
        ) => {
            requireAdmin(context)
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    email,
                    rol
                FROM usuario
                WHERE id = $1
                `,
                [Number(args.id)],
            )

            const users = rows as {
                id: number
                nombre: string
                email: string
                rol: string
            }[]

            return users[0] ?? null
        },
    },

    Categoria: {
        productos: async (
            categoria: { id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE categoria_id = $1
                `,
                [categoria.id],
            )

            return rows
        },
    },

    Producto: {
        categoria: async (
            producto: { categoria_id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre
                FROM categoria
                WHERE id = $1
                `,
                [producto.categoria_id],
            )

            const categories = rows as {
                id: number
                nombre: string
            }[]

            return categories[0] ?? null
        },
    },

    Usuario: {
        pedidos: async (
            _: unknown,
            __: unknown,
            context: GraphQLContext,
        ) => {
            if (!context.user) {
                throw new Error('Unauthenticated')
            }
            const isAdmin = context.user.rol === 'ADMIN';

            let query = `
                SELECT
                    id,
                    TO_CHAR(
                        fecha,
                        'YYYY-MM-DD HH24:MI:SS'
                    ) AS fecha,
                    total,
                    status,
                    usuario_id
                FROM pedido
            `;
            const params: any[] = [];

            if (!isAdmin) {
                query += ` WHERE usuario_id = $1`;
                params.push(context.user.id);
            }
            query += ` ORDER BY fecha DESC`;
            const { rows } = await db.query(query, params);
            return rows;
        }
    },

    Pedido: {
        usuario: async (
            pedido: { usuario_id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    email,
                    rol
                FROM usuario
                WHERE id = $1
                `,
                [pedido.usuario_id],
            )

            const users = rows as {
                id: number
                nombre: string
                email: string
                rol: string
            }[]

            return users[0] ?? null
        },

        detalles: async (
            pedido: { id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    pedido_id,
                    producto_id,
                    cantidad,
                    precio
                FROM detalle_pedido
                WHERE pedido_id = $1
                `,
                [pedido.id],
            )

            return rows
        },
    },

    DetallePedido: {
        pedido: async (
            detalle: { pedido_id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    TO_CHAR(
                        fecha,
                        'YYYY-MM-DD HH24:MI:SS'
                    ) AS fecha,
                    total,
                    status,
                    usuario_id
                FROM pedido
                WHERE id = $1
                `,
                [detalle.pedido_id],
            )

            const orders = rows as {
                id: number
                fecha: string
                total: number
                status: string
                usuario_id: number
            }[]

            return orders[0] ?? null
        },

        producto: async (
            detalle: { producto_id: number },
        ) => {
            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE id = $1
                `,
                [detalle.producto_id],
            )

            const products = rows as {
                id: number
                nombre: string
                precio: number
                imagen: string
                stock: number
                categoria_id: number
            }[]

            return products[0] ?? null
        },
    },

    Mutation: {
        crearProducto: async (
            _: unknown,
            args: {
                input: {
                    nombre: string
                    precio: number
                    imagen: string
                    stock: number
                    categoria_id: string
                }
            },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);

            const input = createProductSchema.parse({
                ...args.input,
                categoria_id: Number(
                    args.input.categoria_id,
                ),
            })

            const { rows: categoryRows } =
                await db.query(
                    'SELECT id FROM categoria WHERE id = $1',
                    [input.categoria_id],
                )

            const categories = categoryRows as {
                id: number
            }[]

            if (categories.length === 0) {
                throw new Error('Category does not exist')
            }

            const result = await db.query(
                `
                INSERT INTO producto
                    (
                        nombre,
                        precio,
                        imagen,
                        stock,
                        categoria_id
                    )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                `,
                [
                    input.nombre,
                    input.precio,
                    input.imagen,
                    input.stock,
                    input.categoria_id,
                ],
            )

            const insertId = result.rows[0].id

            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE id = $1
                `,
                [insertId],
            )

            const products = rows as {
                id: number
                nombre: string
                precio: number
                imagen: string
                stock: number
                categoria_id: number
            }[]

            return products[0]
        },

        actualizarProducto: async (
            _: unknown,
            args: {
                id: string
                input: {
                    nombre?: string
                    precio?: number
                    imagen?: string
                    stock?: number
                    categoria_id?: string
                }
            },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);
            const input = updateProductSchema.parse({
                ...args.input,
                ...(args.input.categoria_id !==
                    undefined && {
                    categoria_id: Number(
                        args.input.categoria_id,
                    ),
                }),
            })

            const id = Number(args.id)

            const { rows: existingRows } =
                await db.query(
                    'SELECT id FROM producto WHERE id = $1',
                    [id],
                )

            const existingProducts =
                existingRows as { id: number }[]

            if (existingProducts.length === 0) {
                return null
            }

            if (input.categoria_id !== undefined) {
                const { rows: categoryRows } =
                    await db.query(
                        'SELECT id FROM categoria WHERE id = $1',
                        [input.categoria_id],
                    )

                const categories =
                    categoryRows as {
                        id: number
                    }[]

                if (categories.length === 0) {
                    throw new Error('Category does not exist')
                }
            }

            const fields: string[] = []
            const values: (string | number)[] = []

            let paramIndex = 1

            if (input.nombre !== undefined) {
                fields.push(`nombre = $${paramIndex++}`)
                values.push(input.nombre)
            }

            if (input.precio !== undefined) {
                fields.push(`precio = $${paramIndex++}`)
                values.push(input.precio)
            }

            if (input.imagen !== undefined) {
                fields.push(`imagen = $${paramIndex++}`)
                values.push(input.imagen)
            }

            if (input.stock !== undefined) {
                fields.push(`stock = $${paramIndex++}`)
                values.push(input.stock)
            }

            if (input.categoria_id !== undefined) {
                fields.push(
                    `categoria_id = $${paramIndex++}`,
                )
                values.push(input.categoria_id)
            }

            if (fields.length > 0) {
                values.push(id)

                await db.query(
                    `
                    UPDATE producto
                    SET ${fields.join(', ')}
                    WHERE id = $${paramIndex}
                    `,
                    values,
                )
            }

            const { rows } = await db.query(
                `
                SELECT
                    id,
                    nombre,
                    precio,
                    imagen,
                    stock,
                    categoria_id
                FROM producto
                WHERE id = $1
                `,
                [id],
            )

            const products = rows as {
                id: number
                nombre: string
                precio: number
                imagen: string
                stock: number
                categoria_id: number
            }[]

            return products[0] ?? null
        },

        eliminarProducto: async (
            _: unknown,
            args: { id: string },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);
            const result =
                await db.query(
                    'DELETE FROM producto WHERE id = $1',
                    [Number(args.id)],
                )

            return result.rowCount !== null && result.rowCount > 0
        },

        crearPedido: async (
            _: unknown,
            args: {
                input: {
                    usuario_id: string
                    detalles: {
                        producto_id: string
                        cantidad: number
                    }[]
                }
            },
            context: GraphQLContext
        ) => {
            const user = requireAuth(context)

            const input = createOrderSchema.parse(args.input)

            const userId = user.id

            const client = await db.connect()

            try {
                await client.query('BEGIN')

                const { rows: userRows } = await client.query(
                    `
                    SELECT id
                    FROM usuario
                    WHERE id = $1
                    `,
                    [userId],
                )

                const users = userRows as { id: number }[]

                if (users.length === 0) {
                    throw new Error('User does not exist')
                }

                let total = 0

                const orderLines: {
                    product_id: number
                    quantity: number
                    price: number
                }[] = []

                for (const detail of input.detalles) {
                    const productId = Number(detail.producto_id)

                    const { rows: productRows } =
                        await client.query(
                            `
                            SELECT
                                id,
                                nombre,
                                precio,
                                stock
                            FROM producto
                            WHERE id = $1
                            FOR UPDATE
                            `,
                            [productId],
                        )

                    const products = productRows as {
                        id: number
                        nombre: string
                        precio: number
                        stock: number
                    }[]

                    const product = products[0]

                    if (!product) {
                        throw new Error(
                            `Product ${productId} does not exist`,
                        )
                    }

                    if (detail.cantidad > product.stock) {
                        throw new Error(
                            `Not enough stock for ${product.nombre}`,
                        )
                    }

                    total += product.precio * detail.cantidad

                    orderLines.push({
                        product_id: product.id,
                        quantity: detail.cantidad,
                        price: product.precio,
                    })
                }

                const orderResult = await client.query(
                    `
                    INSERT INTO pedido
                        (
                            fecha,
                            total,
                            status,
                            usuario_id
                        )
                    VALUES
                        (
                            NOW(),
                            $1,
                            'CONFIRMADO',
                            $2
                        )
                    RETURNING id
                    `,
                    [total, userId],
                )

                const orderId = orderResult.rows[0].id

                for (const line of orderLines) {
                    await client.query(
                        `
                        INSERT INTO detalle_pedido
                            (
                                pedido_id,
                                producto_id,
                                cantidad,
                                precio
                            )
                        VALUES ($1, $2, $3, $4)
                        `,
                        [
                            orderId,
                            line.product_id,
                            line.quantity,
                            line.price,
                        ],
                    )

                    await client.query(
                        `
                        UPDATE producto
                        SET stock = stock - $1
                        WHERE id = $2
                        `,
                        [line.quantity, line.product_id],
                    )
                }

                await client.query('COMMIT')

                const { rows } = await client.query(
                    `
                    SELECT
                        id,
                        TO_CHAR(
                            fecha,
                            'YYYY-MM-DD HH24:MI:SS'
                        ) AS fecha,
                        total,
                        status,
                        usuario_id
                    FROM pedido
                    WHERE id = $1
                    `,
                    [orderId],
                )

                const orders = rows as {
                    id: number
                    fecha: Date
                    total: number
                    status: string
                    usuario_id: number
                }[]
                const nuevoPedido = orders[0];

                await pubsub.publish(PEDIDO_CREADO, {
                    pedidoCreado: nuevoPedido,
                });

                return nuevoPedido;
            } catch (error) {
                await client.query('ROLLBACK')
                throw error
            } finally {
                client.release()
            }
        },
    },
}

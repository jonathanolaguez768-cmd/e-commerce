import { Hono } from 'hono'
import { MercadoPagoConfig, Order } from 'mercadopago'

import { db } from '../db/database'
import { getSession } from '../auth/session'
import { processOrderSchema } from '../validation/schemas'

import { processOxxoOrderSchema } from '../validation/oxxoSchema'

export const apiRouter = new Hono()

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

apiRouter.post('/process_order', async (c) => {
  const user = await getSession(c)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const idempotencyKey = c.req.header('X-Idempotency-Key')
  if (!idempotencyKey || !UUID_V4_RE.test(idempotencyKey)) {
    return c.json({ error: 'missing_or_invalid_idempotency_key' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const parsed = processOrderSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 400)
  }
  const data = parsed.data

  if (data.external_reference !== idempotencyKey) {
    return c.json({ error: 'idempotency_key_mismatch' }, 400)
  }

  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const lockResult = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint) AS acquired`,
      [idempotencyKey],
    )
    if (!lockResult.rows[0]?.acquired) {
      await client.query('ROLLBACK')
      client.release()
      return c.json({ error: 'duplicate_request' }, 409)
    }

    const existingPayment = await client.query<{ pedido_id: number }>(
      'SELECT pedido_id FROM pago WHERE idempotency_key = $1',
      [idempotencyKey],
    )
    if (existingPayment.rows.length > 0) {
      await client.query('COMMIT')
      client.release()
      return c.json({ pedido_id: existingPayment.rows[0]!.pedido_id }, 200)
    }

    let total = 0
    const orderLines: { product_id: number; quantity: number; price: number }[] = []

    for (const item of data.items) {
      const { rows } = await client.query<{
        id: number
        nombre: string
        precio: number
        stock: number
      }>(
        `SELECT id, nombre, precio, stock FROM producto WHERE id = $1 FOR UPDATE`,
        [item.producto_id],
      )

      if (rows.length === 0) {
        await client.query('ROLLBACK')
        client.release()
        return c.json({ error: 'product_not_found', product_id: item.producto_id }, 422)
      }

      const product = rows[0]!

      if (item.cantidad > product.stock) {
        await client.query('ROLLBACK')
        client.release()
        return c.json({ error: 'insufficient_stock', product: product.nombre }, 422)
      }

      total += Number(product.precio) * item.cantidad
      orderLines.push({
        product_id: product.id,
        quantity: item.cantidad,
        price: Number(product.precio),
      })
    }

    const mpConfig = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
    })
    const mpOrders = new Order(mpConfig)

    const payment = data.transactions.payments[0]!

    const mpResponse = await mpOrders.create({
      requestOptions: { idempotencyKey },
      body: {
        type: 'online',
        total_amount: String(total),
        external_reference: idempotencyKey,
        processing_mode: 'automatic',
        transactions: {
          payments: [
            {
              amount: String(total),
              payment_method: {
                id: payment.payment_method.id,
                type: payment.payment_method.type ?? 'credit_card',
                token: payment.payment_method.token,
                installments: payment.payment_method.installments,
              },
            },
          ],
        },
        payer: {
          email: data.payer.email,
          ...(data.payer.identification
            ? { identification: data.payer.identification }
            : {}),
        },
      },
    })

    const mpPayment = mpResponse.transactions?.payments?.[0]
    const mpStatus = (mpPayment as any)?.status ?? mpResponse.status ?? 'unknown'
    const mpStatusDetail = (mpPayment as any)?.status_detail ?? (mpResponse as any)?.status_detail ?? 'unknown'
    const mpPaymentId = String((mpPayment as any)?.id ?? '')

    const paymentApproved = mpStatus === 'processed' && mpStatusDetail === 'accredited'

    if (!paymentApproved) {
      await client.query('ROLLBACK')
      client.release()
      return c.json({ error: 'payment_not_approved', mp_status: mpStatus, mp_status_detail: mpStatusDetail }, 402)
    }

    const orderResult = await client.query<{ id: number }>(
      `INSERT INTO pedido (fecha, total, status, usuario_id)
       VALUES (NOW(), $1, 'CONFIRMADO', $2)
       RETURNING id`,
      [total, user.id],
    )
    const orderId = orderResult.rows[0]!.id

    for (const line of orderLines) {
      await client.query(
        `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio)
         VALUES ($1, $2, $3, $4)`,
        [orderId, line.product_id, line.quantity, line.price],
      )

      await client.query(
        `UPDATE producto SET stock = stock - $1 WHERE id = $2`,
        [line.quantity, line.product_id],
      )
    }

    await client.query(
      `INSERT INTO pago (pedido_id, mp_payment_id, status, idempotency_key, mp_amount, payer_email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, mpPaymentId, mpStatus, idempotencyKey, total, data.payer.email],
    )

    await client.query('COMMIT')
    client.release()

    return c.json({ pedido_id: orderId, mp_payment_id: mpPaymentId }, 201)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
    console.error('[process_order] unexpected error:', err)
    return c.json({ error: 'internal_server_error' }, 500)
  }
})
//nuevo para mp oxxo

const OXXO_EXPIRATION_DAYS = 3

// ---------------------------------------------------------------------------
// POST /api/process_oxxo_order
// Crea la ficha OXXO en Mercado Pago y deja el pedido en PENDIENTE_PAGO.
// ---------------------------------------------------------------------------
apiRouter.post('/process_oxxo_order', async (c) => {
  const user = await getSession(c)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const idempotencyKey = c.req.header('X-Idempotency-Key')
  if (!idempotencyKey || !UUID_V4_RE.test(idempotencyKey)) {
    return c.json({ error: 'missing_or_invalid_idempotency_key' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const parsed = processOxxoOrderSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 400)
  }
  const data = parsed.data

  if (data.external_reference !== idempotencyKey) {
    return c.json({ error: 'idempotency_key_mismatch' }, 400)
  }

  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const lockResult = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint) AS acquired`,
      [idempotencyKey],
    )
    if (!lockResult.rows[0]?.acquired) {
      await client.query('ROLLBACK')
      return c.json({ error: 'duplicate_request' }, 409)
    }

    // Si ya se procesó esta misma solicitud, devolvemos la ficha existente.
    const existing = await client.query<{
      pedido_id: number
      ticket_url: string | null
      referencia: string | null
      expira_en: Date | null
    }>(
      `SELECT pedido_id, ticket_url, referencia, expira_en
       FROM pago WHERE idempotency_key = $1`,
      [idempotencyKey],
    )
    if (existing.rows.length > 0) {
      await client.query('COMMIT')
      const prev = existing.rows[0]!
      return c.json(
        {
          pedido_id: prev.pedido_id,
          ticket_url: prev.ticket_url,
          reference: prev.referencia,
          expires_at: prev.expira_en,
        },
        200,
      )
    }

    // Validar stock y calcular el total con precios de la base de datos.
    let total = 0
    const orderLines: { product_id: number; quantity: number; price: number }[] = []

    for (const item of data.items) {
      const { rows } = await client.query<{
        id: number
        nombre: string
        precio: number
        stock: number
      }>(
        `SELECT id, nombre, precio, stock FROM producto WHERE id = $1 FOR UPDATE`,
        [item.producto_id],
      )

      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return c.json({ error: 'product_not_found', product_id: item.producto_id }, 422)
      }

      const product = rows[0]!

      if (item.cantidad > product.stock) {
        await client.query('ROLLBACK')
        return c.json({ error: 'insufficient_stock', product: product.nombre }, 422)
      }

      total += Number(product.precio) * item.cantidad
      orderLines.push({
        product_id: product.id,
        quantity: item.cantidad,
        price: Number(product.precio),
      })
    }

    const totalAmount = Math.round(total * 100) / 100
    const totalStr = totalAmount.toFixed(2)

    // Crear la orden OXXO en Mercado Pago.
    const mpConfig = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
    })
    const mpOrders = new Order(mpConfig)

    const mpResponse: any = await mpOrders.create({
      requestOptions: { idempotencyKey },
      body: {
        type: 'online',
        external_reference: idempotencyKey,
        processing_mode: 'automatic',
        total_amount: totalStr,
        expiration_time: `P${OXXO_EXPIRATION_DAYS}D`, //expira en 3 dias
        payer: {
          email: data.payer.email,
          first_name: data.payer.first_name,
          last_name: data.payer.last_name,
        },
        transactions: {
          payments: [
            {
              amount: totalStr,
              expiration_time: `P${OXXO_EXPIRATION_DAYS}D`,
              payment_method: { id: 'oxxo', type: 'ticket' },
            },
          ],
        },
      } as any,
    })

    const mpPayment = mpResponse?.transactions?.payments?.[0]
    const method = mpPayment?.payment_method ?? {}
    const ticketUrl: string | undefined = method.ticket_url

    if (!ticketUrl) {
      console.error('[process_oxxo_order] MP no devolvió ticket_url:', JSON.stringify(mpResponse))
      await client.query('ROLLBACK')
      return c.json({ error: 'oxxo_ticket_not_generated' }, 502)
    }

    const reference = method.reference ? String(method.reference) : null
    const mpOrderId = String(mpResponse.id)
    const mpPaymentId = String(mpPayment?.id ?? mpResponse.id)
    const mpStatus = String(mpPayment?.status ?? mpResponse.status ?? 'unknown')
    // se usa la fecha real que devuelve Mercado Pago; si no viene, la estimada.
    const mpExpiration = mpPayment?.date_of_expiration
    const expiresAt = mpExpiration
    ? new Date(mpExpiration)
    : new Date(Date.now() + OXXO_EXPIRATION_DAYS * 24 * 60 * 60 * 1000)

    // Guardar pedido pendiente, detalles, stock reservado y pago.
    const orderResult = await client.query<{ id: number }>(
      `INSERT INTO pedido (fecha, total, status, usuario_id)
       VALUES (NOW(), $1, 'PENDIENTE_PAGO', $2)
       RETURNING id`,
      [totalAmount, user.id],
    )
    const orderId = orderResult.rows[0]!.id

    for (const line of orderLines) {
      await client.query(
        `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio)
         VALUES ($1, $2, $3, $4)`,
        [orderId, line.product_id, line.quantity, line.price],
      )

      await client.query(
        `UPDATE producto SET stock = stock - $1 WHERE id = $2`,
        [line.quantity, line.product_id],
      )
    }

    await client.query(
      `INSERT INTO pago
         (pedido_id, mp_payment_id, status, idempotency_key, mp_amount, payer_email,
          metodo, mp_order_id, ticket_url, referencia, expira_en)
       VALUES ($1, $2, $3, $4, $5, $6, 'oxxo', $7, $8, $9, $10)`,
      [
        orderId,
        mpPaymentId,
        mpStatus,
        idempotencyKey,
        totalAmount,
        data.payer.email,
        mpOrderId,
        ticketUrl,
        reference,
        expiresAt,
      ],
    )

    await client.query('COMMIT')

    return c.json(
      {
        pedido_id: orderId,
        ticket_url: ticketUrl,
        reference,
        expires_at: expiresAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[process_oxxo_order] unexpected error:', err)
    return c.json({ error: 'internal_server_error' }, 500)
  } finally {
    client.release()
  }
})

// ---------------------------------------------------------------------------
// POST /api/mp_webhook
// Mercado Pago avisa aquí cuando una orden cambia de estado.
// Re-consultamos la orden a MP con nuestro token, así que un aviso falso
// no puede confirmar un pago.
// ---------------------------------------------------------------------------
apiRouter.post('/mp_webhook', async (c) => {
  let body: any = {}
  try {
    body = await c.req.json()
  } catch {
    // MP a veces manda el aviso sin body; los datos vienen en la URL.
  }

  const mpOrderId = body?.data?.id ?? c.req.query('data.id')
  const eventType = body?.type ?? c.req.query('type')

  if (!mpOrderId || eventType !== 'order') {
    return c.json({ ok: true }, 200)
  }

  let mpOrder: any
  try {
    const mpConfig = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
    })
    mpOrder = await new Order(mpConfig).get({ id: String(mpOrderId) })
  } catch (err) {
    console.error('[mp_webhook] no se pudo consultar la orden', mpOrderId, err)
    return c.json({ error: 'mp_lookup_failed' }, 502)
  }

  const externalRef: string | undefined = mpOrder?.external_reference
  const mpStatus = String(mpOrder?.status ?? '')

  if (!externalRef || !UUID_V4_RE.test(externalRef)) {
    return c.json({ ok: true }, 200)
  }

  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const pagoRes = await client.query<{ id: number; pedido_id: number; metodo: string }>(
      `SELECT id, pedido_id, metodo FROM pago WHERE idempotency_key = $1 FOR UPDATE`,
      [externalRef],
    )
    const pago = pagoRes.rows[0]

    if (!pago) {
      // Puede ser que el aviso llegó antes de guardar el pedido: MP reintentará.
      await client.query('ROLLBACK')
      return c.json({ error: 'payment_not_found_yet' }, 404)
    }

    // Los pagos con tarjeta ya se confirman en /process_order.
    if (pago.metodo !== 'oxxo') {
      await client.query('COMMIT')
      return c.json({ ok: true }, 200)
    }

    const pedidoRes = await client.query<{ status: string }>(
      `SELECT status FROM pedido WHERE id = $1 FOR UPDATE`,
      [pago.pedido_id],
    )

    // Si ya no está pendiente, no hacemos nada (evita procesar dos veces).
    if (pedidoRes.rows[0]?.status !== 'PENDIENTE_PAGO') {
      await client.query('COMMIT')
      return c.json({ ok: true }, 200)
    }

    if (mpStatus === 'processed') {
      await client.query(`UPDATE pedido SET status = 'CONFIRMADO' WHERE id = $1`, [pago.pedido_id])
      await client.query(`UPDATE pago SET status = $1 WHERE id = $2`, [mpStatus, pago.id])
    } else if (['expired', 'canceled', 'failed'].includes(mpStatus)) {
      const lines = await client.query<{ producto_id: number; cantidad: number }>(
        `SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = $1`,
        [pago.pedido_id],
      )
      for (const line of lines.rows) {
        await client.query(
          `UPDATE producto SET stock = stock + $1 WHERE id = $2`,
          [line.cantidad, line.producto_id],
        )
      }
      await client.query(`UPDATE pedido SET status = 'CANCELADO' WHERE id = $1`, [pago.pedido_id])
      await client.query(`UPDATE pago SET status = $1 WHERE id = $2`, [mpStatus, pago.id])
    }

    await client.query('COMMIT')
    return c.json({ ok: true }, 200)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[mp_webhook] unexpected error:', err)
    return c.json({ error: 'internal_server_error' }, 500)
  } finally {
    client.release()
  }
})
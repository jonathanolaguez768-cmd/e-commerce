import { Hono } from 'hono'
import { MercadoPagoConfig, Order } from 'mercadopago'
import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import { getSession } from '../auth/session'
import { db } from '../db/database'
import { processOrderSchema } from '../validation/schemas'

export const apiRouter = new Hono()

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReasonCode = 'APRO' | 'OTHE' | 'CONT' | 'CALL' | 'FUND' | 'SECU' | 'EXPI' | 'FORM'
type AttemptStatus =
  | 'processing'
  | 'provider_approved'
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'unknown'
  | 'validation_failed'

type OrderLineSnapshot = {
  product_id: number
  quantity: number
  price: string
}

type OrderSnapshot = {
  total: string
  payer_email: string
  lines: OrderLineSnapshot[]
}

type AttemptRow = {
  idempotency_key: string
  usuario_id: number
  request_hash: string
  estado: AttemptStatus
  pedido_id: number | null
  mp_order_id: string | null
  mp_payment_id: string | null
  mp_status: string | null
  mp_status_detail: string | null
  reason_code: ReasonCode | null
  error_code: string | null
  total_amount: string | null
  payer_email: string | null
  order_snapshot: OrderSnapshot | null
  created_at: Date | string
}

type MpPaymentLike = {
  id?: string | number
  reference_id?: string
  status?: string
  status_detail?: string
}

type MpOrderLike = {
  id?: string | number
  status?: string
  status_detail?: string
  external_reference?: string
  transactions?: { payments?: MpPaymentLike[] }
}

const REASON_MESSAGES: Record<ReasonCode, string> = {
  APRO: 'Pago aprobado.',
  OTHE: 'El banco no pudo aprobar el pago. Intenta con otra tarjeta o contacta con tu banco.',
  CONT: 'Tu pago sigue pendiente. Espera mientras verificamos su estado y no vuelvas a enviarlo.',
  CALL: 'Tu banco requiere una autorización adicional. Contacta con el emisor de tu tarjeta.',
  FUND: 'La tarjeta no tiene fondos suficientes para completar el pago.',
  SECU: 'Verifica el código de seguridad de tu tarjeta.',
  EXPI: 'Verifica la fecha de vencimiento de tu tarjeta.',
  FORM: 'Revisa los datos introducidos en el formulario de pago.',
}

function makeMpOrderClient(): Order {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not configured')

  return new Order(new MercadoPagoConfig({ accessToken }))
}

function hashRequest(userId: number, data: unknown): string {
  // Solo se guarda el hash; nunca se almacena el token de tarjeta en la base de datos.
  return createHash('sha256')
    .update(JSON.stringify({ userId, data }))
    .digest('hex')
}

function moneyToCents(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('Invalid numeric product price')
  return Math.round(n * 100)
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function getMpTransaction(order: MpOrderLike): {
  payment: MpPaymentLike | undefined
  status: string
  statusDetail: string
  orderId: string
  paymentId: string
} {
  const payment = order.transactions?.payments?.[0]
  const status = String(payment?.status ?? order.status ?? 'unknown').toLowerCase()
  const statusDetail = String(
    payment?.status_detail ?? order.status_detail ?? 'unknown',
  ).toLowerCase()

  return {
    payment,
    status,
    statusDetail,
    orderId: order.id == null ? '' : String(order.id),
    paymentId: payment?.id != null
      ? String(payment.id)
      : payment?.reference_id != null
        ? String(payment.reference_id)
        : '',
  }
}

function isApproved(status: string, statusDetail: string): boolean {
  return status === 'processed' && statusDetail === 'accredited'
}

function isPending(status: string): boolean {
  return ['created', 'processing', 'action_required'].includes(status)
}

function isFinalRejection(status: string): boolean {
  return ['failed', 'canceled', 'cancelled'].includes(status)
}

function mapReason(status: string, statusDetail: string): ReasonCode {
  if (isApproved(status, statusDetail)) return 'APRO'
  if (isPending(status)) return 'CONT'

  switch (statusDetail) {
    case 'required_call_for_authorize':
      return 'CALL'
    case 'insufficient_amount':
      return 'FUND'
    case 'invalid_security_code':
    case 'invalid_cvv':
    case 'security_code_invalid':
      return 'SECU'
    case 'expired_card':
    case 'invalid_expiration_date':
    case 'invalid_expiration':
      return 'EXPI'
    case 'bad_filled_card_data':
      // Orders API puede devolver un detalle genérico para varios errores de datos.
      // En ese caso no inventamos si fue CVV, vencimiento u otro campo: usamos FORM.
      return 'FORM'
    default:
      // Incluye rechazos generales, del emisor o de riesgo.
      return 'OTHE'
  }
}

async function loadAttempt(
  idempotencyKey: string,
  userId: number,
): Promise<AttemptRow | null> {
  const client = await db.connect()
  try {
    const result = await client.query<AttemptRow>(
      `SELECT idempotency_key, usuario_id, request_hash, estado, pedido_id,
              mp_order_id, mp_payment_id, mp_status, mp_status_detail,
              reason_code, error_code, total_amount, payer_email, order_snapshot, created_at
       FROM intento_pago
       WHERE idempotency_key = $1 AND usuario_id = $2`,
      [idempotencyKey, userId],
    )
    return result.rows[0] ?? null
  } finally {
    client.release()
  }
}

async function updateAttempt(
  idempotencyKey: string,
  fields: {
    estado?: AttemptStatus
    pedido_id?: number | null
    mp_order_id?: string | null
    mp_payment_id?: string | null
    mp_status?: string | null
    mp_status_detail?: string | null
    reason_code?: ReasonCode | null
    error_code?: string | null
  },
): Promise<void> {
  const client = await db.connect()
  try {
    await client.query(
      `UPDATE intento_pago SET
         estado = COALESCE($2, estado),
         pedido_id = COALESCE($3, pedido_id),
         mp_order_id = COALESCE($4, mp_order_id),
         mp_payment_id = COALESCE($5, mp_payment_id),
         mp_status = COALESCE($6, mp_status),
         mp_status_detail = COALESCE($7, mp_status_detail),
         reason_code = COALESCE($8, reason_code),
         error_code = COALESCE($9, error_code),
         updated_at = NOW()
       WHERE idempotency_key = $1`,
      [
        idempotencyKey,
        fields.estado ?? null,
        fields.pedido_id ?? null,
        fields.mp_order_id ?? null,
        fields.mp_payment_id ?? null,
        fields.mp_status ?? null,
        fields.mp_status_detail ?? null,
        fields.reason_code ?? null,
        fields.error_code ?? null,
      ],
    )
  } finally {
    client.release()
  }
}

async function saveSnapshot(
  idempotencyKey: string,
  snapshot: OrderSnapshot,
): Promise<void> {
  const client = await db.connect()
  try {
    await client.query(
      `UPDATE intento_pago
       SET total_amount = $2, payer_email = $3, order_snapshot = $4::jsonb,
           updated_at = NOW()
       WHERE idempotency_key = $1`,
      [idempotencyKey, snapshot.total, snapshot.payer_email, JSON.stringify(snapshot)],
    )
  } finally {
    client.release()
  }
}

function existingAttemptResponse(attempt: AttemptRow) {
  if (attempt.estado === 'approved' && attempt.pedido_id != null) {
    return {
      status: 200,
      body: {
        pedido_id: attempt.pedido_id,
        mp_order_id: attempt.mp_order_id,
        mp_payment_id: attempt.mp_payment_id,
        status: 'approved',
        reused_attempt: true,
      },
    }
  }

  if (attempt.estado === 'rejected') {
    const reason = attempt.reason_code ?? 'OTHE'
    return {
      status: 402,
      body: {
        error: 'payment_not_approved',
        reason,
        message: REASON_MESSAGES[reason],
        new_attempt_allowed: true,
        unresolved: false,
      },
    }
  }

  if (attempt.estado === 'validation_failed') {
    return {
      status: 409,
      body: {
        error: attempt.error_code ?? 'validation_failed',
        message: 'La solicitud anterior no pudo completarse. Corrige los datos o inicia un nuevo intento.',
        new_attempt_allowed: true,
        unresolved: false,
      },
    }
  }

  const providerAlreadyApproved = attempt.estado === 'provider_approved'
  return {
    status: 202,
    body: {
      error: providerAlreadyApproved
        ? 'payment_approved_reconciliation_required'
        : attempt.estado === 'pending'
          ? 'payment_pending'
          : attempt.estado === 'unknown'
            ? 'payment_status_unknown'
            : 'payment_processing',
      reason: attempt.reason_code ?? (attempt.estado === 'pending' ? 'CONT' : undefined),
      message: providerAlreadyApproved
        ? 'Mercado Pago aprobó el pago y estamos recuperando la confirmación del pedido.'
        : attempt.estado === 'pending'
          ? REASON_MESSAGES.CONT
          : 'El intento de pago todavía no está resuelto. No vuelvas a enviarlo.',
      new_attempt_allowed: false,
      unresolved: true,
    },
  }
}

async function finishApprovedAttempt(
  idempotencyKey: string,
  userId: number,
): Promise<number | null> {
  // Se usa para recuperar el pedido si Mercado Pago aprobó el pago pero falló
  // la escritura local. Nunca vuelve a llamar a Order.create().
  const attempt = await loadAttempt(idempotencyKey, userId)
  if (!attempt) return null
  if (attempt.estado === 'approved' && attempt.pedido_id != null) return attempt.pedido_id
  if (
    attempt.estado !== 'provider_approved' ||
    !attempt.order_snapshot ||
    !attempt.mp_payment_id
  ) return null

  const snapshot = attempt.order_snapshot
  const client = await db.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    // Bloquea primero los productos en orden estable. El flujo normal también
    // bloquea productos antes de actualizar intento_pago, evitando inversión de locks.
    const stockByProduct = new Map<number, number>()
    for (const line of [...snapshot.lines].sort((a, b) => a.product_id - b.product_id)) {
      const productResult = await client.query<{ id: number; stock: number }>(
        'SELECT id, stock FROM producto WHERE id = $1 FOR UPDATE',
        [line.product_id],
      )
      const product = productResult.rows[0]
      if (!product) {
        throw new Error(`Product missing while recovering approved payment; product_id=${line.product_id}`)
      }
      stockByProduct.set(line.product_id, Number(product.stock))
    }

    // Después de adquirir locks de inventario, se vuelve a comprobar el estado
    // del intento. Otra solicitud podría haber completado el pedido mientras esperábamos.
    const lockedAttemptResult = await client.query<{ estado: AttemptStatus; pedido_id: number | null }>(
      `SELECT estado, pedido_id
       FROM intento_pago
       WHERE idempotency_key = $1 AND usuario_id = $2
       FOR UPDATE`,
      [idempotencyKey, userId],
    )
    const lockedAttempt = lockedAttemptResult.rows[0]
    if (lockedAttempt?.estado === 'approved' && lockedAttempt.pedido_id != null) {
      await client.query('COMMIT')
      transactionOpen = false
      return lockedAttempt.pedido_id
    }
    if (lockedAttempt?.estado !== 'provider_approved') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return null
    }

    for (const line of snapshot.lines) {
      if ((stockByProduct.get(line.product_id) ?? 0) < line.quantity) {
        throw new Error(`Inventory unavailable while recovering approved payment; product_id=${line.product_id}`)
      }
    }

    const orderResult = await client.query<{ id: number }>(
      `INSERT INTO pedido (fecha, total, status, usuario_id)
       VALUES (NOW(), $1, 'CONFIRMADO', $2)
       RETURNING id`,
      [snapshot.total, userId],
    )
    const orderId = orderResult.rows[0]!.id

    for (const line of snapshot.lines) {
      await client.query(
        `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio)
         VALUES ($1, $2, $3, $4)`,
        [orderId, line.product_id, line.quantity, line.price],
      )
      await client.query(
        'UPDATE producto SET stock = stock - $1 WHERE id = $2',
        [line.quantity, line.product_id],
      )
    }

    await client.query(
      `INSERT INTO pago
         (pedido_id, mp_payment_id, status, idempotency_key, mp_amount, payer_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        orderId,
        attempt.mp_payment_id,
        attempt.mp_status ?? 'processed',
        idempotencyKey,
        snapshot.total,
        snapshot.payer_email,
      ],
    )

    await client.query(
      `UPDATE intento_pago
       SET estado = 'approved', pedido_id = $2, reason_code = 'APRO',
           error_code = NULL, updated_at = NOW()
       WHERE idempotency_key = $1`,
      [idempotencyKey, orderId],
    )

    await client.query('COMMIT')
    transactionOpen = false
    return orderId
  } catch (err) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => { })
    console.error('[process_order] Could not finalize locally approved payment:', err)
    return null
  } finally {
    client.release()
  }
}

async function createOrderFromSnapshot(
  mpOrders: Order,
  idempotencyKey: string,
  snapshot: OrderSnapshot,
  payment: {
    payment_method: { id: string; type?: string; token: string; installments?: number }
  },
  payerIdentification?: { type: string; number: string },
) {
  return mpOrders.create({
    requestOptions: { idempotencyKey },
    body: {
      type: 'online',
      total_amount: snapshot.total,
      external_reference: idempotencyKey,
      processing_mode: 'automatic',
      transactions: {
        payments: [
          {
            amount: snapshot.total,
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
        email: snapshot.payer_email,
        ...(payerIdentification ? { identification: payerIdentification } : {}),
      },
    },
  })
}

async function readRequestAttempt(
  idempotencyKey: string,
  userId: number,
  requestHash: string,
): Promise<{ created: boolean; attempt: AttemptRow | null; hashMismatch: boolean }> {
  const client = await db.connect()
  try {
    const insert = await client.query(
      `INSERT INTO intento_pago (idempotency_key, usuario_id, request_hash, estado)
       VALUES ($1, $2, $3, 'processing')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, userId, requestHash],
    )

    if (insert.rowCount) return { created: true, attempt: null, hashMismatch: false }

    const existingResult = await client.query<AttemptRow>(
      `SELECT idempotency_key, usuario_id, request_hash, estado, pedido_id,
              mp_order_id, mp_payment_id, mp_status, mp_status_detail,
              reason_code, error_code, total_amount, payer_email, order_snapshot, created_at
       FROM intento_pago
       WHERE idempotency_key = $1`,
      [idempotencyKey],
    )
    const existing = existingResult.rows[0] ?? null

    // No revelar datos de una clave que perteneciera a otro usuario.
    if (!existing || existing.usuario_id !== userId) {
      return { created: false, attempt: null, hashMismatch: true }
    }
    return {
      created: false,
      attempt: existing,
      hashMismatch: existing.request_hash !== requestHash,
    }
  } finally {
    client.release()
  }
}

async function searchOrderByExternalReference(
  idempotencyKey: string,
  createdAt: Date | string,
): Promise<MpOrderLike | null> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return null

  // Orders API exige begin_date y end_date al buscar. Se usa la fecha de creación
  // del intento para localizar una order aunque POST /v1/orders haya sufrido timeout.
  const beginDate = new Date(new Date(createdAt).getTime() - 60_000).toISOString()
  const endDate = new Date(Date.now() + 60_000).toISOString()
  const url = new URL('https://api.mercadopago.com/v1/orders')
  url.searchParams.set('begin_date', beginDate)
  url.searchParams.set('end_date', endDate)
  url.searchParams.set('external_reference', idempotencyKey)
  url.searchParams.set('type', 'online')
  url.searchParams.set('page', '1')
  url.searchParams.set('page_size', '20')

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      console.error('[process_order] Order search failed:', { httpStatus: response.status, idempotencyKey })
      return null
    }

    const payload = await response.json() as { data?: MpOrderLike[] }
    return payload.data?.find((order) => order.external_reference === idempotencyKey) ?? null
  } catch (err) {
    console.error('[process_order] Order search request failed:', err)
    return null
  }
}

async function refreshAttemptFromMercadoPago(
  idempotencyKey: string,
  userId: number,
  mpOrders: Order,
): Promise<AttemptRow | null> {
  let attempt = await loadAttempt(idempotencyKey, userId)
  if (!attempt) return null

  const staleProcessing =
    attempt.estado === 'processing' &&
    Date.now() - new Date(attempt.created_at).getTime() > 30_000
  if (
    !['pending', 'unknown', 'provider_approved'].includes(attempt.estado) &&
    !staleProcessing
  ) {
    return attempt
  }

  try {
    if (!attempt.mp_order_id && ['unknown', 'processing', 'provider_approved'].includes(attempt.estado)) {
      const foundOrder = await searchOrderByExternalReference(idempotencyKey, attempt.created_at)
      if (foundOrder?.id != null) {
        await updateAttempt(idempotencyKey, { mp_order_id: String(foundOrder.id) })
        attempt = await loadAttempt(idempotencyKey, userId) ?? attempt
      }
    }

    if (!attempt.mp_order_id) return attempt
    const currentOrder = await mpOrders.get({ id: attempt.mp_order_id }) as MpOrderLike
    const result = getMpTransaction(currentOrder)

    if (isApproved(result.status, result.statusDetail)) {
      await updateAttempt(idempotencyKey, {
        estado: 'provider_approved',
        mp_order_id: result.orderId || attempt.mp_order_id,
        mp_payment_id: result.paymentId || null,
        mp_status: result.status,
        mp_status_detail: result.statusDetail,
        reason_code: 'APRO',
      })
      await finishApprovedAttempt(idempotencyKey, userId)
    } else if (isFinalRejection(result.status)) {
      const reason = mapReason(result.status, result.statusDetail)
      await updateAttempt(idempotencyKey, {
        estado: 'rejected',
        mp_order_id: result.orderId || attempt.mp_order_id,
        mp_payment_id: result.paymentId || null,
        mp_status: result.status,
        mp_status_detail: result.statusDetail,
        reason_code: reason,
      })
    } else if (isPending(result.status)) {
      await updateAttempt(idempotencyKey, {
        estado: 'pending',
        mp_order_id: result.orderId || attempt.mp_order_id,
        mp_payment_id: result.paymentId || null,
        mp_status: result.status,
        mp_status_detail: result.statusDetail,
        reason_code: 'CONT',
      })
    }
  } catch (err) {
    // El fallo de consulta se registra solo en el backend. No se cambia el estado
    // y, por seguridad, no se permite crear otro cobro.
    console.error('[process_order] Could not refresh Mercado Pago order:', err)
  }

  return loadAttempt(idempotencyKey, userId)
}

apiRouter.post('/process_order', async (c) => {
  const user = await getSession(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const idempotencyKey = c.req.header('X-Idempotency-Key')
  if (!idempotencyKey || !UUID_V4_RE.test(idempotencyKey)) {
    console.error('[process_order] Missing or invalid X-Idempotency-Key')
    return c.json({ error: 'missing_or_invalid_idempotency_key' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', reason: 'FORM', message: REASON_MESSAGES.FORM }, 400)
  }

  const parsed = processOrderSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      reason: 'FORM',
      message: REASON_MESSAGES.FORM,
      new_attempt_allowed: true,
      unresolved: false,
    }, 400)
  }
  const data = parsed.data

  if (data.external_reference !== idempotencyKey) {
    return c.json({ error: 'idempotency_key_mismatch' }, 400)
  }

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.error('[process_order] MERCADOPAGO_ACCESS_TOKEN is not configured')
    return c.json({ error: 'payment_provider_unavailable' }, 503)
  }

  const requestHash = hashRequest(user.id, data)
  let attemptReservation: Awaited<ReturnType<typeof readRequestAttempt>>
  try {
    attemptReservation = await readRequestAttempt(idempotencyKey, user.id, requestHash)
  } catch (err) {
    console.error('[process_order] Could not register payment attempt:', err)
    return c.json({ error: 'internal_server_error' }, 500)
  }

  if (!attemptReservation.created) {
    if (attemptReservation.hashMismatch || !attemptReservation.attempt) {
      return c.json({
        error: 'idempotency_key_reused',
        message: 'Esta clave ya está asociada a otra solicitud. Consulta el estado del intento antes de continuar.',
        new_attempt_allowed: false,
        unresolved: true,
      }, 409)
    }

    let existing = attemptReservation.attempt
    if (existing.estado === 'provider_approved') {
      const recoveredOrderId = await finishApprovedAttempt(idempotencyKey, user.id)
      if (recoveredOrderId) {
        return c.json({ pedido_id: recoveredOrderId, mp_order_id: existing.mp_order_id, mp_payment_id: existing.mp_payment_id, status: 'approved', reused_attempt: true }, 200)
      }
      if (!existing.mp_order_id || !existing.mp_payment_id) {
        existing = (await refreshAttemptFromMercadoPago(idempotencyKey, user.id, makeMpOrderClient())) ?? existing
      }
    } else if (['processing', 'pending', 'unknown'].includes(existing.estado)) {
      existing = (await refreshAttemptFromMercadoPago(idempotencyKey, user.id, makeMpOrderClient())) ?? existing
    }

    const response = existingAttemptResponse(existing)
    return c.json(response.body, response.status as 200 | 202 | 402 | 409)
  }

  const payment = data.transactions.payments[0]
  if (!payment?.payment_method?.token || !payment.payment_method.id) {
    await updateAttempt(idempotencyKey, { estado: 'validation_failed', error_code: 'invalid_payment_data' })
    return c.json({ error: 'validation_error', reason: 'FORM', message: REASON_MESSAGES.FORM, new_attempt_allowed: true, unresolved: false }, 400)
  }

  const requestedQuantities = new Map<number, number>()
  for (const item of data.items) {
    requestedQuantities.set(
      item.producto_id,
      (requestedQuantities.get(item.producto_id) ?? 0) + item.cantidad,
    )
  }
  const requestedItems = [...requestedQuantities.entries()]
    .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    .sort((a, b) => a.producto_id - b.producto_id)

  let client: PoolClient | null = null
  let transactionOpen = false
  let providerCallStarted = false
  let providerApprovedPersisted = false
  let snapshot: OrderSnapshot | null = null
  let mpOrderId = ''
  let mpPaymentId = ''
  let mpStatus = 'unknown'
  let mpStatusDetail = 'unknown'

  try {
    const txClient = await db.connect()
    client = txClient
    await txClient.query('BEGIN')
    transactionOpen = true

    let totalCents = 0
    const lines: OrderLineSnapshot[] = []

    for (const item of requestedItems) {
      const result = await txClient.query<{
        id: number
        nombre: string
        precio: string | number
        stock: number
      }>(
        'SELECT id, nombre, precio, stock FROM producto WHERE id = $1 FOR UPDATE',
        [item.producto_id],
      )

      const product = result.rows[0]
      if (!product) {
        await txClient.query('ROLLBACK')
        transactionOpen = false
        txClient.release()
        client = null
        await updateAttempt(idempotencyKey, { estado: 'validation_failed', error_code: 'product_not_found' })
        return c.json({ error: 'product_not_found', product_id: item.producto_id, new_attempt_allowed: true, unresolved: false }, 422)
      }

      if (item.cantidad > Number(product.stock)) {
        await txClient.query('ROLLBACK')
        transactionOpen = false
        txClient.release()
        client = null
        await updateAttempt(idempotencyKey, { estado: 'validation_failed', error_code: 'insufficient_stock' })
        return c.json({ error: 'insufficient_stock', product: product.nombre, new_attempt_allowed: true, unresolved: false }, 422)
      }

      const priceCents = moneyToCents(product.precio)
      totalCents += priceCents * item.cantidad
      lines.push({
        product_id: product.id,
        quantity: item.cantidad,
        price: formatCents(priceCents),
      })
    }

    snapshot = {
      total: formatCents(totalCents),
      payer_email: data.payer.email,
      lines,
    }

    // Guardamos el snapshot en una conexión separada para que sobreviva si la
    // transacción del pedido se revierte después de un pago aprobado.
    await saveSnapshot(idempotencyKey, snapshot)

    const mpOrders = makeMpOrderClient()
    providerCallStarted = true
    let mpResponse: MpOrderLike
    try {
      mpResponse = await createOrderFromSnapshot(
        mpOrders,
        idempotencyKey,
        snapshot,
        payment,
        data.payer.identification,
      ) as MpOrderLike
    } catch (err) {
      const mpError = err as {
        status?: number
        statusCode?: number
        error?: string
        message?: string
        cause?: unknown
        causes?: unknown
      }

      const httpStatus = mpError.status ?? mpError.statusCode

      console.error('[process_order] Mercado Pago Order.create failed:', {
        status: httpStatus,
        error: mpError.error,
        message: mpError.message,
        causes: mpError.causes ?? mpError.cause,
        idempotencyKey,
      })

      await txClient.query('ROLLBACK').catch(() => { })
      transactionOpen = false
      txClient.release()
      client = null

      // Mercado Pago rechazó el pago: es un resultado definitivo.
      if (httpStatus === 402) {
        await updateAttempt(idempotencyKey, {
          estado: 'rejected',
          reason_code: 'OTHE',
          error_code: 'mp_payment_rejected',
        })

        return c.json(
          {
            error: 'payment_not_approved',
            reason: 'OTHE',
            message: REASON_MESSAGES.OTHE,
            new_attempt_allowed: true,
            unresolved: false,
          },
          402,
        )
      }

      // Otros errores: no asumir que el pago falló.
      await updateAttempt(idempotencyKey, {
        estado: 'unknown',
        error_code: 'provider_request_failed',
      })

      return c.json(
        {
          error: 'payment_status_unknown',
          message:
            'No pudimos confirmar el resultado del pago. No vuelvas a enviarlo mientras verificamos el estado.',
          new_attempt_allowed: false,
          unresolved: true,
        },
        502,
      )
    }

    const mpResult = getMpTransaction(mpResponse)
    mpOrderId = mpResult.orderId
    mpPaymentId = mpResult.paymentId
    mpStatus = mpResult.status
    mpStatusDetail = mpResult.statusDetail

    if (isFinalRejection(mpStatus)) {
      const reason = mapReason(mpStatus, mpStatusDetail)
      await txClient.query('ROLLBACK')
      transactionOpen = false
      txClient.release()
      client = null
      await updateAttempt(idempotencyKey, {
        estado: 'rejected',
        mp_order_id: mpOrderId || null,
        mp_payment_id: mpPaymentId || null,
        mp_status: mpStatus,
        mp_status_detail: mpStatusDetail,
        reason_code: reason,
      })
      console.info('[process_order] Payment was not approved:', {
        idempotencyKey,
        mpOrderId,
        mpStatus,
        mpStatusDetail,
        publicReason: reason,
      })
      return c.json({
        error: 'payment_not_approved',
        reason,
        message: REASON_MESSAGES[reason],
        new_attempt_allowed: true,
        unresolved: false,
      }, 402)
    }

    if (isPending(mpStatus)) {
      await txClient.query('ROLLBACK')
      transactionOpen = false
      txClient.release()
      client = null
      await updateAttempt(idempotencyKey, {
        estado: 'pending',
        mp_order_id: mpOrderId || null,
        mp_payment_id: mpPaymentId || null,
        mp_status: mpStatus,
        mp_status_detail: mpStatusDetail,
        reason_code: 'CONT',
      })
      return c.json({
        error: 'payment_pending',
        reason: 'CONT',
        message: REASON_MESSAGES.CONT,
        new_attempt_allowed: false,
        unresolved: true,
      }, 202)
    }

    if (!isApproved(mpStatus, mpStatusDetail)) {
      await txClient.query('ROLLBACK')
      transactionOpen = false
      txClient.release()
      client = null
      await updateAttempt(idempotencyKey, {
        estado: 'unknown',
        mp_order_id: mpOrderId || null,
        mp_payment_id: mpPaymentId || null,
        mp_status: mpStatus,
        mp_status_detail: mpStatusDetail,
        error_code: 'unrecognized_provider_status',
      })
      console.error('[process_order] Unrecognized Mercado Pago status:', { mpStatus, mpStatusDetail, mpOrderId })
      return c.json({ error: 'payment_status_unknown', message: 'No pudimos confirmar el resultado del pago. No vuelvas a enviarlo mientras verificamos el estado.', new_attempt_allowed: false, unresolved: true }, 502)
    }

    // Persistimos el resultado externo antes de escribir pedido/pago. Si la
    // transacción local falla, un reintento recupera el pedido sin volver a cobrar.
    await updateAttempt(idempotencyKey, {
      estado: 'provider_approved',
      mp_order_id: mpOrderId || null,
      mp_payment_id: mpPaymentId || null,
      mp_status: mpStatus,
      mp_status_detail: mpStatusDetail,
      reason_code: 'APRO',
    })
    providerApprovedPersisted = true

    if (!mpPaymentId || !mpOrderId) {
      await txClient.query('ROLLBACK')
      transactionOpen = false
      txClient.release()
      client = null
      console.error('[process_order] Approved response did not contain order/payment IDs:', { mpOrderId, mpPaymentId })
      return c.json({ error: 'payment_approved_reconciliation_required', message: 'El pago fue aprobado y estamos confirmando el pedido. No vuelvas a enviarlo.', new_attempt_allowed: false, unresolved: true }, 202)
    }

    const orderResult = await txClient.query<{ id: number }>(
      `INSERT INTO pedido (fecha, total, status, usuario_id)
       VALUES (NOW(), $1, 'CONFIRMADO', $2)
       RETURNING id`,
      [snapshot.total, user.id],
    )
    const orderId = orderResult.rows[0]!.id

    for (const line of snapshot.lines) {
      await txClient.query(
        `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio)
         VALUES ($1, $2, $3, $4)`,
        [orderId, line.product_id, line.quantity, line.price],
      )
      await txClient.query(
        'UPDATE producto SET stock = stock - $1 WHERE id = $2',
        [line.quantity, line.product_id],
      )
    }

    await txClient.query(
      `INSERT INTO pago
         (pedido_id, mp_payment_id, status, idempotency_key, mp_amount, payer_email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, mpPaymentId, mpStatus, idempotencyKey, snapshot.total, snapshot.payer_email],
    )

    await txClient.query(
      `UPDATE intento_pago
       SET estado = 'approved', pedido_id = $2, reason_code = 'APRO',
           error_code = NULL, updated_at = NOW()
       WHERE idempotency_key = $1`,
      [idempotencyKey, orderId],
    )

    await txClient.query('COMMIT')
    transactionOpen = false
    txClient.release()
    client = null

    return c.json({ pedido_id: orderId, mp_order_id: mpOrderId, mp_payment_id: mpPaymentId, status: 'approved' }, 201)
  } catch (err) {
    if (client && transactionOpen) await client.query('ROLLBACK').catch(() => { })
    if (client) client.release()
    client = null

    console.error('[process_order] unexpected backend error:', err)

    if (providerApprovedPersisted) {
      const recoveredOrderId = await finishApprovedAttempt(idempotencyKey, user.id).catch((recoveryError) => {
        console.error('[process_order] approved payment recovery failed:', recoveryError)
        return null
      })
      if (recoveredOrderId) {
        const attempt = await loadAttempt(idempotencyKey, user.id)
        return c.json({ pedido_id: recoveredOrderId, mp_order_id: attempt?.mp_order_id ?? mpOrderId, mp_payment_id: attempt?.mp_payment_id ?? mpPaymentId, status: 'approved', recovered: true }, 200)
      }
      return c.json({ error: 'payment_approved_reconciliation_required', message: 'El pago fue aprobado, pero estamos confirmando el pedido. No vuelvas a enviarlo.', new_attempt_allowed: false, unresolved: true }, 202)
    }

    if (!providerCallStarted) {
      await updateAttempt(idempotencyKey, { estado: 'validation_failed', error_code: 'internal_error' }).catch(() => { })
      return c.json({ error: 'internal_server_error', new_attempt_allowed: true, unresolved: false }, 500)
    }

    await updateAttempt(idempotencyKey, {
      estado: 'unknown',
      mp_order_id: mpOrderId || null,
      mp_payment_id: mpPaymentId || null,
      mp_status: mpStatus,
      mp_status_detail: mpStatusDetail,
      error_code: 'unknown_payment_result',
    }).catch(() => { })

    return c.json({
      error: 'payment_status_unknown',
      message: 'No pudimos confirmar el resultado del pago. No vuelvas a enviarlo mientras verificamos el estado.',
      new_attempt_allowed: false,
      unresolved: true,
    }, 502)
  }
})

// Endpoint para que el frontend consulte un intento pendiente o de resultado incierto.
// GET /process_order/:idempotencyKey
apiRouter.get('/process_order/:idempotencyKey', async (c) => {
  const user = await getSession(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const idempotencyKey = c.req.param('idempotencyKey')
  if (!UUID_V4_RE.test(idempotencyKey)) {
    return c.json({ error: 'missing_or_invalid_idempotency_key' }, 400)
  }

  let attempt = await loadAttempt(idempotencyKey, user.id)
  if (!attempt) return c.json({ error: 'attempt_not_found' }, 404)

  if (attempt.estado === 'provider_approved') {
    await finishApprovedAttempt(idempotencyKey, user.id)
    attempt = await loadAttempt(idempotencyKey, user.id)
    if (attempt && !attempt.pedido_id && (!attempt.mp_order_id || !attempt.mp_payment_id)) {
      attempt = (await refreshAttemptFromMercadoPago(idempotencyKey, user.id, makeMpOrderClient())) ?? attempt
    }
    if (!attempt) return c.json({ error: 'attempt_not_found' }, 404)
  } else if (['processing', 'pending', 'unknown'].includes(attempt.estado)) {
    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      attempt = (await refreshAttemptFromMercadoPago(idempotencyKey, user.id, makeMpOrderClient())) ?? attempt
    }
  }

  if (attempt.estado === 'approved' && attempt.pedido_id != null) {
    return c.json({
      status: 'approved',
      pedido_id: attempt.pedido_id,
      mp_order_id: attempt.mp_order_id,
      mp_payment_id: attempt.mp_payment_id,
      reason: 'APRO',
      message: REASON_MESSAGES.APRO,
      unresolved: false,
    }, 200)
  }

  if (attempt.estado === 'rejected') {
    const reason = attempt.reason_code ?? 'OTHE'
    return c.json({ status: 'rejected', error: 'payment_not_approved', reason, message: REASON_MESSAGES[reason], new_attempt_allowed: true, unresolved: false }, 200)
  }

  if (attempt.estado === 'pending') {
    return c.json({ status: 'pending', reason: 'CONT', message: REASON_MESSAGES.CONT, new_attempt_allowed: false, unresolved: true }, 200)
  }

  if (attempt.estado === 'validation_failed') {
    return c.json({ status: 'validation_failed', error: attempt.error_code ?? 'validation_failed', new_attempt_allowed: true, unresolved: false }, 200)
  }

  return c.json({
    status: attempt.estado,
    error: attempt.estado === 'provider_approved' ? 'payment_approved_reconciliation_required' : 'payment_status_unknown',
    message: 'El resultado del pago todavía no está resuelto. No inicies otro cobro.',
    new_attempt_allowed: false,
    unresolved: true,
  }, 200)
})

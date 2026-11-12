import bcrypt from 'bcryptjs'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/database'
import { createSession, destroySession, getSession } from './session'

export const authRouter = new Hono()

const registerSchema = z.object({
  nombre: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

authRouter.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input' }, 400)
  }

  const { nombre, email, password } = parsed.data

  const existing = await db.query('SELECT id FROM usuario WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    return c.json({ error: 'email_already_registered' }, 409)
  }

  const password_hash = await bcrypt.hash(password, 10)

  const result = await db.query<{ id: number; nombre: string; email: string, rol:string }>(
    `INSERT INTO usuario (nombre, email, rol, password_hash)
     VALUES ($1, $2, 'USER', $3)
     RETURNING id, nombre, email,rol`,
    [nombre, email, password_hash],
  )

  const user = result.rows[0]!
  await createSession(c, user)
  return c.json(user, 201)
})

authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input' }, 400)
  }

  const { email, password } = parsed.data

  const result = await db.query<{
    id: number
    nombre: string
    email: string
    password_hash: string | null
    rol: string
  }>('SELECT id, nombre, email, password_hash, rol FROM usuario WHERE email = $1', [email])

  if (result.rows.length === 0) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  const row = result.rows[0]!

  if (!row.password_hash) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  const valid = await bcrypt.compare(password, row.password_hash)
  if (!valid) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  const user = { id: row.id, nombre: row.nombre, email: row.email, rol:row.rol }
  await createSession(c, user)
  return c.json(user)
})





authRouter.post('/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

authRouter.get('/me', async (c) => {
  const user = await getSession(c)
  if (!user) {
    return c.json(null, 200)
  }
  return c.json(user)
})

import { ApolloServer } from '@apollo/server'
import { httpHandler } from '@cypriotunknown/apollo-hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { authRouter } from './src/auth/authRouter'
import { apiRouter } from './src/api/apiRouter'
import { productosRouter } from './src/api/productos'
import { getSession } from './src/auth/session'
import { resolvers } from './src/graphql/resolvers'
import { typeDefs } from './src/graphql/schema'

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { getRequestListener } from '@hono/node-server'


const schema = makeExecutableSchema({ typeDefs, resolvers })

const apollo = new ApolloServer({
schema
})

await apollo.start()

const app = new Hono()

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4321,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

app.use(
  '*',
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
)

app.get('/', (c) => {
  return c.text('Backend funcionando')
})

app.route('/auth', authRouter)
app.route('/api', apiRouter)
app.route('/productos',productosRouter)

const handleGraphql = httpHandler(apollo, {
  context: async ({ honoCtx }) => {
    const user = await getSession(honoCtx)
    return {
      user,
    }
  },
})

app.post('/graphql', handleGraphql)
app.get('/graphql', handleGraphql)
const server = createServer(getRequestListener(app.fetch))

const wsServer = new WebSocketServer({
  server,
  path: '/graphql',
})

useServer(
  {
    schema,
    context: async (ctx) => {
      const request = ctx.extra.request
      const cookieHeader = request.headers.cookie || ''

      const fakeHonoCtx = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'cookie') {
              return cookieHeader
            }
            return undefined
          },
        },
      }

      const user = await getSession(fakeHonoCtx as any)
      return {
        user,
      }
    },
  },
  wsServer,
)

const port = Number(process.env.PORT) || 4000
server.listen(port, () => {
  console.log(`Servidor HTTP y WebSockets http://localhost:${port}/graphql`)
})

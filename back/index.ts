import { ApolloServer } from '@apollo/server'
import { httpHandler } from '@cypriotunknown/apollo-hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { apiRouter } from './src/api/apiRouter'
import { productosRouter } from './src/api/productos'
import { authRouter } from './src/auth/authRouter'
import { getSession } from './src/auth/session'
import { resolvers } from './src/graphql/resolvers'
import { typeDefs } from './src/graphql/schema'

import { makeExecutableSchema } from '@graphql-tools/schema'
import { getRequestListener } from '@hono/node-server'
import { useServer } from 'graphql-ws/use/ws'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerMcpModules } from './src/mcp/register'


const schema = makeExecutableSchema({ typeDefs, resolvers })

const apollo = new ApolloServer({
  schema
})

await apollo.start()

function createMcpServer() {
  const mcpServer = new McpServer({
    name: 'mcp-server',
    version: '1.0.0'
  })

  registerMcpModules(mcpServer)

  return mcpServer
}

const app = new Hono()

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim())

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
app.route('/productos', productosRouter)

const AS_MCP = process.env.AS_MCP

app.all('/mcp*', async (c) => {
  const authHeader = c.req.header('x-admin-token')
  const isTokenAdmin = authHeader === AS_MCP

  if (!isTokenAdmin) {
    return c.json(
      { error: 'Denied access. Credentials required.' },
      403
    )
  }

  const mcpServer = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport()
  await mcpServer.connect(transport)

  return transport.handleRequest(c.req.raw)
})

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
wsServer.on('connection', () => {
  console.log('[WS] Cliente conectado');
});

wsServer.on('error', (error) => {
  console.error('[WS] Error del servidor:', error);
});
useServer(
  {
    schema,
    context: async (ctx) => {
      const request = ctx.extra.request
      const cookieHeader = request.headers.cookie

      const rawRequest = new Request('http://localhost/graphql', {
        headers: cookieHeader
          ? { cookie: cookieHeader }
          : {},
      })

      const fakeHonoCtx = {
        req: {
          raw: rawRequest,
          header: (name: string) => {
            if (name.toLowerCase() === 'cookie') {
              return cookieHeader
            }
            return undefined
          },
        },
      }

      const user = await getSession(fakeHonoCtx as any)
      console.log(
        '[WS AUTH]',
        user ? `Autenticado: ${user.id}` : 'Sin sesión'
      );
      return { user }
    },
  },
  wsServer,
)

const port = Number(process.env.PORT) || 4000
server.listen(port, () => {
  console.log(`Servidor HTTP y WebSockets http://localhost:${port}/graphql`)
  console.log(`Servidor MCP http://localhost:${port}/mcp`)
})

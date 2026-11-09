import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { draftAnOrderResolver } from './resolvers/prompts/draft_an_order'
import { getSuppliersByProductResolver } from './resolvers/resources/suppliers'
import { sendSupplierEmailResolver } from './resolvers/tools/send_supplier_email'

export function registerMcpModules(mcpServer: McpServer) {
    mcpServer.registerPrompt(
        'draft_an_order',
        {
            description: 'Template to orchestrate restocking by listing suppliers and asking user preference before sending emails.',
            argsSchema: {
                product: z.string().describe('Product name or SKU to restock'),
                quantity: z.coerce.number().describe('Quantity of units to order')
            }
        },
        async ({ product, quantity }) => {
            const instruction = draftAnOrderResolver(product, quantity)

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: instruction
                        }
                    }
                ]
            }
        }
    )

    mcpServer.registerResource(
        'suppliers_by_product',
        new ResourceTemplate('ecommerce://products/{product}/suppliers', { list: undefined }),
        {
            description: 'Returns all registered suppliers for a given product.'
        },
        async (uri, { product }) => {
            const suppliers = await getSuppliersByProductResolver(String(product))

            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(suppliers, null, 2),
                        mimeType: 'application/json'
                    }
                ]
            }
        }
    )

    mcpServer.registerTool(
        'send_supplier_email',
        {
            description: 'Sends a purchase order email to a supplier by looking up their contact email internally.',
            inputSchema: {
                supplierName: z.string().describe('Exact name of the selected supplier'),
                product: z.string().describe('Product name or SKU'),
                quantity: z.number().describe('Quantity of units to order')
            }
        },
        async ({ supplierName, product, quantity }) => {
            const resultMessage = await sendSupplierEmailResolver({
                supplierName,
                product,
                quantity
            })

            return {
                content: [
                    {
                        type: 'text',
                        text: resultMessage
                    }
                ]
            }
        }
    )
}

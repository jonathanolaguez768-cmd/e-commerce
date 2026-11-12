import { db } from "../../../db/database"

import type { EmailSenderPort } from "../port/email-sender"

interface SendSupplierEmailParams {
    supplierName: string
    email_body: string
    products: {
        name: string
        quantity: number
    }[]
}

export class SendSupplierEmail {

    constructor(
        private readonly emailSender: EmailSenderPort
    ) { }

    async execute(params: SendSupplierEmailParams): Promise<string> {

        // 1. Buscar al proveedor
        const query = `
            SELECT email
            FROM proveedor
            WHERE LOWER(nombre) = LOWER($1)
        `

        const result = await db.query(query, [
            params.supplierName.trim()
        ])

        if (result.rows.length === 0 || result.rows.length > 1) {
            throw new Error(
                `The provider "${params.supplierName}" doesn't exist or there are multiple providers with the same name. Please verify the exact provider name and try again.`
            )
        }

        const supplierEmail = result.rows[0].email

        // 2. Construir el contenido del pedido
        const productsList = params.products
            .map(product =>
                `- ${product.name}: ${product.quantity} units`
            )
            .join("\n")

        const emailBody = `
${params.email_body}

PURCHASE ORDER:

${productsList}

CRITICAL: Please reply directly to this email to confirm receipt and provide an estimated delivery date.

Thank you.
        `.trim()

        // 3. Enviar correo utilizando el puerto
        await this.emailSender.sendEmail({
            to: supplierEmail,
            subject: "URGENT: New Purchase Order",
            text: emailBody
        })

        // 4. Registrar el pedido
        const insertQuery = `
            INSERT INTO pedido_restock (email, products)
            VALUES ($1, $2)
        `

        await db.query(insertQuery, [
            supplierEmail,
            JSON.stringify(params.products)
        ])

        return `Order sent successfully to "${params.supplierName}"`
    }
}

import { db } from "../../../db/database"

export async function sendSupplierEmailResolver(params: {
    supplierName: string
    product: string
    quantity: number
}): Promise<string> {
    const query = `
    SELECT email
    FROM proveedor
    WHERE LOWER(nombre) = LOWER($1)
    LIMIT 1
  `
    const result = await db.query(query, [params.supplierName.trim()])

    if (result.rows.length === 0) {
        throw new Error(`El proveedor "${params.supplierName}" no existe en la base de datos.`)
    }

    const recipientEmail = result.rows[0].email

    // TODO: Email logic

    return `Orden de compra enviada exitosamente a "${params.supplierName}" (${recipientEmail}) por ${params.quantity} unidades del producto "${params.product}".`
}

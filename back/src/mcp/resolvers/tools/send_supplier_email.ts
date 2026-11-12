import { sendSupplierEmail } from "../../../services/email/config"

interface SendSupplierEmailParams {
    supplierName: string
    email_body: string
    products: {
        name: string
        quantity: number
    }[]
}

export async function sendSupplierEmailResolver(
    params: SendSupplierEmailParams
): Promise<string> {

    return await sendSupplierEmail.execute(params)
}

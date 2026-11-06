import type { Product } from "./product"

export type Order = {
    id: number
    date: string
    total: number
    products: Product[]
    status: string;
    pago?: {
    ticket_url: string | null;
    referencia: string | null;
    expira_en: string | null;
    } | null;
}

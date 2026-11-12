import { db } from "../../../db/database";

interface Product {
    name: string
    price: number
    stock: number
}

export async function getProducts(): Promise<Product[]> {
    const query = `
    SELECT nombre as name, precio as price, stock FROM producto;
  `;

    const result = await db.query(query);
    return result.rows;
}

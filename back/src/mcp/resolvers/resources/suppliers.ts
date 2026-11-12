import { db } from "../../../db/database"

export interface Supplier {
    id: string
    name: string
    leadTimeDays: number
    unitCost: number
}

export async function getSuppliersByProductResolver(product: string): Promise<Supplier[]> {
    const cleanName = decodeURIComponent(product).trim();

    const query = `
    SELECT
      pr.id::text AS id,
      pr.nombre AS name,
      pp.dias_entrega AS "leadTimeDays",
      pp.costo_unitario::float AS "unitCost"
    FROM producto p
    JOIN producto_proveedor pp ON pp.producto_id = p.id
    JOIN proveedor pr ON pr.id = pp.proveedor_id
    WHERE LOWER(p.nombre) LIKE LOWER($1)
  `;

    const result = await db.query(query, [`%${cleanName}%`]);
    return result.rows;
}

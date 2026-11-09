export function draftAnOrderResolver(product: string, quantity: number): string {
    return `El usuario desea reabastecer el producto "${product}" con ${quantity} unidades.

Sigue este procedimiento en orden:
1. Consulta el recurso "ecommerce://products/${product}/suppliers" para obtener los proveedores disponibles para este producto.
2. Muestra al usuario:
   - La lista de proveedores en una tabla (Nombre, Tiempo de entrega en días y Precio unitario).
   - Una vista previa del detalle de la orden (Producto: "${product}", Cantidad: ${quantity} unidades).
3. Pregúntale al usuario a cuál de los proveedores listados desea enviarle la orden.
4. Una vez que el usuario elija el proveedor, ejecuta la herramienta "send_supplier_email" pasándole únicamente el nombre del proveedor en el parámetro "supplierName".`
}

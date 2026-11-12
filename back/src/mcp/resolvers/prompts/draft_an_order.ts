export function draftAnOrderResolver(product: string, quantity: number): string {
    return `The user wishes to restock the product "${product}" with ${quantity} units.

Follow this procedure in order:
1. Consult the resource "ecommerce://products/${product}/suppliers" to retrieve the available suppliers for this product.
2. Display the following to the user:
   - A list of suppliers in a table (Name, Delivery time in days, and Unit price).
   - A preview of the order details (Product: "${product}", Quantity: ${quantity} units).
3. Ask the user which of the listed suppliers they would like to send the order to.
4. Once the user has selected a supplier, execute the "send_supplier_email" tool, passing only the supplier's name in the "supplierName" parameter, along with the email body formatted in HTML.`
}

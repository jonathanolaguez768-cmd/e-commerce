import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import { API_URL } from "../config";
import "../styles/CheckoutOxxo.css";

interface OxxoResult {
    pedido_id: number;
    ticket_url: string;
    reference: string | null;
    expires_at: string | null;
}

function translateError(code?: string, product?: string): string {
    switch (code) {
        case "unauthorized":
            return "Tu sesión expiró. Inicia sesión nuevamente.";
        case "insufficient_stock":
            return `No hay suficiente stock de ${product ?? "un producto"}.`;
        case "product_not_found":
            return "Uno de los productos ya no existe.";
        case "validation_error":
            return "Revisa que tus datos estén completos y sean válidos.";
        case "oxxo_ticket_not_generated":
            return "No se pudo generar la ficha de pago. Intenta de nuevo.";
        case "duplicate_request":
            return "Tu solicitud ya se está procesando. Espera un momento.";
        default:
            return "Ocurrió un error al generar tu ficha. Intenta de nuevo.";
    }
}

const MX_TZ = "America/Mexico_City";

function formatDeadline(iso: string): string {
    const date = new Date(iso);

    const time = date.toLocaleTimeString("en-GB", {
        timeZone: MX_TZ,
        hour12: false,
    });

    if (time === "23:59:59") {
        const day = date.toLocaleDateString("es-MX", {
            timeZone: MX_TZ,
            day: "numeric",
            month: "long",
        });
        return `a más tardar el ${day}`;
    }

    const day = date.toLocaleDateString("es-MX", {
        timeZone: MX_TZ,
        day: "numeric",
        month: "long",
    });
    const hour = date.toLocaleTimeString("es-MX", {
        timeZone: MX_TZ,
        hour: "numeric",
        minute: "2-digit",
    });
    return `antes del ${day} a las ${hour}`;
}

export default function CheckoutOxxo() {
    const items = useCartStore((s) => s.items);
    const clearCart = useCartStore((s) => s.clearCart);
    const user = useAuthStore((s) => s.user);

    const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
    const isSubmittingRef = useRef(false);

    const [firstName, setFirstName] = useState(user?.nombre ?? "");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState(user?.email ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<OxxoResult | null>(null);

    const total = items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
    );

    const cartSignature = JSON.stringify(
        items
            .map((item) => ({ id: item.id, quantity: item.quantity }))
            .sort((a, b) => a.id - b.id)
    );

    // Si el usuario carga después de montar el componente, rellenamos los campos vacíos.
    useEffect(() => {
        if (user) {
            setFirstName((v) => v || user.nombre);
            setEmail((v) => v || user.email);
        }
    }, [user]);

    // Si cambia el carrito, es otra compra: nueva llave de idempotencia.
    useEffect(() => {
        idempotencyKeyRef.current = crypto.randomUUID();
        isSubmittingRef.current = false;
    }, [cartSignature]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (isSubmittingRef.current || items.length === 0) return;

        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setError(null);

        const key = idempotencyKeyRef.current;

        try {
            const res = await fetch(`${API_URL}/api/process_oxxo_order`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": key,
                },
                body: JSON.stringify({
                    external_reference: key,
                    payer: {
                        email: email.trim(),
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                    },
                    items: items.map((item) => ({
                        producto_id: item.id,
                        cantidad: item.quantity,
                    })),
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(translateError(data?.error, data?.product));
            }

            setResult(data as OxxoResult);
            clearCart();
        } catch (err) {
            console.error("OXXO payment error:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Ocurrió un error. Intenta de nuevo."
            );
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    // ---- Pantalla de éxito: ficha lista ----
    if (result) {
        const expiresText = result.expires_at
            ? formatDeadline(result.expires_at)
            : null;

        return (
            <section className="oxxo">
                <p className="oxxo__eyebrow">
                    PEDIDO #{result.pedido_id} REGISTRADO
                </p>
                <h2>Tu ficha de pago OXXO está lista</h2>
                <p className="oxxo__text">
                    Tu pedido quedó <strong>pendiente de pago</strong>. Se
                    confirmará cuando OXXO reporte tu pago.
                </p>

                {result.reference && (
                    <div className="oxxo__reference">
                        <span>Referencia</span>
                        <strong>{result.reference}</strong>
                    </div>
                )}

                {expiresText && (
                    <p className="oxxo__text">
                        Paga <strong>{expiresText}</strong>.
                    </p>
                )}
                <a
                    className="oxxo__button"
                    href={result.ticket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    VER / IMPRIMIR FICHA
                </a>

                <a className="oxxo__link" href="/orders-history">
                    Ir a mi historial de pedidos
                </a>
            </section>
        );
    }

    // ---- Carrito vacío ----
    if (items.length === 0) {
        return (
            <section className="oxxo">
                <h2>No hay productos</h2>
                <p className="oxxo__text">
                    Agrega productos al carrito antes de continuar.
                </p>
                <a className="oxxo__button" href="/cart">
                    VOLVER AL CARRITO
                </a>
            </section>
        );
    }

    // ---- Formulario ----
    return (
        <section className="oxxo">
            <a className="oxxo__back" href="/checkout">
                ← Pagar con tarjeta
            </a>

            <p className="oxxo__eyebrow">PAGO EN EFECTIVO</p>
            <h2>Pagar en OXXO</h2>
            <p className="oxxo__text">
                Genera tu ficha y paga en cualquier tienda OXXO. Tu pedido se
                confirma cuando se acredite el pago.
            </p>

            <form onSubmit={handleSubmit}>
                <div className="oxxo__row">
                    <div className="oxxo__field">
                        <label htmlFor="oxxo-first-name">Nombre(s)</label>
                        <input
                            id="oxxo-first-name"
                            type="text"
                            required
                            maxLength={60}
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                        />
                    </div>

                    <div className="oxxo__field">
                        <label htmlFor="oxxo-last-name">Apellido(s)</label>
                        <input
                            id="oxxo-last-name"
                            type="text"
                            required
                            maxLength={60}
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                    </div>
                </div>

                <div className="oxxo__field">
                    <label htmlFor="oxxo-email">Correo electrónico</label>
                    <input
                        id="oxxo-email"
                        type="email"
                        required
                        maxLength={150}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="oxxo__summary">
                    {items.map((item) => (
                        <div className="oxxo__item" key={item.id}>
                            <span>
                                {item.name} × {item.quantity}
                            </span>
                            <span>
                                ${(item.price * item.quantity).toFixed(2)}
                            </span>
                        </div>
                    ))}
                    <div className="oxxo__total">
                        <span>Total</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>

                {error && <div className="oxxo__error">{error}</div>}

                <button
                    className="oxxo__button"
                    type="submit"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "GENERANDO FICHA..." : "GENERAR FICHA OXXO"}
                </button>
            </form>
        </section>
    );
}
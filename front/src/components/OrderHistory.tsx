
import { useEffect, useState } from 'react';

import { getOrders } from '../services/graphql';
import '../styles/history.css';
import type { Order } from '../types/order';
import './OrderCard.css';

function OrderCard({ order }: { order: Order }) {
    return (
        <article className="order-card">
            <header className="order-card__header">
                <div>
                    <span>Pedido #{order.id}</span>
                    <h2>Pedido realizado</h2>
                </div>

                <strong>${order.total.toFixed(2)}</strong>
            </header>

            <p className="order-card__date">{order.date}</p>

            <div className="order-card__products">
                {order.products.map((product, index) => (
                    <div
                        className="order-card__product"
                        key={`${order.id}-${product.id}-${index}`}
                    >
                        <img
                            src={product.image}
                            alt={product.name}
                            width="80"
                            height="80"
                            loading="lazy"
                            decoding="async"
                        />

                        <div>
                            <h3>{product.name}</h3>
                            <span>${product.price.toFixed(2)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </article>
    );
}

export default function OrderHistory() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadOrders() {
            try {
                const data = await getOrders();

                if (!cancelled) {
                    setOrders(data);
                }
            } catch (e) {
                console.error('Error al obtener los pedidos:', e);

                if (!cancelled) {
                    const message =
                        e instanceof Error ? e.message : '';

                    if (message.toLowerCase().includes('unauthenticated')) {
                        setError('Necesitas iniciar sesión para consultar tus pedidos.');
                    } else {
                        setError('No se pudo cargar tu historial de pedidos. Inténtalo nuevamente.');
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        void loadOrders();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="orders-container">
            <header className="orders-header">
                <h1>Mis pedidos</h1>
                <p className="orders-subtitle">
                    Revisa el historial y estado de tus compras
                </p>
            </header>

            {isLoading ? (
                <p role="status" aria-live="polite">
                    Cargando tus pedidos...
                </p>
            ) : error ? (
                <div className="empty-orders" role="alert">
                    <p className="empty-title">{error}</p>
                    <a href="/login">Ir a iniciar sesión</a>
                </div>
            ) : orders.length > 0 ? (
                <section aria-label="Historial de pedidos">
                    {orders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </section>
            ) : (
                <div className="empty-orders">
                    <p className="empty-title">
                        Aún no tienes pedidos registrados
                    </p>
                    <p className="empty-text">
                        Explora la tienda y realiza tu primera compra.
                    </p>
                </div>
            )}
        </div>
    );
}


import { gql } from '@apollo/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { client } from '../services/apolloClient';
import { getProducts } from '../services/graphql';
import type { Product } from '../types/product';
import './ProductCard.css';

interface Props {
    initialProducts: Product[];
    initialCursor: string | null;
    initialHasMore: boolean;
}

const PEDIDO_CREADO_SUBSCRIPTION = gql`
  subscription PedidoCreado {
    pedidoCreado {
      id
      fecha
      total
      status
      usuario_id
    }
  }
`;

export default function CatalogLive({
    initialProducts,
    initialCursor,
    initialHasMore,
}: Props) {
    const [products, setProducts] = useState(initialProducts);
    const [nextCursor, setNextCursor] = useState(initialCursor);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshError, setRefreshError] = useState(false);

    const loadedCount = useRef(initialProducts.length);
    const loadingRef = useRef(false);

    const refreshProducts = useCallback(async () => {
        try {
            const limit = Math.max(loadedCount.current, 1);
            const data = await getProducts(limit);

            setProducts(data.productos);
            setNextCursor(data.siguienteCursor);
            setHasMore(data.hayMas);
            setRefreshError(false);
        } catch (error) {
            console.error('Error al actualizar el inventario:', error);
            setRefreshError(true);
        }
    }, []);

    useEffect(() => {
        const subscription = client
            .subscribe({
                query: PEDIDO_CREADO_SUBSCRIPTION,
            })
            .subscribe({
                next: () => {
                    void refreshProducts();
                },
                error: (error) => {
                    console.error('Error en la suscripción de pedidos:', error);
                },
            });

        return () => subscription.unsubscribe();
    }, [refreshProducts]);

    const handleLoadMore = async () => {
        if (loadingRef.current || !hasMore) return;

        loadingRef.current = true;
        setIsLoading(true);

        try {
            const data = await getProducts(6, nextCursor);

            setProducts((previous) => {
                const existingIds = new Set(previous.map((p) => p.id));
                const newProducts = data.productos.filter(
                    (product) => !existingIds.has(product.id),
                );

                const combined = [...previous, ...newProducts];
                loadedCount.current = combined.length;

                return combined;
            });

            setNextCursor(data.siguienteCursor);
            setHasMore(data.hayMas);
        } catch (error) {
            console.error('Error al cargar más productos:', error);
        } finally {
            loadingRef.current = false;
            setIsLoading(false);
        }
    };

    return (
        <>
            {refreshError && (
                <p role="status">
                    No se pudo actualizar el inventario. Se muestran los últimos datos disponibles.
                </p>
            )}

            {products.map((product) => {
                const isOutOfStock = product.stock <= 0;

                return (
                    <article className="product-card" key={product.id}>
                        <a
                            href={isOutOfStock ? '#' : `/product/${product.id}`}
                            className="product-card__image-button"
                            aria-disabled={isOutOfStock}
                            onClick={(event) => {
                                if (isOutOfStock) event.preventDefault();
                            }}
                        >
                            <div className="product-card__image-wrapper">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="product-card__image"
                                />
                                {isOutOfStock && (
                                    <span className="product-card__sold-out">
                                        AGOTADO
                                    </span>
                                )}
                            </div>
                        </a>

                        <div className="product-card__info">
                            <div>
                                <h3>{product.name}</h3>
                                <p>${product.price.toFixed(2)}</p>
                            </div>

                            <a
                                href={isOutOfStock ? '#' : `/product/${product.id}`}
                                className="product-card__button"
                                aria-disabled={isOutOfStock}
                                onClick={(event) => {
                                    if (isOutOfStock) event.preventDefault();
                                }}
                                style={
                                    isOutOfStock
                                        ? { pointerEvents: 'none', opacity: 0.6 }
                                        : {}
                                }
                            >
                                {isOutOfStock ? 'Agotado' : 'Ver producto'}
                            </a>
                        </div>
                    </article>
                );
            })}

            {hasMore && (
                <div
                    className="home__load-more"
                    style={{
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        width: '100%',
                        margin: '20px 0',
                    }}
                >
                    <button
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        style={{ cursor: 'pointer', padding: '10px 20px' }}
                    >
                        {isLoading ? 'CARGANDO...' : 'CARGAR MÁS'}
                    </button>
                </div>
            )}
        </>
    );
}

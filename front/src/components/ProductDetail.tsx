
import { gql } from '@apollo/client';
import { useCallback, useEffect, useState } from 'react';

import { client } from '../services/apolloClient';
import { getProductById } from '../services/graphql';
import { useCartStore } from '../store/cartStore';
import '../styles/ProductDetail.css';
import type { Product } from '../types/product';

type ProductDetailProps = {
  product: Product;
};

const PEDIDO_CREADO_SUBSCRIPTION = gql`
  subscription PedidoCreado {
    pedidoCreado {
      id
    }
  }
`;

export default function ProductDetail({
  product: initialProduct,
}: ProductDetailProps) {
  const [product, setProduct] = useState(initialProduct);
  const [quantity, setQuantity] = useState(1);
  const [refreshError, setRefreshError] = useState(false);

  const addToCart = useCartStore((state) => state.addToCart);

  const currentCartQuantity = useCartStore((state) => {
    const item = state.items.find(
      (item) => item.id === product.id,
    );
    return item?.quantity ?? 0;
  });

  const availableToAdd = Math.max(
    0,
    product.stock - currentCartQuantity,
  );

  const refreshProduct = useCallback(async () => {
    try {
      const updatedProduct = await getProductById(product.id);

      if (updatedProduct) {
        setProduct(updatedProduct);
        setRefreshError(false);

        setQuantity((current) =>
          Math.min(current, Math.max(1, updatedProduct.stock)),
        );
      }
    } catch (error) {
      console.error('Error al actualizar el stock:', error);
      setRefreshError(true);
    }
  }, [product.id]);

  useEffect(() => {
    console.log('[STOCK] Iniciando suscripción a pedidoCreado');

    const subscription = client
      .subscribe({
        query: PEDIDO_CREADO_SUBSCRIPTION,
      })
      .subscribe({
        next: (result) => {
          console.log('[STOCK] Evento recibido:', result);
          void refreshProduct();
        },
        error: (error) => {
          console.error('[STOCK] Error en suscripción:', error);
        },
        complete: () => {
          console.log('[STOCK] Suscripción finalizada');
        },
      });

    return () => {
      console.log('[STOCK] Cerrando suscripción');
      subscription.unsubscribe();
    };
  }, [refreshProduct]);

  const handleQuantityChange = (value: number) => {
    if (!Number.isFinite(value)) {
      setQuantity(1);
      return;
    }

    setQuantity(
      Math.min(
        Math.max(Math.floor(value), 1),
        Math.max(availableToAdd, 1),
      ),
    );
  };

  const handleAddToCart = () => {
    if (availableToAdd <= 0 || quantity > availableToAdd) {
      return;
    }

    addToCart({
      ...product,
      quantity,
    });

    window.location.href = '/cart';
  };

  return (
    <main className="product-detail">
      <a href="/" className="product-detail__back">
        ← Volver
      </a>

      <section className="product-detail__content">
        <div className="product-detail__image-wrapper">
          <img
            src={product.image}
            alt={product.name}
            className="product-detail__image"
          />
        </div>

        <div className="product-detail__info">
          <p className="product-detail__eyebrow">PRODUCTO</p>

          <h2>{product.name}</h2>

          <p className="product-detail__price">
            ${product.price.toFixed(2)}
          </p>

          <div className="product-detail__stock">
            <span>Stock total</span>
            <strong>{product.stock}</strong>
          </div>

          <div className="product-detail__stock">
            <span>En carrito</span>
            <strong>{currentCartQuantity}</strong>
          </div>

          <div className="product-detail__stock">
            <span>Disponible</span>
            <strong>{availableToAdd}</strong>
          </div>

          {availableToAdd > 0 && (
            <label className="product-detail__quantity">
              <span>Cantidad</span>
              <input
                type="number"
                min="1"
                max={availableToAdd}
                value={quantity}
                onChange={(event) =>
                  handleQuantityChange(Number(event.target.value))
                }
              />
            </label>
          )}

          {refreshError && (
            <p role="status">
              No se pudo actualizar el stock. Los datos podrían estar desactualizados.
            </p>
          )}

          {availableToAdd <= 0 && (
            <p className="product-detail__unavailable">
              {product.stock <= 0
                ? 'PRODUCTO AGOTADO'
                : 'Ya no tienes stock disponible para agregar.'}
            </p>
          )}

          <button
            className="product-detail__add"
            onClick={handleAddToCart}
            disabled={
              availableToAdd <= 0 || quantity > availableToAdd
            }
          >
            {availableToAdd > 0
              ? 'AGREGAR AL CARRITO'
              : 'SIN STOCK DISPONIBLE'}
          </button>
        </div>
      </section>
    </main>
  );
}

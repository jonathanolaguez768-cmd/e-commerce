import { useEffect, useRef, useState } from "react";
import { useCartStore } from "../store/cartStore";
import { API_URL } from "../config";
import "../styles/CheckoutOxxo.css";

declare global {
    interface Window {
        MercadoPago: any;
    }
}

interface Props {
    publicKey: string;
}

export default function CheckoutComponentM({ publicKey }: Props) {
    const brickControllerRef = useRef<any>(null);
    const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
    const isSubmittingRef = useRef(false);

    const items = useCartStore((s) => s.items);
    const clearCart = useCartStore((s) => s.clearCart);

    const total = items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
    );

    const cartSignature = JSON.stringify(
        items
            .map((item) => ({
                id: item.id,
                quantity: item.quantity,
            }))
            .sort((a, b) => a.id - b.id)
    );

    const [paymentError, setPaymentError] = useState<string | null>(null);

    useEffect(() => {
        idempotencyKeyRef.current = crypto.randomUUID();
        isSubmittingRef.current = false;
    }, [cartSignature]);

    useEffect(() => {
        let isMounted = true;
        let interval: ReturnType<typeof setInterval> | undefined;

        const initBrick = async () => {
            try {
                const mp = new window.MercadoPago(publicKey, {
                    locale: "es-MX",
                });

                const bricksBuilder = mp.bricks();

                const settings = {
                    initialization: {
                        amount: total,
                    },
                    customization: {
                        visual: {
                            style: {
                                theme: "dark",
                                customVariables: {
                                    baseColor: "#FF5500",
                                    baseColorFirstVariant: "#e04b00",
                                    formBackgroundColor: "#1e1e1e",
                                    inputBackgroundColor: "#121212",
                                    inputFocusedBorderColor: "#0055FF",
                                    textPrimaryColor: "#FFFFFF",
                                    textSecondaryColor: "#A1A1AA",
                                    borderRadiusMedium: "12px",
                                },
                            },
                        },
                    },
                    callbacks: {
                        onReady: () => { },
                        onSubmit: (
                            formData: any,
                            additionalData: any
                        ) => {
                            if (isSubmittingRef.current) {
                                return Promise.reject(
                                    new Error(
                                        "Payment is already being processed."
                                    )
                                );
                            }

                            isSubmittingRef.current = true;

                            const idempotencyKey =
                                idempotencyKeyRef.current;

                            return new Promise<void>((resolve, reject) => {
                                setPaymentError(null);

                                const submitData = {
                                    type: "online",
                                    total_amount: String(
                                        formData.transaction_amount
                                    ),
                                    external_reference: idempotencyKey,
                                    processing_mode: "automatic",
                                    transactions: {
                                        payments: [
                                            {
                                                amount: String(
                                                    formData.transaction_amount
                                                ),
                                                payment_method: {
                                                    id: formData.payment_method_id,
                                                    type: additionalData?.paymentTypeId,
                                                    token: formData.token,
                                                    installments:
                                                        formData.installments,
                                                },
                                            },
                                        ],
                                    },
                                    payer: {
                                        email: formData.payer?.email,
                                        identification:
                                            formData.payer?.identification,
                                    },
                                    items: items.map((item) => ({
                                        producto_id: item.id,
                                        cantidad: item.quantity,
                                    })),
                                };

                                fetch(`${API_URL}/api/process_order`, {
                                    method: "POST",
                                    credentials: "include",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "X-Idempotency-Key": idempotencyKey,
                                    },
                                    body: JSON.stringify(submitData),
                                })
                                    .then(async (res) => {
                                        const responseData = await res
                                            .json()
                                            .catch(() => ({}));

                                        if (!res.ok) {
                                            const error = new Error(
                                                responseData?.error ??
                                                "Error en el servidor"
                                            );

                                            (
                                                error as Error & {
                                                    status?: number;
                                                    code?: string;
                                                }
                                            ).status = res.status;

                                            (
                                                error as Error & {
                                                    code?: string;
                                                }
                                            ).code = responseData?.error;

                                            throw error;
                                        }

                                        return responseData;
                                    })
                                    .then(() => {
                                        isSubmittingRef.current = false;
                                        clearCart();
                                        resolve();
                                        window.location.href =
                                            "/orders-history";
                                    })
                                    .catch((error: Error) => {
                                        isSubmittingRef.current = false;

                                        console.error(
                                            "Payment processing error:",
                                            error
                                        );

                                        setPaymentError(
                                            error.message ??
                                            "Payment failed. Please try again."
                                        );

                                        reject(error);
                                    });
                            });
                        },
                        onError: (error: any) => {
                            console.error(
                                "Card Payment Brick error:",
                                error
                            );
                        },
                    },
                };

                const container = document.getElementById(
                    "cardPaymentBrick_container"
                );

                if (container) {
                    container.innerHTML = "";
                }

                if (brickControllerRef.current) {
                    await brickControllerRef.current.unmount();
                    brickControllerRef.current = null;
                }

                if (isMounted) {
                    brickControllerRef.current =
                        await bricksBuilder.create(
                            "cardPayment",
                            "cardPaymentBrick_container",
                            settings
                        );
                }
            } catch (err) {
                console.error(
                    "Failed to initialize MercadoPago Brick:",
                    err
                );
            }
        };

        const checkAndInitSDK = () => {
            if (typeof window === "undefined") {
                return;
            }

            if (window.MercadoPago) {
                void initBrick();
                return;
            }

            interval = setInterval(() => {
                if (window.MercadoPago) {
                    if (interval) {
                        clearInterval(interval);
                        interval = undefined;
                    }

                    if (isMounted) {
                        void initBrick();
                    }
                }
            }, 100);
        };

        checkAndInitSDK();

        return () => {
            isMounted = false;

            if (interval) {
                clearInterval(interval);
            }

            if (brickControllerRef.current) {
                void brickControllerRef.current
                    .unmount()
                    .catch(() => { });
                brickControllerRef.current = null;
            }
        };
    }, [publicKey, total, cartSignature]);

        return (
        <>
            <div className="checkout-m__header">
                <h2>Checkout</h2>
                <a href="/checkout-oxxo" className="checkout-m__oxxo-btn">
                    Pagar en físico
                </a>
            </div>

            {paymentError && (
                <p
                    style={{
                        color: "#ff4444",
                        marginBottom: "1rem",
                    }}
                >
                    {paymentError}
                </p>
            )}

            <div id="cardPaymentBrick_container"></div>
        </>
    );
}


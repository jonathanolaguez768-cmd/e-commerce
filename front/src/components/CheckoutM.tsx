import { useEffect, useRef, useState } from "react";
import { useCartStore } from "../store/cartStore";
import { API_URL } from "../config";

declare global {
    interface Window {
        MercadoPago: any;
    }
}

interface Props {
    publicKey: string;
}

type ReasonCode = "APRO" | "OTHE" | "CONT" | "CALL" | "FUND" | "SECU" | "EXPI" | "FORM";

type ApiResponse = {
    error?: string;
    message?: string;
    reason?: string;
    status?: string;
    pedido_id?: number | string;
    mp_order_id?: string | null;
    mp_payment_id?: string | null;
    new_attempt_allowed?: boolean;
    unresolved?: boolean;
    product?: string;
    product_id?: number;
    [key: string]: unknown;
};

type ProcessOrderError = Error & {
    status?: number;
    code?: string;
    reason?: ReasonCode;
    newAttemptAllowed?: boolean;
    unresolved?: boolean;
    responseData?: ApiResponse;
};

type StoredAttemptState = {
    idempotencyKey: string;
    unresolvedKey: string | null;
    unresolved: boolean;
};

type SavedSubmission = {
    key: string;
    payload: Record<string, unknown>;
};

const CURRENT_KEY_STORAGE = "mp_checkout_idempotency_key";
const UNRESOLVED_KEY_STORAGE = "mp_checkout_unresolved_attempt_key";

const REASON_MESSAGES: Record<ReasonCode, string> = {
    APRO: "Pago aprobado.",
    OTHE: "El banco no pudo aprobar el pago. Intenta con otra tarjeta o contacta con tu banco.",
    CONT: "Tu pago sigue pendiente. No vuelvas a enviarlo mientras verificamos su estado.",
    CALL: "Tu banco requiere una autorización adicional. Contacta con el emisor de tu tarjeta.",
    FUND: "La tarjeta no tiene fondos suficientes para completar el pago.",
    SECU: "Verifica el código de seguridad de tu tarjeta.",
    EXPI: "Verifica la fecha de vencimiento de tu tarjeta.",
    FORM: "Revisa los datos introducidos en el formulario de pago.",
};

// Estos errores ocurren antes de que el backend llame a Mercado Pago en la
// implementación actual. Para ellos no existe un cobro que haya que reconciliar.
const POST_ERRORS_BEFORE_PROVIDER = new Set([
    "unauthorized",
    "payment_provider_unavailable",
    "missing_or_invalid_idempotency_key",
    "idempotency_key_mismatch",
    "invalid_json",
    "validation_error",
    "internal_server_error",
]);

function isReasonCode(value: unknown): value is ReasonCode {
    return (
        typeof value === "string" &&
        ["APRO", "OTHE", "CONT", "CALL", "FUND", "SECU", "EXPI", "FORM"].includes(value)
    );
}

function makeUuid(): string {
    return crypto.randomUUID();
}

function getStoredAttemptState(): StoredAttemptState {
    const generatedKey = makeUuid();

    if (typeof window === "undefined") {
        return {
            idempotencyKey: generatedKey,
            unresolvedKey: null,
            unresolved: false,
        };
    }

    try {
        const unresolvedKey = window.sessionStorage.getItem(UNRESOLVED_KEY_STORAGE);
        if (unresolvedKey) {
            window.sessionStorage.setItem(CURRENT_KEY_STORAGE, unresolvedKey);
            return {
                idempotencyKey: unresolvedKey,
                unresolvedKey,
                unresolved: true,
            };
        }

        const savedKey = window.sessionStorage.getItem(CURRENT_KEY_STORAGE);
        if (savedKey) {
            return {
                idempotencyKey: savedKey,
                unresolvedKey: null,
                unresolved: false,
            };
        }

        window.sessionStorage.setItem(CURRENT_KEY_STORAGE, generatedKey);
    } catch {
        // Si el navegador bloquea sessionStorage, la protección principal sigue
        // estando en la tabla intento_pago del backend.
    }

    return {
        idempotencyKey: generatedKey,
        unresolvedKey: null,
        unresolved: false,
    };
}

function safeReadJson(response: Response): Promise<ApiResponse> {
    return response
        .json()
        .then((value: unknown) =>
            value && typeof value === "object" ? (value as ApiResponse) : ({} as ApiResponse),
        )
        .catch(() => ({} as ApiResponse));
}

function makeApiError(status: number | undefined, data: ApiResponse = {}): ProcessOrderError {
    const error = new Error(getUserMessage(data)) as ProcessOrderError;
    error.status = status;
    error.code = typeof data.error === "string" ? data.error : undefined;
    error.reason = isReasonCode(data.reason) ? data.reason : undefined;
    error.newAttemptAllowed = data.new_attempt_allowed === true;
    error.unresolved = data.unresolved === true;
    error.responseData = data;
    return error;
}

function normalizeError(value: unknown): ProcessOrderError {
    if (value instanceof Error) {
        return value as ProcessOrderError;
    }
    return new Error("No pudimos confirmar el resultado del pago.") as ProcessOrderError;
}

function getUserMessage(data: ApiResponse = {}): string {
    if (isReasonCode(data.reason) && data.reason !== "APRO") {
        return REASON_MESSAGES[data.reason];
    }

    switch (data.error) {
        case "payment_not_approved":
            return REASON_MESSAGES.OTHE;
        case "payment_pending":
            return REASON_MESSAGES.CONT;
        case "payment_status_unknown":
        case "payment_approved_reconciliation_required":
        case "idempotency_key_reused":
        case "provider_request_failed":
            return "No pudimos confirmar el resultado del pago. No inicies otro cobro; consulta el estado del intento.";
        case "validation_error":
        case "invalid_json":
        case "invalid_payment_data":
            return REASON_MESSAGES.FORM;
        case "product_not_found":
            return "Uno de los productos de tu carrito ya no está disponible. Actualiza el carrito antes de pagar.";
        case "insufficient_stock":
            return data.product
                ? `No hay suficiente inventario de ${String(data.product)}. Actualiza tu carrito antes de pagar.`
                : "Uno de los productos ya no tiene inventario suficiente. Actualiza el carrito antes de pagar.";
        case "unauthorized":
            return "Tu sesión expiró. Inicia sesión nuevamente antes de continuar.";
        case "payment_provider_unavailable":
            return "El servicio de pagos no está disponible en este momento. Inténtalo más tarde.";
        case "duplicate_request":
            return "La solicitud ya está en proceso. Espera a que termine antes de volver a intentarlo.";
        case "attempt_not_found":
            return "Todavía no encontramos el registro del intento. Vuelve a consultar su estado; no inicies otro cobro.";
        default:
            return "No pudimos completar el pago. Revisa el estado antes de intentarlo nuevamente.";
    }
}

export default function CheckoutComponentM({ publicKey }: Props) {
    const initialStateRef = useRef<StoredAttemptState | null>(null);
    if (!initialStateRef.current) {
        initialStateRef.current = getStoredAttemptState();
    }
    const initialState = initialStateRef.current;

    const brickControllerRef = useRef<any>(null);
    const idempotencyKeyRef = useRef<string>(initialState.idempotencyKey);
    const pendingAttemptKeyRef = useRef<string | null>(initialState.unresolvedKey);
    const isSubmittingRef = useRef(false);
    const attemptUnresolvedRef = useRef(initialState.unresolved);
    const lastSubmissionRef = useRef<SavedSubmission | null>(null);

    const items = useCartStore((s) => s.items);
    const clearCart = useCartStore((s) => s.clearCart);

    const total = items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0,
    );

    const cartSignature = JSON.stringify(
        items
            .map((item) => ({ id: item.id, quantity: item.quantity }))
            .sort((a, b) => a.id - b.id),
    );

    const [paymentError, setPaymentError] = useState<string | null>(null);
    // Evita que un onError posterior del Brick reemplace un motivo ya clasificado
    // por el backend (por ejemplo OTHE) con un mensaje genérico de formulario.
    const hasSpecificErrorRef = useRef(false);
    const [attemptUnresolved, setAttemptUnresolved] = useState(initialState.unresolved);
    const [checkingStatus, setCheckingStatus] = useState(false);

    function saveCurrentKey(key: string) {
        try {
            window.sessionStorage.setItem(CURRENT_KEY_STORAGE, key);
        } catch {
            // El backend mantiene la protección persistente aunque no haya storage.
        }
    }

    function markUnresolved(key: string) {
        attemptUnresolvedRef.current = true;
        pendingAttemptKeyRef.current = key;
        setAttemptUnresolved(true);

        try {
            window.sessionStorage.setItem(CURRENT_KEY_STORAGE, key);
            window.sessionStorage.setItem(UNRESOLVED_KEY_STORAGE, key);
        } catch {
            // No guardar el token ni el cuerpo de la solicitud en el navegador.
        }
    }

    function releaseAttemptAndRotateKey() {
        const nextKey = makeUuid();
        idempotencyKeyRef.current = nextKey;
        pendingAttemptKeyRef.current = null;
        attemptUnresolvedRef.current = false;
        setAttemptUnresolved(false);
        saveCurrentKey(nextKey);

        try {
            window.sessionStorage.removeItem(UNRESOLVED_KEY_STORAGE);
        } catch {
            // La clave nueva sigue siendo válida en memoria.
        }
    }

    function clearStoredAttempt() {
        attemptUnresolvedRef.current = false;
        pendingAttemptKeyRef.current = null;
        setAttemptUnresolved(false);

        try {
            window.sessionStorage.removeItem(CURRENT_KEY_STORAGE);
            window.sessionStorage.removeItem(UNRESOLVED_KEY_STORAGE);
        } catch {
            // Sin storage, la navegación posterior termina el flujo actual.
        }
    }

    function finishApprovedOrder(data: ApiResponse) {
        if (data.status !== "approved" || data.pedido_id == null) {
            return false;
        }

        clearStoredAttempt();
        clearCart();
        window.location.href = "/orders-history";
        return true;
    }

    function applyPostFailure(error: ProcessOrderError, key: string) {
        const knownPreProviderError = Boolean(
            error.code && POST_ERRORS_BEFORE_PROVIDER.has(error.code),
        );

        if (error.newAttemptAllowed === true || knownPreProviderError) {
            // La API confirma que el pago no se inició, o el backend declara que
            // el intento terminó. El siguiente envío utiliza otra clave.
            releaseAttemptAndRotateKey();
        } else {
            // Timeout, 402 sin clasificación del backend, 502, 409 o cualquier
            // respuesta ambigua: jamás generar otra clave automáticamente.
            markUnresolved(key);
        }

        hasSpecificErrorRef.current = true;
        setPaymentError(getUserMessage(error.responseData ?? {
            error: error.code,
            reason: error.reason,
        }));
    }

    async function postSameAttempt(key: string, payload: Record<string, unknown>) {
        const response = await fetch(`${API_URL}/api/process_order`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Idempotency-Key": key,
            },
            body: JSON.stringify(payload),
        });
        return {
            httpStatus: response.status,
            data: await safeReadJson(response),
        };
    }

    async function checkPaymentStatus() {
        const key = pendingAttemptKeyRef.current;
        if (!key || checkingStatus || isSubmittingRef.current) return;

        setCheckingStatus(true);
        setPaymentError(null);
        hasSpecificErrorRef.current = false;

        try {
            const response = await fetch(
                `${API_URL}/api/process_order/${encodeURIComponent(key)}`,
                {
                    method: "GET",
                    credentials: "include",
                    headers: { Accept: "application/json" },
                },
            );
            const data = await safeReadJson(response);

            if (response.status === 404 && data.error === "attempt_not_found") {
                const savedSubmission = lastSubmissionRef.current;

                // Durante la misma pestaña podemos repetir exactamente el mismo
                // cuerpo y la misma clave. La restricción única del backend impide
                // que una segunda ejecución cree otro Order.
                if (savedSubmission?.key === key) {
                    const retry = await postSameAttempt(key, savedSubmission.payload);
                    if (finishApprovedOrder(retry.data)) return;

                    const retryError = makeApiError(retry.httpStatus, retry.data);
                    applyPostFailure(retryError, key);
                    return;
                }

                markUnresolved(key);
                setPaymentError(getUserMessage(data));
                return;
            }

            if (!response.ok) {
                const statusError = makeApiError(response.status, data);
                // Un fallo consultando el estado no demuestra que el pago falló.
                markUnresolved(key);
                setPaymentError(
                    statusError.code === "unauthorized"
                        ? "Tu sesión expiró. Inicia sesión y vuelve a consultar el estado del pago."
                        : "No pudimos consultar el pago. El intento sigue bloqueado por seguridad; vuelve a consultar en un momento.",
                );
                return;
            }

            if (finishApprovedOrder(data)) return;

            const statusError = makeApiError(response.status, data);
            if (
                (data.status === "rejected" || data.status === "validation_failed") &&
                data.new_attempt_allowed === true
            ) {
                applyPostFailure(statusError, key);
                return;
            }

            // pending, processing, unknown o provider_approved todavía no resuelto.
            markUnresolved(key);
            setPaymentError(getUserMessage(data));
        } catch {
            markUnresolved(key);
            setPaymentError(
                "No pudimos consultar el estado del pago. No vuelvas a enviarlo; inténtalo consultar nuevamente.",
            );
        } finally {
            setCheckingStatus(false);
        }
    }

    useEffect(() => {
        let isMounted = true;
        let interval: ReturnType<typeof setInterval> | undefined;
        let initializing = false;

        const initBrick = async () => {
            if (initializing || !isMounted || !window.MercadoPago) return;
            initializing = true;

            try {
                const mp = new window.MercadoPago(publicKey, { locale: "es-MX" });
                const bricksBuilder = mp.bricks();

                const settings = {
                    initialization: { amount: total },
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
                        onSubmit: (formData: any, additionalData: any): Promise<void> => {
                            if (isSubmittingRef.current) {
                                return Promise.reject(
                                    new Error("El pago ya se está procesando. Espera a que termine."),
                                );
                            }

                            if (attemptUnresolvedRef.current) {
                                setPaymentError(
                                    "El intento anterior todavía no está resuelto. Consulta su estado antes de iniciar otro pago.",
                                );
                                return Promise.reject(
                                    new Error("El intento de pago anterior no está resuelto."),
                                );
                            }

                            isSubmittingRef.current = true;
                            const idempotencyKey = idempotencyKeyRef.current;

                            const submitData: Record<string, unknown> = {
                                type: "online",
                                total_amount: String(formData.transaction_amount),
                                external_reference: idempotencyKey,
                                processing_mode: "automatic",
                                transactions: {
                                    payments: [
                                        {
                                            amount: String(formData.transaction_amount),
                                            payment_method: {
                                                id: formData.payment_method_id,
                                                type: additionalData?.paymentTypeId,
                                                token: formData.token,
                                                installments: formData.installments,
                                            },
                                        },
                                    ],
                                },
                                payer: {
                                    email: formData.payer?.email,
                                    identification: formData.payer?.identification,
                                },
                                items: items.map((item) => ({
                                    producto_id: item.id,
                                    cantidad: item.quantity,
                                })),
                            };

                            // Se guarda solo en memoria para poder reconsultar o repetir
                            // EXACTAMENTE la misma solicitud con la misma clave si hace falta.
                            // Nunca se persiste el token de tarjeta en sessionStorage.
                            lastSubmissionRef.current = {
                                key: idempotencyKey,
                                payload: submitData,
                            };
                            pendingAttemptKeyRef.current = idempotencyKey;
                            hasSpecificErrorRef.current = false;
                            setPaymentError(null);

                            return postSameAttempt(idempotencyKey, submitData)
                                .then(({ httpStatus, data }) => {
                                    if (finishApprovedOrder(data)) return;

                                    // HTTP 202 es res.ok, pero puede significar CONT o
                                    // resultado desconocido. Solo pedido aprobado termina checkout.
                                    throw makeApiError(httpStatus, data);
                                })
                                .catch((rawError: unknown) => {
                                    const error = normalizeError(rawError);
                                    applyPostFailure(error, idempotencyKey);
                                    throw error;
                                })
                                .finally(() => {
                                    isSubmittingRef.current = false;
                                });
                        },
                        onError: (_error: unknown) => {
                            // No mostramos detalles técnicos del SDK al usuario ni
                            // sobrescribimos el motivo público que ya devolvió el backend.
                            if (hasSpecificErrorRef.current) return;
                            setPaymentError(
                                "No pudimos validar los datos de la tarjeta. Revisa el formulario e inténtalo nuevamente.",
                            );
                        },
                    },
                };

                const container = document.getElementById("cardPaymentBrick_container");
                if (!container || !isMounted) return;

                if (brickControllerRef.current) {
                    const previousController = brickControllerRef.current;
                    brickControllerRef.current = null;
                    await previousController.unmount().catch(() => { });
                }

                container.innerHTML = "";
                if (!isMounted) return;

                const controller = await bricksBuilder.create(
                    "cardPayment",
                    "cardPaymentBrick_container",
                    settings,
                );

                if (!isMounted) {
                    await controller.unmount().catch(() => { });
                    return;
                }
                brickControllerRef.current = controller;
            } catch {
                if (isMounted) {
                    setPaymentError(
                        "No pudimos cargar el formulario de pago. Recarga la página e inténtalo nuevamente.",
                    );
                }
            } finally {
                initializing = false;
            }
        };

        const checkAndInitSDK = () => {
            if (typeof window === "undefined") return;

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
                    void initBrick();
                }
            }, 100);
        };

        if (items.length > 0 && total > 0) {
            checkAndInitSDK();
        }

        return () => {
            isMounted = false;
            if (interval) clearInterval(interval);

            if (brickControllerRef.current) {
                const controller = brickControllerRef.current;
                brickControllerRef.current = null;
                void controller.unmount().catch(() => { });
            }
        };
        // cartSignature cambia cuando cambian productos/cantidades. No cambia la
        // clave de idempotencia aquí: solo se renueva ante un resultado definitivo.
    }, [publicKey, total, cartSignature]);

    return (
        <>
            <h2>Checkout</h2>

            {paymentError && (
                <p
                    role="alert"
                    style={{
                        color: "#ff4444",
                        marginBottom: "1rem",
                    }}
                >
                    {paymentError}
                </p>
            )}

            {attemptUnresolved && (
                <div style={{ marginBottom: "1rem" }}>
                    <p>
                        Hay un intento de pago pendiente de confirmar. Para evitar un cobro duplicado,
                        no se permite iniciar otro hasta conocer el resultado del anterior.
                    </p>
                    <button
                        type="button"
                        onClick={() => void checkPaymentStatus()}
                        disabled={checkingStatus || isSubmittingRef.current}
                    >
                        {checkingStatus ? "Consultando estado…" : "Consultar estado del pago"}
                    </button>
                </div>
            )}

            {items.length === 0 || total <= 0 ? (
                <p>Tu carrito está vacío.</p>
            ) : (
                <div id="cardPaymentBrick_container" />
            )}
        </>
    );
}

import { PubSub } from "graphql-subscriptions";

export const pubsub = new PubSub<Record<string, any>>();
export const PEDIDO_CREADO = "PEDIDO_CREADO";
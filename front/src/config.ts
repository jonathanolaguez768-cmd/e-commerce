/**
 * Base URL of the REST API backend.
 * Set PUBLIC_API_URL in .env (local) or in environment variables (production).
 */
export const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4000'

/**
 * GraphQL endpoint. Derived from API_URL unless overridden by PUBLIC_GRAPHQL_URL.
 */
export const GRAPHQL_URL = import.meta.env.PUBLIC_GRAPHQL_URL || `${API_URL}/graphql`

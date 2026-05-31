/**
 * Single source of truth for all session timeouts, remember me options, and idle limits.
 */
export const SESSION_POLICY = {
    // Inactivity timeout before client auto-logs out (30 minutes)
    idleTimeoutMs: 30 * 60 * 1000,
    idleTimeoutSeconds: 30 * 60,

    // Expiration for remember-me sessions (30 days)
    rememberMeMaxAgeSeconds: 30 * 24 * 60 * 60,

    // Default NextAuth session maxAge (30 days)
    defaultMaxAgeSeconds: 30 * 24 * 60 * 60,

    // Server-side idle session timeout (2 hours)
    // Non-remember me sessions are invalidated server-side if inactive for longer than this
    serverJwtIdleTimeoutSeconds: 2 * 60 * 60,
} as const;

/**
 * Prompt injection defense for the AI assistant.
 * Detects and blocks attempts to manipulate the LLM into bypassing security controls.
 */

const INJECTION_PATTERNS = [
    // Direct injection
    /ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?|guidelines?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?)/i,
    /forget\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?)/i,

    // Role manipulation
    /you\s+are\s+now\s+(a|an|the)\s+(admin|superuser|root|developer)/i,
    /act\s+as\s+(a|an|the)\s+(admin|superuser|root|developer)/i,
    /pretend\s+you\s+are\s+(a|an|the)\s+(admin|superuser|root|developer)/i,
    /roleplay\s+as\s+(a|an|the)\s+(admin|superuser|root|developer)/i,

    // System prompt extraction
    /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    /show\s+me\s+your\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    /reveal\s+your\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    /print\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,

    // Tenant isolation bypass
    /show\s+me\s+(all\s+)?(tenant|company|organization)\s+data/i,
    /query\s+(all\s+)?tenants?/i,
    /cross[\s-]?tenant/i,
    /other\s+tenant/i,

    // Data exfiltration
    /export\s+(all\s+)?(data|records?|users?|customers?)/i,
    /dump\s+(all\s+)?(data|records?|users?|customers?)/i,
    /send\s+(all\s+)?(data|records?|users?|customers?)\s+to/i,

    // Mutation disguised as query
    /delete\s+(all\s+)?(data|records?|users?|customers?|products?|orders?)/i,
    /drop\s+(table|database)/i,
    /truncate\s+(table|database)/i,
    /update\s+(all\s+)?(data|records?|users?|customers?|products?|orders?)/i,

    // SQL injection attempts
    /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER)\s+/i,
    /UNION\s+(ALL\s+)?SELECT/i,
    /--\s*$/i,
];

const SUSPICIOUS_PATTERNS = [
    //编码尝试
    /base64/i,
    /decode/i,
    /eval\s*\(/i,
    /exec\s*\(/i,

    // Prompt injection via special characters
    /\[SYSTEM\]/i,
    /\[ADMIN\]/i,
    /\[INST\]/i,
    /<<\s*SYS\s*>>/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
];

export type InjectionCheckResult = {
    safe: boolean;
    reason?: string;
    pattern?: string;
};

/**
 * Check if a user message contains prompt injection attempts.
 */
export function checkPromptInjection(message: string): InjectionCheckResult {
    // Check direct injection patterns
    for (const pattern of INJECTION_PATTERNS) {
        const match = message.match(pattern);
        if (match) {
            return {
                safe: false,
                reason: 'Pesan Anda mengandung elemen yang tidak diizinkan.',
                pattern: match[0],
            };
        }
    }

    // Check suspicious patterns (lower confidence, log but don't block)
    for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(message)) {
            // Log for monitoring but don't block — could be false positive
            console.warn(
                '[INJECTION_DEFENSE] Suspicious pattern detected:',
                pattern.source,
            );
        }
    }

    return { safe: true };
}

/**
 * Sanitize knowledge article content to prevent prompt injection via uploaded content.
 * This is a basic defense — content should still be human-reviewed before publishing.
 */
export function sanitizeKnowledgeContent(content: string): string {
    let sanitized = content;

    // Remove potential system prompt markers
    sanitized = sanitized.replace(/\[SYSTEM\]/gi, '[CONTENT]');
    sanitized = sanitized.replace(/\[ADMIN\]/gi, '[CONTENT]');
    sanitized = sanitized.replace(/\[INST\]/gi, '[CONTENT]');
    sanitized = sanitized.replace(/<<\s*SYS\s*>>/gi, '[CONTENT]');
    sanitized = sanitized.replace(/<\|im_start\|>/gi, '[CONTENT]');
    sanitized = sanitized.replace(/<\|im_end\|>/gi, '[CONTENT]');

    // Limit length
    if (sanitized.length > 50000) {
        sanitized = sanitized.slice(0, 50000);
    }

    return sanitized;
}

/**
 * Log injection attempt for monitoring.
 */
export function logInjectionAttempt(input: {
    userId: string;
    tenantId: string;
    message: string;
    pattern: string;
    blocked: boolean;
}): void {
    console.warn('[INJECTION_ATTEMPT]', {
        userId: input.userId,
        tenantId: input.tenantId,
        messagePreview: input.message.slice(0, 100),
        pattern: input.pattern,
        blocked: input.blocked,
        timestamp: new Date().toISOString(),
    });
}

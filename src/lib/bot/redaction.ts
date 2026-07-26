/**
 * Field-level redaction for sensitive data in tool outputs.
 * Ensures minimum disclosure principle.
 */

export type RedactionLevel = 'none' | 'financial' | 'personal' | 'full';

/**
 * Redact sensitive fields from text based on the redaction level.
 */
export function redactSensitiveFields(
    text: string,
    level: RedactionLevel = 'none',
): string {
    if (level === 'none') return text;

    let result = text;

    if (level === 'financial' || level === 'full') {
        // Redact monetary amounts and bank details
        result = result.replace(/\bRp\s?[\d.,]+\b/g, '[REDACTED-AMOUNT]');
        result = result.replace(/\b\d{10,16}\b/g, '[REDACTED-NUMBER]');
    }

    if (level === 'personal' || level === 'full') {
        // Redact personal info
        result = result.replace(
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            '[REDACTED-EMAIL]',
        );
        result = result.replace(/\b08\d{8,12}\b/g, '[REDACTED-PHONE]');
        result = result.replace(/\b\d{1,3}\.\d{3}\.\d{3}\b/g, '[REDACTED-ID]');
    }

    return result;
}

/**
 * Redact fields in a ToolEvidence facts array.
 */
export function redactEvidenceFacts(
    facts: Array<{ label: string; value: string }>,
    level: RedactionLevel,
): Array<{ label: string; value: string }> {
    if (level === 'none') return facts;

    return facts.map((fact) => ({
        label: fact.label,
        value: redactSensitiveFields(fact.value, level),
    }));
}

/**
 * Retention policy constants (in days).
 */
export const RETENTION_POLICY = {
    fullChatContent: 90,
    sanitizedAnalytics: 365,
    toolEvidenceDetail: 90,
    conversationSummary: 365,
} as const;

/**
 * Calculate retention expiry date.
 */
export function getRetentionExpiry(
    policy: keyof typeof RETENTION_POLICY,
): Date {
    const days = RETENTION_POLICY[policy];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() - days);
    return expiry;
}

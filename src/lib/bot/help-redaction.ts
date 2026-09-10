const SAFE_CONTENT_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\b(?:postgres(?:ql)?):\/\/\S+/gi, '[REDACTED_DATABASE_URL]'],
    [/\b(?:sk|pk|api)[-_][a-z0-9_-]{12,}\b/gi, '[REDACTED_SECRET]'],
    [
        /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
        '$1=[REDACTED]',
    ],
];

export function redactHelpMessageContent(content: string): string {
    return SAFE_CONTENT_REPLACEMENTS.reduce(
        (redacted, [pattern, replacement]) =>
            redacted.replace(pattern, replacement),
        content,
    );
}

const BLOCKED_EXACT_PATHS = new Set(['/.env', '/aaa']);

const BLOCKED_PREFIXES = [
    '/.git',
    '/wp-',
    '/wp/',
    '/vendor/phpunit/',
    '/phpunit/',
];

const BLOCKED_USER_AGENT_PATTERNS = [/\bReconX\b/i, /\bAssetnote\b/i];

export interface ScannerProbeInput {
    pathname: string;
    userAgent: string;
}

export function isBlockedScannerProbe({
    pathname,
    userAgent,
}: ScannerProbeInput): boolean {
    if (BLOCKED_EXACT_PATHS.has(pathname)) {
        return true;
    }

    if (BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return true;
    }

    return BLOCKED_USER_AGENT_PATTERNS.some((pattern) =>
        pattern.test(userAgent),
    );
}

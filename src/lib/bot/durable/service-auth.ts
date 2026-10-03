import { timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'Bearer ';

/** Constant-time service-token comparison; malformed values fail closed. */
export function verifyAssistantServiceAuthorization(
    authorization: string | null | undefined,
    expectedToken: string,
): boolean {
    if (!expectedToken || !authorization?.startsWith(TOKEN_PREFIX))
        return false;
    const actual = Buffer.from(
        authorization.slice(TOKEN_PREFIX.length),
        'utf8',
    );
    const expected = Buffer.from(expectedToken, 'utf8');
    if (actual.length !== expected.length) {
        // Compare equal-sized buffers even on malformed input to avoid a cheap
        // prefix/length oracle while still rejecting the request.
        timingSafeEqual(expected, Buffer.alloc(expected.length));
        return false;
    }
    return timingSafeEqual(actual, expected);
}

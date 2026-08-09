import { describe, expect, it } from 'vitest';
import { isBlockedScannerProbe } from '../scanner-probes';

describe('isBlockedScannerProbe', () => {
    it('blocks obvious sensitive-file probes', () => {
        expect(
            isBlockedScannerProbe({ pathname: '/.env', userAgent: 'Mozilla/5.0' }),
        ).toBe(true);
        expect(
            isBlockedScannerProbe({ pathname: '/.git/config', userAgent: 'Mozilla/5.0' }),
        ).toBe(true);
    });

    it('blocks known scanner user agents', () => {
        expect(
            isBlockedScannerProbe({ pathname: '/', userAgent: 'ReconX/1.0' }),
        ).toBe(true);
        expect(
            isBlockedScannerProbe({ pathname: '/aaa', userAgent: 'Assetnote/1.0.0' }),
        ).toBe(true);
    });

    it('does not block normal application paths', () => {
        expect(
            isBlockedScannerProbe({
                pathname: '/login',
                userAgent:
                    'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
            }),
        ).toBe(false);
        expect(
            isBlockedScannerProbe({ pathname: '/api/auth/session', userAgent: '' }),
        ).toBe(false);
    });
});

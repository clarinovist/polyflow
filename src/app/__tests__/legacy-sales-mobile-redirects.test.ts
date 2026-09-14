import { describe, expect, it } from 'vitest';
import {
    getRedirectUrl,
    unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import nextConfig from '../../../next.config';

// Test the real config matcher, without starting the app or touching a database.
// Proxy/auth and filesystem routing are outside this config-only regression.
describe('legacy sales mobile redirects', () => {
    it.each([
        ['/sales/mobile', '/field/sales'],
        ['/sales/mobile/orders', '/field/sales/orders'],
        ['/sales/mobile/orders/order-1', '/field/sales/orders/order-1'],
        ['/sales/mobile/orders/order-1?tab=items', '/field/sales/orders/order-1?tab=items'],
        ['/sales/mobile/customers', '/field/sales/customers'],
    ])('preserves compatibility for %s', async (source, destination) => {
        const response = await unstable_getResponseFromNextConfig({
            url: `https://example.test${source}`,
            nextConfig,
        });

        expect(response.status).toBe(307);
        expect(getRedirectUrl(response)).toBe(`https://example.test${destination}`);
    });

    it.each(['/field/sales', '/field/sales/orders/order-1', '/sales/mobile-other'])(
        'does not redirect the unrelated path %s',
        async (pathname) => {
            const response = await unstable_getResponseFromNextConfig({
                url: `https://example.test${pathname}`,
                nextConfig,
            });

            expect(getRedirectUrl(response)).toBeNull();
        },
    );
});

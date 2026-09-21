import { afterEach, describe, expect, it, vi } from 'vitest';
import { retiredFeatureResponse } from '../retired-features';

const liveHandler = vi.hoisted(() => vi.fn(() => new Response('live')));
vi.mock('next-auth', () => ({ default: () => ({ auth: () => liveHandler }) }));
vi.mock('@/auth.config', () => ({ authConfig: {} }));
import proxy from '@/proxy';

const request = (path: string, method = 'GET') => new Request(`https://example.test${path}`, {
    method,
    headers: { cookie: 'polyflow_tg=old-session; authjs.session-token=old-web-session' },
});

afterEach(() => vi.clearAllMocks());

describe('retired feature boundary', () => {
    it.each([
        '/api/telegram/mini-app',
        '/api/telegram/mini-app/session',
        '/api/telegram/mini-app/link',
        '/api/telegram/mini-app/link-token',
        '/api/telegram/mini-app/unlink',
        '/api/telegram/mini-app/bootstrap',
        '/api/telegram/mini-app/home',
        '/api/telegram/mini-app/query',
        '/api/telegram/mini-app/data/finance',
        '/api/telegram/mini-app/data/stock',
        '/api/telegram/mini-app/data/price',
    ])('blocks old and authenticated Mini App requests to %s', async (path) => {
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
            const response = retiredFeatureResponse(request(path, method))!;
            expect(response.status).toBe(410);
            expect(response.headers.get('cache-control')).toBe('no-store');
            expect(response.headers.get('set-cookie')).toBeNull();
            if (method === 'HEAD') expect(await response.text()).toBe('');
            else expect(await response.json()).toEqual({ error: 'Feature retired' });
        }
    });

    it.each(['/ceo-notes', '/ceo-notes/old-id'])('redirects old note links but never forwards server-action POSTs: %s', (path) => {
        const response = retiredFeatureResponse(request(path))!;
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('/dashboard');
        expect(retiredFeatureResponse(request(path, 'POST'))!.status).toBe(410);
    });

    it.each(['/telegram', '/telegram/home', '/telegram/account', '/telegram/data/stock'])('shows retirement notice without SDK or framing exception: %s', async (path) => {
        const response = retiredFeatureResponse(request(path))!;
        expect(response.status).toBe(410);
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
        const body = await response.text();
        expect(body).toContain('Mini App sudah dihentikan');
        expect(body).not.toContain('<script');
        expect(body).toContain('href="/dashboard"');
        expect(await retiredFeatureResponse(request(path, 'HEAD'))!.text()).toBe('');
    });

    it('acknowledges late webhook deliveries without reading their payload', async () => {
        const req = new Request('https://example.test/api/telegram/webhook', { method: 'POST', body: 'not-json' });
        const response = retiredFeatureResponse(req)!;
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, retired: true });
        expect(req.bodyUsed).toBe(false);
        expect(retiredFeatureResponse(request('/api/telegram/webhook'))!.status).toBe(410);
    });

    it.each(['/dashboard', '/api/chat', '/api/bot/query', '/api/cron/digest', '/api/auth/session', '/telegram-other', '/ceo-notes-other', '/api/telegram/mini-app-other'])('leaves live routes and similar prefixes untouched: %s', (path) => {
        expect(retiredFeatureResponse(request(path))).toBeNull();
    });

    it('wires retirement ahead of the live auth handler', async () => {
        type ProxyRequest = Parameters<typeof proxy>[0];
        type ProxyEvent = Parameters<typeof proxy>[1];
        const event = {} as ProxyEvent;
        const response = await proxy(request('/api/telegram/mini-app/session', 'POST') as ProxyRequest, event);
        expect(response?.status).toBe(410);
        expect(liveHandler).not.toHaveBeenCalled();
        await proxy(request('/api/chat', 'POST') as ProxyRequest, event);
        expect(liveHandler).toHaveBeenCalledOnce();
    });
});

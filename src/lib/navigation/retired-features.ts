const isWithin = (pathname: string, root: string) =>
    pathname === root || pathname.startsWith(`${root}/`);

/** Tombstones only: no session, database, bot calls or request-body processing. */
export function retiredFeatureResponse(request: Request): Response | null {
    const url = new URL(request.url);
    const isCeoNote = isWithin(url.pathname, '/ceo-notes');
    const isMiniApp = isWithin(url.pathname, '/telegram');
    const isMiniAppApi = isWithin(url.pathname, '/api/telegram/mini-app');
    const isWebhook = url.pathname === '/api/telegram/webhook';
    if (!isCeoNote && !isMiniApp && !isMiniAppApi && !isWebhook) return null;

    const headers = new Headers({
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    });
    const readOnly = request.method === 'GET' || request.method === 'HEAD';
    if (isCeoNote && readOnly) {
        headers.set('Location', '/dashboard');
        return new Response(null, { status: 307, headers });
    }

    // Acknowledge late Telegram deliveries without retry storms or side effects.
    // Other verbs (including old server-action POSTs) stay permanently retired.
    if (isWebhook && request.method === 'POST') {
        return Response.json({ ok: true, retired: true }, { headers });
    }
    if (isMiniAppApi || isWebhook || isCeoNote) {
        headers.set('Content-Type', 'application/json');
        return new Response(
            request.method === 'HEAD' ? null : JSON.stringify({ error: 'Feature retired' }),
            { status: 410, headers },
        );
    }

    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(
        request.method === 'HEAD' ? null : '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mini App dihentikan</title><h1>Telegram Mini App sudah dihentikan</h1><p>Silakan gunakan PolyFlow melalui browser.</p><a href="/dashboard" target="_top">Buka PolyFlow</a></html>',
        { status: 410, headers },
    );
}

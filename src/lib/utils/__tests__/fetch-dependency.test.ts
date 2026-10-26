import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('real fetch dependency interoperability', () => {
    it('uploads file-backed multipart data and preserves abort behavior', async () => {
        const { default: fetch, FormData, fileFrom } = await import('node-fetch');
        const dir = mkdtempSync(join(tmpdir(), 'polyflow-fetch-contract-'));
        const file = join(dir, 'fixture.txt');
        let received = '';
        const server = createServer(async (request, response) => {
            try {
                received = Buffer.concat(await Array.fromAsync(request)).toString('utf8');
                response.writeHead(201).end('received');
            } catch { response.writeHead(500).end('read failed'); }
        });
        try {
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject).listen(0, '127.0.0.1', resolve);
            });
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('Missing test server address');
            const url = `http://127.0.0.1:${address.port}/upload`;
            writeFileSync(file, 'synthetic multipart contents');
            const body = new FormData();
            body.set('upload', await fileFrom(file, 'text/plain'));
            const response = await fetch(url, { method: 'POST', body });
            expect(response.status).toBe(201);
            expect(await response.text()).toBe('received');
            expect(received).toContain('name="upload"; filename="fixture.txt"');
            expect(received).toContain('synthetic multipart contents');
            const controller = new AbortController();
            controller.abort();
            await expect(fetch(url, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        } finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

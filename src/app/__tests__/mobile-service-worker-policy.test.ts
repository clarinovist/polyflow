import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

describe('mobile service worker business-data policy', () => {
    it('never writes authenticated portal responses to Cache Storage', () => {
        expect(serviceWorker).not.toMatch(/['"]\/mobile['"]/);
        expect(serviceWorker).not.toMatch(/['"]\/finance\/mobile['"]/);
        expect(serviceWorker).not.toMatch(/['"]\/hrd\/mobile['"]/);
        expect(serviceWorker).not.toContain("addEventListener('fetch'");
        expect(serviceWorker).not.toContain('.put(');
    });

    it('pre-caches only public static install assets', () => {
        expect(serviceWorker).toContain("'/manifest.json'");
        expect(serviceWorker).toContain("'/icon-192.png'");
    });
});

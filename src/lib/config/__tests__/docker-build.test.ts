import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../../next.config';

const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8');

describe('Docker build resource policy', () => {
    it('gives the Next TypeScript build worker explicit heap headroom', () => {
        const builder = dockerfile.split('FROM base AS builder')[1].split('FROM base AS runner')[0];
        expect(builder).toMatch(/^RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build$/m);
    });

    it('does not leak build heap limits into the production container', () => {
        expect(dockerfile).not.toMatch(/^ENV\s+NODE_OPTIONS\b/m);
        const runner = dockerfile.split('FROM base AS runner')[1];
        expect(runner).not.toContain('max-old-space-size');
        expect(runner).toContain('ENTRYPOINT ["./entrypoint.sh"]');
    });

    it('retains Next build typechecking instead of masking errors to avoid OOM', () => {
        expect((nextConfig as { typescript?: { ignoreBuildErrors?: boolean } }).typescript?.ignoreBuildErrors).not.toBe(true);
    });
});

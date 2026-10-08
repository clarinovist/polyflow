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

    it('keeps normal web startup free of database migrations and packages a release migrator', () => {
        const entrypoint = readFileSync(new URL('../../../../entrypoint.sh', import.meta.url), 'utf8');
        const migrator = readFileSync(new URL('../../../../release-migrate.sh', import.meta.url), 'utf8');
        expect(entrypoint).toContain('exec node server.js');
        expect(entrypoint).not.toMatch(/prisma|migrat|pg_dump|SKIP_MIGRATIONS/);
        expect(migrator).toContain('node scripts/backup-release-databases.js');
        expect(migrator).toContain('node node_modules/prisma/build/index.js migrate deploy');
        expect(migrator).toContain('node scripts/migrate-all-tenants.js');
        expect(migrator.indexOf('backup-release-databases.js')).toBeLessThan(migrator.indexOf('migrate deploy'));
        expect(migrator.indexOf('migrate deploy')).toBeLessThan(migrator.indexOf('migrate-all-tenants.js'));
        expect(dockerfile).toContain('COPY --chown=nextjs:nodejs entrypoint.sh release-migrate.sh ./');
    });

    it('retains Next build typechecking instead of masking errors to avoid OOM', () => {
        expect((nextConfig as { typescript?: { ignoreBuildErrors?: boolean } }).typescript?.ignoreBuildErrors).not.toBe(true);
    });
});

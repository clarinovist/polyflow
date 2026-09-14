import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8')
    .replace(/\\\r?\n/g, ' ');
const copies = dockerfile.split('\n')
    .filter((line) => line.startsWith('COPY --from=builder'));

function sourcesFor(destination: string) {
    return copies
        .filter((line) => line.trim().endsWith(` ${destination}`))
        .flatMap((line) => line.trim().split(/\s+/)
            .slice(1, -1).filter((part) => !part.startsWith('--')));
}

describe('standalone operational tooling packaging', () => {
    it('ships only the explicitly approved script entrypoints', () => {
        expect(sourcesFor('./scripts/')).toEqual([
            '/app/ops-dist/scripts/provision-tenant.js',
            '/app/ops-dist/scripts/migrate-all-tenants.js',
            '/app/ops-dist/scripts/cleanup-performance-metrics.js',
            '/app/scripts/audit-duplicate-production-voids.js',
            '/app/scripts/check-ob.js',
            '/app/scripts/repair-maklon-sales-order-locations.js',
            '/app/scripts/repair-maklon-stock-locations.js',
        ]);
    });

    it('excludes inert historical scripts from the image build context', () => {
        const ignores = readFileSync(path.join(root, '.dockerignore'), 'utf8')
            .split('\n').map((line) => line.trim());
        expect(ignores).toContain('scripts/archive');
        expect(sourcesFor('./scripts/').every((source) => !source.includes('*'))).toBe(true);
    });

    it('ships the shared cores beside their original relative CLI imports', () => {
        expect(sourcesFor('./src/lib/ops/')).toEqual([
            '/app/ops-dist/src/lib/ops/tenant-migrations.js',
            '/app/ops-dist/src/lib/ops/performance-metrics-cleanup.js',
        ]);
        expect(dockerfile).toContain('--rootDir . --outDir /app/ops-dist');
    });

    it('retains schema/migration history and compiled seed helpers', () => {
        expect(sourcesFor('./prisma/')).toEqual([
            '/app/ops-dist/prisma/seed.js',
            '/app/ops-dist/prisma/seed-baseline.js',
            '/app/ops-dist/prisma/fix-coa.js',
            '/app/ops-dist/prisma/seed-coa.js',
        ]);
        expect(sourcesFor('./prisma')).toContain('/app/prisma');
    });

    it.each([
        'prisma', 'bcryptjs', '@prisma/engines', '@prisma/engines-version',
        '@prisma/debug', '@prisma/fetch-engine', '@prisma/get-platform',
    ])('explicitly ships the installed CLI runtime package %s', (name) => {
        expect(sourcesFor(`./node_modules/${name}`)).toEqual([
            `/app/node_modules/${name}`,
        ]);
    });

    it('uses installed Prisma at startup without an implicit package download', () => {
        const entrypoint = readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
        expect(entrypoint).toContain('set -e');
        expect(entrypoint).toContain('node node_modules/prisma/build/index.js migrate deploy');
        expect(entrypoint).not.toMatch(/\bnpx\b/);
        expect(entrypoint.indexOf('node scripts/migrate-all-tenants.js'))
            .toBeLessThan(entrypoint.indexOf('node server.js'));
    });
});

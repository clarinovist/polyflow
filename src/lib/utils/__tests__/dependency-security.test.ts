import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lock = JSON.parse(
    readFileSync(new URL('../../../../package-lock.json', import.meta.url), 'utf8'),
) as { packages: Record<string, { version: string; hasInstallScript?: boolean }> };

// Regression floors for the advisories remediated in this dependency update.
// npm audit remains necessary to detect newly disclosed vulnerabilities.
const securityFloors = [
    ['next', '16.4.3'],
    ['vitest', '4.1.12'],
    ['@vitest/coverage-v8', '4.1.12'],
    ['@vitest/mocker', '4.1.12'],
    ['xlsx', '0.20.3'],
    ['zod', '4.6.6'],
] as const;

describe('dependency security baseline', () => {
    it.each(securityFloors)('%s is at least %s', (name, minimum) => {
        const installed = lock.packages[`node_modules/${name}`].version;
        expect(installed).toMatch(/^\d+\.\d+\.\d+$/);
        expect(installed.localeCompare(minimum, 'en', { numeric: true }))
            .toBeGreaterThanOrEqual(0);
    });

    it('explicitly reviews every install-script package, pinning approvals to its locked version', () => {
        const manifest = JSON.parse(readFileSync(
            new URL('../../../../package.json', import.meta.url), 'utf8',
        )) as { allowScripts?: Record<string, boolean> };
        const policy = manifest.allowScripts ?? {};
        for (const [path, dependency] of Object.entries(lock.packages)) {
            if (!dependency.hasInstallScript) continue;
            const name = path.split('node_modules/').at(-1)!;
            const pinned = `${name}@${dependency.version}`;
            expect(policy[pinned] === true || policy[name] === false, pinned).toBe(true);
        }
        expect(policy['@google/genai']).toBe(false);
        expect(policy.fsevents).toBe(false);
        expect(Object.entries(policy).filter(([, allowed]) => allowed).map(([key]) => key))
            .toEqual(expect.arrayContaining(['esbuild@0.28.2', '@prisma/client@5.22.0']));
        expect(policy['*']).toBeUndefined();
    });

    it('keeps framework and test companion versions aligned', () => {
        const version = (name: string) => lock.packages[`node_modules/${name}`].version;
        expect(version('eslint-config-next')).toBe(version('next'));
        expect(version('@vitest/coverage-v8')).toBe(version('vitest'));
    });
});

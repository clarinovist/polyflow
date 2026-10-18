import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { invokeProductLearning, preflightProductLearning } from '../../../../scripts/run-product-learning.mjs';
describe('learning schedule tooling', () => {
    it('calls root-host loopback with runtime auth, rejecting redirects and malformed results', async () => {
        const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'DISABLED', processed: 0 })));
        expect(await invokeProductLearning({ CRON_SECRET: 'synthetic-only', NEXT_PUBLIC_ROOT_DOMAIN: 'example.invalid' }, request)).toEqual({ state: 'DISABLED', processed: 0 });
        expect(request).toHaveBeenCalledWith('http://127.0.0.1:3000/api/cron/learning', expect.objectContaining({ redirect: 'error', headers: { host: 'example.invalid', authorization: 'Bearer synthetic-only' } }));
        expect(() => preflightProductLearning({})).toThrow('CRON_SECRET_REQUIRED');
        expect(preflightProductLearning({ CRON_SECRET: 'x', NEXT_PUBLIC_ROOT_DOMAIN: 'example.invalid' })).toBe('example.invalid');
        await expect(invokeProductLearning({}, request)).rejects.toThrow();
        await expect(invokeProductLearning({ CRON_SECRET: 'x', NEXT_PUBLIC_ROOT_DOMAIN: 'admin.example.invalid' }, request)).rejects.toThrow();
        request.mockResolvedValueOnce(new Response('', { status: 503 }));
        await expect(invokeProductLearning({ CRON_SECRET: 'x' }, request)).rejects.toThrow();
        request.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'COMPLETE', processed: 0, owner: { state: 'COMPLETE', processed: 2 } })));
        expect(await invokeProductLearning({ CRON_SECRET: 'x' }, request)).toEqual({ state: 'COMPLETE', processed: 0, owner: { state: 'COMPLETE', processed: 2 } });
        request.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'COMPLETE', owner: { state: 'PARTIAL_FAILED' } })));
        await expect(invokeProductLearning({ CRON_SECRET: 'x' }, request)).rejects.toThrow();
        request.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'BUSY' })));
        await expect(invokeProductLearning({ CRON_SECRET: 'x' }, request)).rejects.toThrow();
    });
    it('merges owned cron block idempotently and leaves unrelated schedules intact', () => {
        const script = `import importlib.util\nspec=importlib.util.spec_from_file_location('learning_cron','scripts/install-product-learning-cron.py')\nm=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nbase='TZ=Asia/Jakarta\\n0 2 * * * backup-command\\n'\na=m.merge_crontab(base)\nassert a.startswith(base)\nassert m.merge_crontab(a)==a\nassert a.count(m.BEGIN)==1\ntry:\n m.merge_crontab(m.BEGIN+'\\n')\n raise AssertionError('must reject malformed block')\nexcept ValueError: pass\nprint('ok')`;
        expect(execFileSync('python3', ['-B', '-c', script], { encoding: 'utf8' }).trim()).toBe('ok');
    });
    it('ships invocation and wires scheduler only after verified release health', () => {
        const docker = readFileSync('Dockerfile', 'utf8');
        const release = readFileSync('.github/workflows/production.yml', 'utf8');
        expect(docker).toContain('/app/scripts/run-product-learning.mjs');
        expect(release.indexOf('scripts/run-product-learning.mjs --preflight')).toBeLessThan(release.indexOf('--entrypoint ./release-migrate.sh'));
        expect(release.indexOf('python3 scripts/install-product-learning-cron.py')).toBeGreaterThan(release.indexOf('curl --fail --silent --show-error --max-time 15 "$PUBLIC_HEALTH_URL"'));
    });
});

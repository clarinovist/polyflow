import { pathToFileURL } from 'node:url';

/** Run inside the app container: token remains in runtime env, never argv/logs.
 * @param {Record<string, string | undefined>} env
 */
export function preflightProductLearning(env = process.env) {
    if (!env.CRON_SECRET) throw new Error('CRON_SECRET_REQUIRED');
    const host = env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('admin.')) throw new Error('ROOT_HOST_REQUIRED');
    return host;
}
/** @param {Record<string, string | undefined>} env */
export async function invokeProductLearning(env = process.env, request = fetch) {
    const host = preflightProductLearning(env);
    const response = await request('http://127.0.0.1:3000/api/cron/learning', {
        headers: { host, authorization: `Bearer ${env.CRON_SECRET}` },
        redirect: 'error', signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) throw new Error('LEARNING_JOB_HTTP_FAILED');
    const body = await response.json();
    if (!['DISABLED', 'AWAITING_COMPLETE_DAY', 'COMPLETE'].includes(body.state)) throw new Error('LEARNING_JOB_NOT_COMPLETE');
    if (body.owner && !['DISABLED', 'AWAITING_COMPLETE_DAY', 'COMPLETE', 'PENDING'].includes(body.owner.state)) throw new Error('OWNER_LEARNING_JOB_NOT_COMPLETE');
    return { state: body.state, processed: Number.isSafeInteger(body.processed) ? body.processed : 0,
        ...(body.owner ? { owner: { state: body.owner.state, processed: Number.isSafeInteger(body.owner.processed) ? body.owner.processed : 0 } } : {}) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.includes('--preflight')) {
            preflightProductLearning();
            console.log('PRODUCT_LEARNING_PREFLIGHT_OK');
        } else console.log(JSON.stringify(await invokeProductLearning()));
    }
    catch { console.error('PRODUCT_LEARNING_JOB_FAILED'); process.exitCode = 1; }
}

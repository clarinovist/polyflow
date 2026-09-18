import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';

export function fingerprint() {
    return createHash('sha256').update([
        'package-lock.json', '.nvmrc', 'vitest.config.ts', 'vitest.setup.ts',
    ].map(file => readFileSync(file)).join('\0')).digest('hex');
}

export function hardware() {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const constrained = process.constrainedMemory?.() || totalmem();
    return {
        cpuAvailable: availableParallelism(), cpuLogical: cpus().length,
        ramBytes: totalmem(), memoryLimitBytes: Math.min(totalmem(), constrained),
        platform: process.platform, arch: process.arch, node: process.version,
        vitest: lock.packages['node_modules/vitest'].version,
        runnerImage: process.env.ImageOS || null,
        runnerImageVersion: process.env.ImageVersion || null,
        fingerprint: fingerprint(),
    };
}

// A benchmark hypothesis, NOT a production default or a claim about runner size.
// Leave 2 GiB for coordinator/OS; budget 1.5 GiB per jsdom-capable worker.
export function explicitWorkers(cpu, memoryBytes) {
    return Math.max(1, Math.min(cpu, Math.floor((memoryBytes / 2 ** 30 - 2) / 1.5)));
}

export function emit(metric) {
    const line = JSON.stringify(metric);
    console.log(`CI_METRIC ${line}`);
    if (process.env.CI_METRICS_FILE) appendFileSync(process.env.CI_METRICS_FILE, `${line}\n`);
}

export function treeRss(pid) {
    // Numeric fields only: never inspect/log command lines or environments.
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
        .trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
    const children = new Set([pid]);
    for (let changed = true; changed;) {
        changed = false;
        for (const [id, parent] of rows) {
            if (children.has(parent) && !children.has(id)) { children.add(id); changed = true; }
        }
    }
    return rows.reduce((sum, [id, , rss]) => sum + (children.has(id) ? rss * 1024 : 0), 0);
}

export async function timed(label, command, args, options = {}) {
    const start = performance.now();
    let peakTreeRssBytes = 0;
    let memorySamples = 0;
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const sample = () => {
        try {
            peakTreeRssBytes = Math.max(peakTreeRssBytes, treeRss(child.pid));
            memorySamples++;
        } catch { /* Unsupported ps: report missing samples, never invent a peak. */ }
    };
    const timer = setInterval(sample, 1000);
    try {
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (status, signal) => resolve(signal ? 1 : (status ?? 1)));
        });
        emit({ kind: 'command', label, seconds: (performance.now() - start) / 1000,
            exitCode: code, peakTreeRssBytes, memorySamples });
        return code;
    } finally {
        clearInterval(timer);
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [label, command, ...args] = process.argv.slice(2);
    if (label === 'hardware') emit({ kind: 'hardware', ...hardware() });
    else if (!label || !command) throw new Error('Usage: metrics.mjs hardware | <label> <command> [...args]');
    else process.exitCode = await timed(label, command, args);
}

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Daftar eksplisit, bukan *.md: kontrak domain/runbook/AGENTS tetap jalur lengkap.
export const safeDocuments = Object.freeze([
    'README.md', 'docs/README.md', 'docs/development/ci-selective.md',
]);
const shaPattern = /^[a-f0-9]{40}$/;
const heavyJobs = ['test-shards', 'test', 'lint', 'build-and-push', 'return-contract'];

function git(root, ...args) {
    return execFileSync('git', ['-C', root, ...args], {
        timeout: 30_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
}

/** Ketidakpastian selalu memilih lengkap; tidak pernah mencetak path/event. */
export function selectChanges(root, eventName, event, revision) {
    const full = reason => ({ full: true, reason });
    if (eventName !== 'push') return full('Manual atau event lain selalu lengkap.');
    if (!event || typeof event !== 'object' || Array.isArray(event)) return full('Metadata event tidak valid.');
    const { before, after, ref, forced } = event;
    if (ref !== 'refs/heads/main' || forced !== false || after !== revision
        || ![before, after].every(value => typeof value === 'string' && shaPattern.test(value) && value !== '0'.repeat(40))) {
        return full('Rentang push tidak dapat dipastikan.');
    }
    try {
        if (git(root, 'rev-parse', 'HEAD').toString('ascii').trim() !== after) return full('Checkout berbeda dari event.');
        git(root, 'merge-base', '--is-ancestor', before, after);
        // Seluruh rentang push tanpa batas daftar API. Rename = delete+add agar asal tetap terlihat.
        const bytes = git(root, 'diff', '--name-only', '--no-renames', '-z', before, after, '--');
        const paths = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\0').filter(Boolean);
        if (!paths.length || !paths.every(path => safeDocuments.includes(path))) {
            return full('Delta kosong atau memuat berkas di luar daftar dokumen aman.');
        }
        return { full: false, reason: 'Seluruh delta push merupakan dokumen aman.' };
    } catch {
        return full('Riwayat Git tidak tersedia atau tidak linier.');
    }
}

/** Cek teks dan target tautan inline lokal; bukan validasi semantik, anchor, atau jaringan. */
export function checkDocuments(root) {
    const base = realpathSync(root);
    for (const name of safeDocuments) {
        const path = resolve(base, name);
        // lstat juga mendeteksi symlink dangling; penghapusan dokumen sendiri sah.
        let stat;
        try { stat = lstatSync(path); } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw new Error('Dokumen tidak dapat dibaca.');
        }
        if (!stat.isFile()) throw new Error('Dokumen aman harus berkas teks biasa.');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
        if (text.includes('\0') || /^(?:<{7}|={7}|>{7})(?: |$)/m.test(text)) throw new Error('Teks dokumen atau konflik merge tidak valid.');
        for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^()\s]+)(?:\s+"[^"\n]*")?\)/g)) {
            const target = match[1];
            if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
            const local = decodeURIComponent(target.split(/[?#]/)[0]);
            if (!local) continue;
            const destination = resolve(dirname(path), local);
            if (!existsSync(destination)) throw new Error('Target tautan lokal tidak tersedia.');
            const within = relative(base, realpathSync(destination));
            if (within === '..' || within.startsWith('../') || isAbsolute(within)) throw new Error('Tautan lokal keluar dari repo.');
        }
    }
}

/** Status akhir bukan pengganti gate deploy; kegagalan/skip tak sah harus merah. */
export function checkStatus(needs, eventName) {
    const initial = needs?.['agents-consistency'];
    const full = initial?.outputs?.full;
    if (initial?.result !== 'success' || !['true', 'false'].includes(full)) throw new Error('Palang/klasifikasi gagal atau tidak lengkap.');
    if (!['push', 'workflow_dispatch'].includes(eventName) || (eventName === 'workflow_dispatch' && full !== 'true')) {
        throw new Error('Jalur event tidak sah.');
    }
    const expected = full === 'true' ? 'success' : 'skipped';
    for (const name of heavyJobs) {
        if (needs[name]?.result !== expected) throw new Error('Gate wajib gagal atau dilewati tanpa izin.');
    }
    const release = full === 'true' && eventName === 'push' ? 'success' : 'skipped';
    for (const name of ['release-please', 'deploy']) {
        if (needs[name]?.result !== release) throw new Error('Hasil rilis tidak sesuai jalur.');
    }
    return full === 'true' ? 'lengkap' : 'dokumen aman (bukan bukti rilis)';
}

export function main(root, mode, env = process.env) {
    try {
        if (mode === 'status') {
            const result = checkStatus(JSON.parse(env.CI_NEEDS), env.GITHUB_EVENT_NAME);
            console.log('Status CI lulus: ' + result);
            return 0;
        }
        if (mode !== undefined) throw new Error('Mode tidak dikenal.');
        let event;
        try { event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); } catch { event = null; }
        const result = selectChanges(root, env.GITHUB_EVENT_NAME, event, env.GITHUB_SHA);
        if (!result.full) checkDocuments(root);
        appendFileSync(env.GITHUB_OUTPUT, `full=${result.full}\n`);
        const summary = `Jalur CI: ${result.full ? 'lengkap' : 'dokumen aman'}. ${result.reason}`;
        console.log(summary);
        if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
            `## Pemilihan pemeriksaan\n\n${summary}\n${result.full ? '' : 'Tidak membuat image atau bukti kelayakan rilis.\n'}`);
        return 0;
    } catch {
        // Error filesystem/JSON dapat mengandung data masukan; jangan log error mentah.
        console.error('Pemeriksaan CI gagal; proses ditahan.');
        return 1;
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), process.argv[2]);
}

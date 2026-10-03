import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/assistant-worker', { recursive: true, force: true });
await build({
    entryPoints: ['workers/assistant/index.ts'],
    outfile: 'dist/assistant-worker/index.mjs',
    bundle: true,
    platform: 'node',
    target: 'node26',
    format: 'esm',
    sourcemap: true,
    banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __pathDirname } from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);",
    },
    external: [
        '@prisma/client',
        '@earendil-works/chord',
        '@earendil-works/chord/*',
        '@earendil-works/pi-ai',
        '@earendil-works/pi-ai/*',
        '@earendil-works/pi-durable',
        '@earendil-works/pi-durable/*',
        'openai',
        'zod',
    ],
    tsconfig: 'tsconfig.worker.json',
    logLevel: 'info',
});

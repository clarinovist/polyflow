import { disconnectAllTenants } from '../../src/lib/core/prisma';
import { TenantHarnessManager } from '../../src/lib/bot/durable/harness-manager';
import {
    createDurableModels,
    POLYFLOW_MODEL_PROVIDER,
} from '../../src/lib/bot/durable/model';
import { DurableAssistantRuntime } from '../../src/lib/bot/durable/runtime';
import { loadAssistantWorkerRuntimeConfig } from '../../src/lib/bot/durable/runtime-config';
import {
    createAssistantWorkerServer,
    listenAssistantWorker,
} from '../../src/lib/bot/durable/worker-server';

async function main() {
    const config = loadAssistantWorkerRuntimeConfig();
    const { models } = createDurableModels({
        baseUrl: config.LLM_BASE_URL,
        modelId: config.LLM_MODEL,
        contextWindow: config.LLM_CONTEXT_WINDOW,
        maxTokens: config.LLM_MAX_TOKENS,
    });
    const manager = new TenantHarnessManager({
        root: config.ASSISTANT_STORAGE_ROOT,
        models,
        model: { provider: POLYFLOW_MODEL_PROVIDER, modelId: config.LLM_MODEL },
        maxOpen: config.ASSISTANT_MAX_OPEN_HARNESSES,
        idleMs: config.ASSISTANT_HARNESS_IDLE_MS,
        onReport: (error) => {
            console.error(
                '[ASSISTANT_WORKER_REPORT]',
                error instanceof Error ? error.message : 'unknown',
            );
        },
    });
    const runtime = new DurableAssistantRuntime(manager);
    const server = createAssistantWorkerServer({
        runtime,
        manager,
        token: config.ASSISTANT_WORKER_TOKEN,
    });
    const address = await listenAssistantWorker(
        server,
        config.ASSISTANT_WORKER_HOST,
        config.ASSISTANT_WORKER_PORT,
    );
    console.log(`[ASSISTANT_WORKER_READY] port=${address.port}`);

    let shuttingDown = false;
    async function shutdown(signal: string) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[ASSISTANT_WORKER_SHUTDOWN] signal=${signal}`);
        server.close();
        await manager.close();
        await disconnectAllTenants();
        process.exit(0);
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((error) => {
    console.error(
        '[ASSISTANT_WORKER_FATAL]',
        error instanceof Error ? error.message : 'unknown',
    );
    process.exitCode = 1;
});

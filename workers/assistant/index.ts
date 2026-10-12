import { disconnectAllTenants } from '../../src/lib/core/prisma';
import { TenantHarnessManager } from '../../src/lib/bot/durable/harness-manager';
import {
    createDurableModels,
    POLYFLOW_MODEL_PROVIDER,
} from '../../src/lib/bot/durable/model';
import { DurableAssistantRuntime } from '../../src/lib/bot/durable/runtime';
import { RestrictedTelegramRuntime } from '../../src/lib/bot/durable/restricted-telegram';
import { loadAssistantWorkerRuntimeConfig } from '../../src/lib/bot/durable/runtime-config';
import {
    createAssistantWorkerServer,
    listenAssistantWorker,
} from '../../src/lib/bot/durable/worker-server';
import { loadTelegramAssistantConfig } from '../../src/lib/telegram/assistant-config';
import { consumeTelegramAssistantBatch } from '../../src/lib/telegram/assistant-consumer';

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
    const restrictedTelegram = new RestrictedTelegramRuntime({
        root: config.ASSISTANT_STORAGE_ROOT,
        models,
        model: { provider: POLYFLOW_MODEL_PROVIDER, modelId: config.LLM_MODEL },
    });
    await restrictedTelegram.inspect();
    const server = createAssistantWorkerServer({
        runtime,
        manager,
        token: config.ASSISTANT_WORKER_TOKEN,
        restrictedTelegram,
    });
    const address = await listenAssistantWorker(
        server,
        config.ASSISTANT_WORKER_HOST,
        config.ASSISTANT_WORKER_PORT,
    );
    console.log(`[ASSISTANT_WORKER_READY] port=${address.port}`);

    let shuttingDown = false;
    let telegramTimer: NodeJS.Timeout | undefined;
    try {
        const telegramConfig = loadTelegramAssistantConfig();
        const tick = async () => {
            try {
                await consumeTelegramAssistantBatch({
                    config: telegramConfig,
                    shouldClaim: () => !shuttingDown,
                });
            } catch (error) {
                console.error('[TELEGRAM_ASSISTANT_CONSUMER_FAILED]', {
                    code:
                        error && typeof error === 'object' && 'code' in error
                            ? String(error.code)
                            : 'UNKNOWN',
                });
            } finally {
                if (!shuttingDown) {
                    telegramTimer = setTimeout(
                        () => void tick(),
                        config.TELEGRAM_ASSISTANT_CONSUMER_INTERVAL_MS,
                    );
                    telegramTimer.unref();
                }
            }
        };
        void tick();
    } catch {
        console.log('[TELEGRAM_ASSISTANT_CONSUMER_DISABLED]');
    }

    async function shutdown(signal: string) {
        if (shuttingDown) return;
        shuttingDown = true;
        if (telegramTimer) clearTimeout(telegramTimer);
        console.log(`[ASSISTANT_WORKER_SHUTDOWN] signal=${signal}`);
        server.closeIdleConnections();
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                server.closeAllConnections();
                resolve();
            }, 30_000);
            timeout.unref();
            server.close(() => {
                clearTimeout(timeout);
                resolve();
            });
        });
        await Promise.all([manager.close(), restrictedTelegram.close()]);
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

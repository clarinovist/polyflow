import { AssistantBrokerExecutor } from '../../src/lib/bot/durable/broker-executor';
import {
    createAssistantBrokerServer,
    listenAssistantBroker,
} from '../../src/lib/bot/durable/broker-server';
import { loadAssistantBrokerRuntimeConfig } from '../../src/lib/bot/durable/runtime-config';
import { parseTenantQueryDatasources } from '../../src/lib/bot/durable/query-datasource';
import { disconnectAllTenants } from '../../src/lib/core/prisma';

async function main() {
    const config = loadAssistantBrokerRuntimeConfig();
    // Fail at startup, not mid-conversation, when the read-only map is invalid.
    const queryDatasources = parseTenantQueryDatasources(
        config.ASSISTANT_QUERY_DATABASE_URLS,
    );
    const allowlist = config.ASSISTANT_BROKER_ALLOWED_TOOLS.split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    const executor = new AssistantBrokerExecutor(allowlist);
    const server = createAssistantBrokerServer({
        executor,
        token: config.ASSISTANT_BROKER_TOKEN,
    });
    const address = await listenAssistantBroker(
        server,
        config.ASSISTANT_BROKER_HOST,
        config.ASSISTANT_BROKER_PORT,
    );
    console.log(`[ASSISTANT_BROKER_READY] port=${address.port}`);
    console.log(
        `[ASSISTANT_BROKER_SCOPE] tools=${allowlist.join(',')} queryTenants=${queryDatasources.size}`,
    );

    let shuttingDown = false;
    async function shutdown(signal: string) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[ASSISTANT_BROKER_SHUTDOWN] signal=${signal}`);
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await disconnectAllTenants();
        process.exit(0);
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((error) => {
    console.error(
        '[ASSISTANT_BROKER_FATAL]',
        error instanceof Error ? error.message : 'unknown',
    );
    process.exitCode = 1;
});

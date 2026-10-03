import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
    createRegistry,
    defineExtension,
    defineTool,
    Harness,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import {
    createModels,
    fauxAssistantMessage,
    fauxProvider,
    fauxText,
    fauxToolCall,
    Type,
} from '@earendil-works/pi-ai';

const [database, mode] = process.argv.slice(2);
const faux = fauxProvider({ provider: 'faux-crash' });
const models = createModels();
models.setProvider(faux.provider);
const tool = defineTool({
    name: 'read_only_fixture',
    description: 'Synthetic read-only fixture.',
    parameters: Type.Object({ key: Type.String() }),
    replay: 'safe',
    execute: async () => ({ content: [{ type: 'text', text: 'fixture-value' }] }),
});
const extension = defineExtension({ name: 'fixture', tools: [tool] });
const registry = createRegistry();
registry.install(extension);
const harness = await Harness.open(
    await openNodeSqliteStorage(database),
    { models, registry, settings: { extensions: [extension] } },
    BACKGROUND_CONTEXT,
);
const root = await harness.root(BACKGROUND_CONTEXT, {
    agent: {
        model: { provider: 'faux-crash', modelId: faux.getModel().id },
        extensions: [extension],
    },
});
if (mode === 'seed') {
    faux.setResponses([
        fauxAssistantMessage(fauxToolCall('read_only_fixture', { key: 'one' }), {
            stopReason: 'toolUse',
        }),
        fauxAssistantMessage(fauxText('durable-final')),
    ]);
    const submission = await root.submit(
        { type: 'input', content: 'synthetic', requestId: 'crash-request' },
        BACKGROUND_CONTEXT,
    );
    process.stdout.write(`${Number(root.id)}:${Number(submission.id)}\n`);
    process.exit(73);
}
if (mode === 'resume') {
    faux.setResponses([fauxAssistantMessage(fauxText('durable-final'))]);
    harness.resume();
    const submission = await root.submit(
        { type: 'input', content: 'synthetic', requestId: 'crash-request' },
        BACKGROUND_CONTEXT,
    );
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    process.stdout.write(JSON.stringify({ status: settled.status, calls: faux.state.callCount }));
    await harness.close(BACKGROUND_CONTEXT);
}

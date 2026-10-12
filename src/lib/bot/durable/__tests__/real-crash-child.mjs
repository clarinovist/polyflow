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

const [database, mode, phase] = process.argv.slice(2);
const requestId = 'real-crash-request';
const faux = fauxProvider({ provider: 'faux-real-crash' });
const models = createModels();
models.setProvider(faux.provider);

function holdForKill() {
    setInterval(() => undefined, 60_000);
}

const tool = defineTool({
    name: 'read_only_fixture',
    description: 'Synthetic replay-safe read.',
    parameters: Type.Object({ key: Type.String() }),
    replay: 'safe',
    execute: async () => {
        if (mode === 'seed' && phase === 'tool_started') {
            process.stdout.write('PHASE:tool_started\n');
            holdForKill();
            await new Promise(() => {});
        }
        return { content: [{ type: 'text', text: 'fixture-value' }] };
    },
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
        model: { provider: 'faux-real-crash', modelId: faux.getModel().id },
        extensions: [extension],
    },
});

function toolThenFinal() {
    faux.setResponses([
        fauxAssistantMessage(fauxToolCall('read_only_fixture', { key: 'one' }), {
            stopReason: 'toolUse',
        }),
        fauxAssistantMessage(fauxText('durable-final')),
    ]);
}

if (mode === 'seed') {
    toolThenFinal();
    const submission = await root.submit(
        { type: 'input', content: 'synthetic', requestId },
        BACKGROUND_CONTEXT,
    );
    if (phase === 'sqlite_admitted') {
        process.stdout.write('PHASE:sqlite_admitted\n');
        holdForKill();
    } else if (phase === 'sqlite_final') {
        await submission.wait(BACKGROUND_CONTEXT);
        process.stdout.write('PHASE:sqlite_final\n');
        holdForKill();
    }
}

if (mode === 'resume') {
    if (phase === 'sqlite_admitted') toolThenFinal();
    else faux.setResponses([fauxAssistantMessage(fauxText('durable-final'))]);
    harness.resume();
    const first = await root.submit(
        { type: 'input', content: 'synthetic', requestId },
        BACKGROUND_CONTEXT,
    );
    const second = await root.submit(
        { type: 'input', content: 'synthetic', requestId },
        BACKGROUND_CONTEXT,
    );
    const settled = await first.wait(BACKGROUND_CONTEXT);
    process.stdout.write(
        JSON.stringify({
            status: settled.status,
            deduped: Number(first.id) === Number(second.id),
        }),
    );
    await harness.close(BACKGROUND_CONTEXT);
}

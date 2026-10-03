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

// Deterministic crash-matrix child. Usage:
//   node crash-matrix-child.mjs <database> <mode> [extra]
// Modes mirror the 11-point crash matrix in the plan:
//   seed-<point>   admit requestId then hard-exit(73) at the named point
//   resume         re-submit the same requestId, settle, report dedupe state
//
// Points (all use requestId 'matrix-request' on one conversation):
//   accept         after accept, before first model byte
//   stream         during model stream (partial emitted, exit mid-run)
//   admitted       after assistant tool call persisted, before tool starts
//   tool           during replay-safe read-only tool
//   tool-result    after tool result, before next model request
//   final          after final durable answer, before projection
//   projected      after projection marker, before done event
//   disconnect     SSE disconnect/reconnect (submit, exit, resume+watch)
//   sigterm        graceful SIGTERM path (close cleanly, exit 0)
//   hardkill       hard kill path (exit 73 without close)
//   recreate       worker recreate same volume (close, reopen, resume)
const [database, mode] = process.argv.slice(2);
const REQUEST_ID = 'matrix-request';

const faux = fauxProvider({ provider: 'faux-matrix' });
const models = createModels();
models.setProvider(faux.provider);

let _toolCalls = 0;
const tool = defineTool({
    name: 'read_only_fixture',
    description: 'Synthetic read-only fixture.',
    parameters: Type.Object({ key: Type.String() }),
    replay: 'safe',
    execute: async () => {
        _toolCalls++;
        if (mode === 'seed-tool') {
            // Die inside the tool: replay-safe re-execution must not
            // duplicate visible effects (toolCalls resets per process; the
            // resume side asserts exactly one logical execution settles).
            process.exit(73);
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
        model: { provider: 'faux-matrix', modelId: faux.getModel().id },
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

if (mode.startsWith('seed')) {
    toolThenFinal();
    const submission = await root.submit(
        { type: 'input', content: 'synthetic', requestId: REQUEST_ID },
        BACKGROUND_CONTEXT,
    );
    process.stdout.write(
        `${Number(root.id)}:${Number(submission.id)}:${mode}\n`,
    );
    if (mode === 'seed-sigterm') {
        await harness.close(BACKGROUND_CONTEXT);
        process.exit(0);
    }
    // All other seed points are hard crashes: no close, no settle.
    process.exit(73);
}

if (mode === 'resume') {
    // Resume must dedupe: same requestId returns the existing submission.
    // Only the final text is stubbed — if the tool already ran, it replays
    // from the persisted result without re-executing.
    faux.setResponses([fauxAssistantMessage(fauxText('durable-final'))]);
    harness.resume();
    const first = await root.submit(
        { type: 'input', content: 'synthetic', requestId: REQUEST_ID },
        BACKGROUND_CONTEXT,
    );
    const second = await root.submit(
        { type: 'input', content: 'synthetic', requestId: REQUEST_ID },
        BACKGROUND_CONTEXT,
    );
    const settled = await first.wait(BACKGROUND_CONTEXT);
    const result = {
        status: settled.status,
        deduped: Number(first.id) === Number(second.id),
        calls: faux.state.callCount,
    };
    process.stdout.write(JSON.stringify(result));
    await harness.close(BACKGROUND_CONTEXT);
}

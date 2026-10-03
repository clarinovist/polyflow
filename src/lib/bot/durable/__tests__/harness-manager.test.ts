import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { AssistantEntry } from '@earendil-works/pi-durable';
import {
    createModels,
    fauxAssistantMessage,
    fauxProvider,
    fauxText,
} from '@earendil-works/pi-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantHarnessManager } from '../harness-manager';
import { AuthorityDoc, PresentationEntry } from '../documents';
import { PolyflowFastPath, submitDurableFastPath } from '../fast-path';

vi.mock('../projection', () => ({ upsertDurableToolAudit: vi.fn() }));

const authority = {
    schemaVersion: 1 as const,
    publicConversationId: 'public-conversation',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web' as const,
    accessScopeHash: 'a'.repeat(64),
    workContextKey: 'general:/',
    pathname: '/',
    profile: 'general' as const,
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('TenantHarnessManager', () => {
    it('deduplicates a request and finds the same answer after close/reopen', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'polyflow-durable-'));
        cleanups.push(() => rm(root, { recursive: true, force: true }));
        const faux = fauxProvider({ provider: 'faux-durable' });
        faux.setResponses([fauxAssistantMessage(fauxText('jawaban durable'))]);
        const models = createModels();
        models.setProvider(faux.provider);
        const options = {
            root,
            models,
            model: { provider: 'faux-durable', modelId: faux.getModel().id },
            maxOpen: 2,
            idleMs: 10_000,
        };
        const manager = new TenantHarnessManager(options);
        const first = await manager.acquire(authority);
        const submission = await first.conversation.submit(
            {
                type: 'input',
                content: 'pertanyaan sintetis',
                requestId: 'req-1',
            },
            BACKGROUND_CONTEXT,
        );
        const duplicate = await first.conversation.submit(
            {
                type: 'input',
                content: 'pertanyaan sintetis',
                requestId: 'req-1',
            },
            BACKGROUND_CONTEXT,
        );
        expect(duplicate.id).toBe(submission.id);
        const settled = await submission.wait(BACKGROUND_CONTEXT);
        expect(settled.status).toBe('done');
        const durableConversationId = Number(first.conversation.id);
        first.release();
        await manager.close();

        const reopenedManager = new TenantHarnessManager(options);
        const reopened = await reopenedManager.acquire(
            authority,
            durableConversationId,
        );
        const storedAuthority = await reopened.harness.snapshot(
            AuthorityDoc,
            reopened.conversation.id,
            BACKGROUND_CONTEXT,
        );
        const found = await reopened.harness.submission(
            Number(submission.id) as never,
            BACKGROUND_CONTEXT,
        );
        const foundState = await found?.status(BACKGROUND_CONTEXT);
        const answer =
            foundState?.status === 'done' && foundState.type === 'input'
                ? await reopened.conversation.commit(
                      (tx) => tx.entry(AssistantEntry, foundState.answer),
                      BACKGROUND_CONTEXT,
                  )
                : undefined;
        expect(storedAuthority?.tenantId).toBe('tenant-one');
        expect(answer?.model?.[0]).toMatchObject({ role: 'assistant' });
        expect(faux.state.callCount).toBe(1);
        reopened.release();
        await reopenedManager.close();
        expect(
            await readFile(
                path.join(root, reopenedManager.storageKey(authority.tenantId), 'assistant.sqlite'),
            ),
        ).not.toHaveLength(0);
    });

    it('persists deterministic fast paths in one durable submission', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'polyflow-fast-path-'));
        cleanups.push(() => rm(root, { recursive: true, force: true }));
        const faux = fauxProvider({ provider: 'faux-fast-path' });
        const models = createModels();
        models.setProvider(faux.provider);
        const manager = new TenantHarnessManager({
            root,
            models,
            model: { provider: 'faux-fast-path', modelId: faux.getModel().id },
            maxOpen: 2,
            idleMs: 10_000,
        });
        const lease = await manager.acquire(authority);
        await lease.conversation.configure(
            { extensions: { add: [PolyflowFastPath] } },
            BACKGROUND_CONTEXT,
        );
        const submission = await submitDurableFastPath({
            harness: lease.harness,
            conversation: lease.conversation,
            requestId: 'fast-1',
            question: 'halo',
            response: {
                answer: 'Halo durable',
                citations: ['policy:greeting'],
                safety: { allowed: true },
            },
        });
        const settled = await submission.wait(BACKGROUND_CONTEXT);
        expect(settled).toMatchObject({ status: 'done', type: 'input' });
        const page = await lease.conversation.entries(
            {},
            20,
            undefined,
            BACKGROUND_CONTEXT,
        );
        expect(
            page.items.find(PresentationEntry.is)?.data.response.answer,
        ).toBe('Halo durable');
        expect(faux.state.callCount).toBe(0);
        lease.release();
        await manager.close();
    });

    it('uses an opaque tenant hash and rejects mismatched durable authority', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'polyflow-durable-'));
        cleanups.push(() => rm(root, { recursive: true, force: true }));
        const faux = fauxProvider({ provider: 'faux-authority' });
        const models = createModels();
        models.setProvider(faux.provider);
        const manager = new TenantHarnessManager({
            root,
            models,
            model: { provider: 'faux-authority', modelId: faux.getModel().id },
            maxOpen: 2,
            idleMs: 10_000,
        });
        const first = await manager.acquire(authority);
        expect(manager.storagePath(authority.tenantId)).not.toContain(
            authority.tenantId,
        );
        const id = Number(first.conversation.id);
        first.release();
        await expect(
            manager.acquire({ ...authority, userId: 'foreign-user' }, id),
        ).rejects.toThrow('ASSISTANT_DURABLE_AUTHORITY_MISMATCH');
        await manager.close();
    });
});

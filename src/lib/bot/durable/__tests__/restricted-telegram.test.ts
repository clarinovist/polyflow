import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    createModels,
    fauxAssistantMessage,
    fauxProvider,
    fauxText,
} from '@earendil-works/pi-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    RESTRICTED_TELEGRAM_STORAGE_KEY,
    RestrictedTelegramRuntime,
} from '../restricted-telegram';

vi.mock('../../help-articles', () => ({
    searchHelpArticles: vi.fn(async () => []),
}));

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(
        roots.splice(0).map((root) =>
            rm(root, { recursive: true, force: true }),
        ),
    );
});

function fixture(root: string) {
    const faux = fauxProvider({ provider: 'faux-restricted-telegram' });
    faux.setResponses([fauxAssistantMessage(fauxText('panduan publik'))]);
    const models = createModels();
    models.setProvider(faux.provider);
    return {
        faux,
        runtime: new RestrictedTelegramRuntime({
            root,
            models,
            model: {
                provider: 'faux-restricted-telegram',
                modelId: faux.getModel().id,
            },
        }),
    };
}

const request = {
    protocolVersion: 1 as const,
    requestId: '11111111-1111-4111-8111-111111111111',
    integrationScope: 'a'.repeat(64),
    question: 'cara stok opname',
};

describe('restricted Telegram worker runtime', () => {
    it('uses an opaque backup-compatible source and one-shot isolated conversations', async () => {
        const root = await mkdtemp(
            path.join(tmpdir(), 'restricted-telegram-'),
        );
        roots.push(root);
        const f = fixture(root);
        expect(RESTRICTED_TELEGRAM_STORAGE_KEY).toMatch(/^[a-f0-9]{64}$/);
        expect(f.runtime.storagePath()).toContain(
            `${RESTRICTED_TELEGRAM_STORAGE_KEY}/assistant.sqlite`,
        );
        const result = await f.runtime.submit(request);
        expect(result).toMatchObject({ status: 'done', accepted: true });
        expect(f.faux.state.callCount).toBe(1);
        await f.runtime.close();
    });

    it('deduplicates same scope/request across reopen and rejects a changed question', async () => {
        const root = await mkdtemp(
            path.join(tmpdir(), 'restricted-telegram-'),
        );
        roots.push(root);
        const first = fixture(root);
        const original = await first.runtime.submit(request);
        expect(original.status).toBe('done');
        await first.runtime.close();

        const reopened = fixture(root);
        const duplicate = await reopened.runtime.submit(request);
        expect(duplicate.status).toBe('done');
        expect(reopened.faux.state.callCount).toBe(0);
        await expect(
            reopened.runtime.submit({
                ...request,
                question: 'pertanyaan berbeda',
            }),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH', status: 409 });
        await reopened.runtime.close();
    });

    it('deduplicates simultaneous submissions on the same scoped request', async () => {
        const root = await mkdtemp(
            path.join(tmpdir(), 'restricted-telegram-'),
        );
        roots.push(root);
        const f = fixture(root);
        const [first, second] = await Promise.all([
            f.runtime.submit(request),
            f.runtime.submit(request),
        ]);
        expect(first.status).toBe('done');
        expect(second.status).toBe('done');
        expect(f.faux.state.callCount).toBe(1);
        await f.runtime.close();
    });

    it('partitions the same external request ID by integration scope', async () => {
        const root = await mkdtemp(
            path.join(tmpdir(), 'restricted-telegram-'),
        );
        roots.push(root);
        const f = fixture(root);
        f.faux.setResponses([
            fauxAssistantMessage(fauxText('scope a')),
            fauxAssistantMessage(fauxText('scope b')),
        ]);
        const first = await f.runtime.submit(request);
        const second = await f.runtime.submit({
            ...request,
            integrationScope: 'b'.repeat(64),
        });
        expect(first.status).toBe('done');
        expect(second.status).toBe('done');
        expect(f.faux.state.callCount).toBe(2);
        await f.runtime.close();
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
const completion = vi.fn();
const save = vi.fn();
const getConversation = vi.fn();
const load = vi.fn();
const search = vi.fn();
const executeTool = vi.fn();
const auditTool = vi.fn().mockResolvedValue({});
const allowedTool = vi.fn();
const availableTools = vi.fn();
const preflight = vi.fn();
vi.mock('openai', () => ({ default: class { chat = { completions: { create: completion } }; } }));
vi.mock('../assistant-jev', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../assistant-jev')>();
    return {
        ...actual,
        isAssistantJevEnabled: () =>
            process.env.ASSISTANT_JEV_ENABLED === 'true',
        evaluateAssistantPreflight: (...args: unknown[]) => preflight(...args),
    };
});
vi.mock('@/lib/core/prisma', () => ({ prisma: { helpToolExecution: { create: (...args: unknown[]) => auditTool(...args) } } }));
vi.mock('../conversation-service', () => ({
    getOrCreateConversation: (...args: unknown[]) => getConversation(...args),
    loadConversationContext: (...args: unknown[]) => load(...args),
    saveConversationExchange: (...args: unknown[]) => save(...args),
    buildLlmHistory: (context: { history: unknown[] }) => context.history,
}));
vi.mock('../tool-registry', () => ({
    toolsToOpenAiFormat: (tools: Array<{ name: string }>) =>
        tools.map((tool) => ({ type: 'function', function: { name: tool.name } })),
}));
vi.mock('../assistant-tool-access', () => ({ getAvailableAssistantTools: (...args: unknown[]) => availableTools(...args), findAllowedAssistantTool: (...args: unknown[]) => allowedTool(...args) }));
vi.mock('../help-articles', () => ({ searchHelpArticles: (...args: unknown[]) => search(...args) }));
vi.mock('../injection-defense', () => ({ checkPromptInjection: () => ({ safe: true }), logInjectionAttempt: vi.fn() }));
import { generateVirtualCsReply } from '../virtual-cs-service';
import type { AssistantRequestContext } from '../assistant-types';
import { createEvidence } from '../evidence';
import { documentSearchMeta } from '../document-search';
const context: AssistantRequestContext = { tenantId: 'tenant-1', permissionsVerified: true, sessionUser: { id: 'user-1', role: 'FINANCE', roles: ['FINANCE'], allowedResources: ['/finance'] }, workContext: { pathname: '/finance' }, conversationId: 'requested' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ASSISTANT_CONTEXTUAL_PROFILES', 'true');
    vi.stubEnv('ASSISTANT_JEV_ENABLED', 'false');
    preflight.mockResolvedValue({
        status: 'completed',
        model: 'jev-1.13.0',
        usage: { inputTokens: 10, outputTokens: 2 },
        data: {
            intent: 'guidance',
            route: 'knowledge_base',
            routeConfidence: 0.9,
            needsClarification: 0.1,
        },
    });
    getConversation.mockResolvedValue({ id: 'authorized' });
    load.mockResolvedValue({ history: [], resolvedEntities: new Map() });
    save.mockResolvedValue(undefined);
    search.mockResolvedValue([]);
    allowedTool.mockReturnValue(undefined);
    availableTools.mockReturnValue([]);
    executeTool.mockReset();
    auditTool.mockResolvedValue({});
    completion.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: 'Jawaban berbukti' } }] });
});

describe('assistant tool audit metadata', () => {
    function requestTool(searchTerm: string) {
        allowedTool.mockReturnValue({ name: 'get_invoice_status', requiredResources: ['/finance/invoices/sales'], sensitivity: 'financial', inputSchema: z.object({ searchTerm: z.string() }), execute: executeTool });
        completion.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'get_invoice_status', arguments: JSON.stringify({ searchTerm }) } }] } }] });
        completion.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: 'Hasil pemeriksaan invoice tersedia.' } }] });
        return generateVirtualCsReply({ question: 'Cek status invoice', channel: 'web' }, context);
    }
    it.each([0, 1])('persists bounded metadata on lookup result count %i', async count => {
        const meta = documentSearchMeta('INV INV‑2026‑0421', count, 'total');
        executeTool.mockResolvedValue(createEvidence({ summary: count ? 'Ditemukan' : 'Tidak ditemukan', facts: [{ label: 'Customer', value: 'PRIVATE FIXTURE' }], source: 'tenant-data', searchMeta: meta }));
        await requestTool('INV INV‑2026‑0421');
        expect(auditTool).toHaveBeenCalledWith({ data: expect.objectContaining({ conversationId: 'authorized', toolName: 'get_invoice_status', outcome: 'SUCCESS', evidenceMetaJson: meta }) });
        expect(JSON.stringify(auditTool.mock.calls)).not.toContain('PRIVATE FIXTURE');
        const toolMessage = completion.mock.calls.at(-1)?.[0].messages.find((m: { role: string }) => m.role === 'tool');
        expect(toolMessage.content).not.toContain('matchCount');
    });
    it('does not serialize free text on query failure', async () => {
        executeTool.mockRejectedValue(new Error('PRIVATE QUERY ERROR'));
        await requestTool('Fixture Person');
        expect(auditTool).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'ERROR', evidenceMetaJson: { searchTerm: null, candidates: [], matchCount: null, matchCountScope: 'unknown' } }) });
        expect(JSON.stringify(auditTool.mock.calls)).not.toMatch(/Fixture Person|PRIVATE QUERY ERROR/);
    });
    it('uses explicit unknown counts for tools without lookup metadata', async () => {
        executeTool.mockResolvedValue(createEvidence({ summary: 'Ringkasan', facts: [], source: 'tenant-data' }));
        await requestTool('Fixture Person');
        expect(auditTool.mock.calls[0][0].data.evidenceMetaJson).toEqual(documentSearchMeta(undefined, null));
    });
    it('keeps audit write failure non-blocking', async () => {
        executeTool.mockResolvedValue(createEvidence({ summary: 'Ringkasan', facts: [], source: 'tenant-data' }));
        auditTool.mockRejectedValue(new Error('audit unavailable'));
        expect((await requestTool('INV-2026-0421')).answer).toBe('Hasil pemeriksaan invoice tersedia.');
    });
});

describe('assistant exchange persistence integration', () => {
    it.each(['halo', 'hallo polyflow mau tanya nih'])(
        'persists greeting %j without calling the model and stamps server-only access/context',
        async (question) => {
        const result = await generateVirtualCsReply({ question, channel: 'web' }, context);
        expect(result).toMatchObject({ conversationId: 'authorized', historySaved: true });
        expect(completion).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'authorized', question, metadata: expect.objectContaining({ contextKey: 'finance:/finance', accessScope: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
        expect(getConversation.mock.calls[0][0]).toMatchObject({ conversationId: 'requested', tenantId: 'tenant-1', userId: 'user-1', channel: 'web' });
        expect(load.mock.calls[0][2]).toBe(save.mock.calls[0][0].metadata.accessScope);
        },
    );
    it('uses the detailed persona without repetitive greeting instructions', async () => {
        await generateVirtualCsReply({ question: 'Jelaskan invoice', channel: 'web', requesterName: 'User' }, context);
        const prompt = completion.mock.calls[0][0].messages[0].content;
        expect(prompt).toContain('Pertanyaan sederhana cukup 1–3 kalimat');
        expect(prompt).toContain('Saat pengguna frustrasi');
        expect(prompt).not.toContain('Sapa user dengan nama');
        expect(prompt).toContain('TIDAK DAPAT membuat');
        expect(prompt).toContain('Read-only melarang ANDA mengeksekusi perubahan');
        expect(prompt).toContain('jangan membuka dengan penolakan read-only');
        expect(prompt).toContain('baca langkah artikel yang relevan');
    });
    it('uses authorized multi-turn reproduction details without calling the LLM', async () => {
        load.mockResolvedValue({ resolvedEntities: new Map(), history: [
            { role: 'user', content: 'Halaman: Form\nField: Nama\nInput: Contoh\nHarapan: Contoh\nAktual: Kosong' },
            { role: 'assistant', content: 'Detail reproduksi yang masih diperlukan:\n- Langkah:\n- Berulang:' },
        ] });
        const result = await generateVirtualCsReply({ question: 'Langkah: Buka form lalu ketik lalu pindah kolom\nBerulang: Ya', channel: 'web' }, context);
        expect(result).toMatchObject({ disposition: 'ESCALATE', historySaved: true });
        expect(completion).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalled();
    });
    it('persists deterministic troubleshooting replies', async () => {
        const result = await generateVirtualCsReply({ question: 'Nilai input berubah', channel: 'web' }, context);
        expect(result.historySaved).toBe(true);
        expect(result.disposition).toBe('NEEDS_CLARIFICATION');
        expect(completion).not.toHaveBeenCalled();
    });
    it('uses the JEV route to expose data tools without substituting Knowledge Base', async () => {
        vi.stubEnv('ASSISTANT_JEV_ENABLED', 'true');
        const dataTool = {
            name: 'get_purchase_order',
            description: 'Cek PO',
            requiredResources: ['/finance'],
            sensitivity: 'financial',
        };
        const knowledgeTool = {
            name: 'search_help_articles',
            description: 'Cari panduan',
            requiredResources: [],
            sensitivity: 'normal',
        };
        availableTools.mockReturnValueOnce([dataTool, knowledgeTool]);
        preflight.mockResolvedValueOnce({
            status: 'completed',
            model: 'jev-1.13.0',
            usage: { inputTokens: 10, outputTokens: 2 },
            data: {
                intent: 'data',
                route: 'data_tools',
                routeConfidence: 0.9,
                needsClarification: 0.1,
            },
        });

        await generateVirtualCsReply(
            { question: 'Apakah ada draft PO?', channel: 'web' },
            context,
        );

        expect(completion.mock.calls[0][0].tools).toEqual([
            { type: 'function', function: { name: 'get_purchase_order' } },
        ]);
        expect(completion.mock.calls[0][0].messages[0].content).toContain(
            'Rute semantik: data_tools',
        );
    });

    it('returns a successful income-statement answer without a post-answer JEV gate', async () => {
        vi.stubEnv('ASSISTANT_JEV_ENABLED', 'true');
        const financeEvidence = createEvidence({
            summary:
                'Rekonsiliasi laba-rugi/COGS 2026-09-01 s.d. 2026-09-30 WIB (read-only).',
            facts: [
                { label: 'Laba bersih', value: 'Rp10.000,00' },
                { label: 'Laba kotor', value: 'Rp15.000,00' },
            ],
            entities: [
                {
                    type: 'JournalEntry',
                    id: 'journal-1',
                    label: 'JE-SYNTHETIC',
                },
            ],
            source: 'tenant-data',
        });
        const financeTool = {
            name: 'get_finance_reconciliation',
            description: 'Laporan laba rugi',
            requiredResources: ['/finance/reports/income-statement'],
            sensitivity: 'financial',
            inputSchema: z.object({
                startDate: z.string(),
                endDate: z.string(),
            }),
            execute: executeTool,
        };
        availableTools.mockReturnValueOnce([financeTool]);
        allowedTool.mockReturnValue(financeTool);
        executeTool.mockResolvedValue(financeEvidence);
        preflight.mockResolvedValueOnce({
            status: 'completed',
            model: 'jev-1.13.0',
            usage: { inputTokens: 10, outputTokens: 2 },
            data: {
                intent: 'data',
                route: 'data_tools',
                routeConfidence: 0.9,
                needsClarification: 0,
            },
        });
        completion
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            tool_calls: [
                                {
                                    id: 'tool-finance',
                                    type: 'function',
                                    function: {
                                        name: 'get_finance_reconciliation',
                                        arguments: JSON.stringify({
                                            startDate: '2026-09-01',
                                            endDate: '2026-09-30',
                                        }),
                                    },
                                },
                            ],
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content:
                                'September untung. Laba bersihnya Rp10.000,00 berdasarkan laporan laba rugi.',
                        },
                    },
                ],
            });

        const result = await generateVirtualCsReply(
            {
                question: 'Saya ingin tahu bulan September apakah untung?',
                channel: 'web',
            },
            context,
        );

        expect(result.answer).toContain('September untung');
        expect(result.answer).not.toContain('kirim nomor atau nama data');
        expect(result).not.toHaveProperty('qualityGate');
        expect(completion).toHaveBeenCalledTimes(2);
        expect(executeTool).toHaveBeenCalledTimes(1);
    });

    it('keeps streaming the DeepSeek answer after JEV preflight', async () => {
        vi.stubEnv('ASSISTANT_JEV_ENABLED', 'true');
        const onEvent = vi.fn();
        completion.mockImplementationOnce(async (request: { stream?: boolean }) => {
            expect(request.stream).toBe(true);
            return {
                async *[Symbol.asyncIterator]() {
                    yield { choices: [{ delta: { content: 'Jawaban ' } }] };
                    yield { choices: [{ delta: { content: 'berbukti' } }] };
                },
            };
        });

        const result = await generateVirtualCsReply(
            { question: 'Jelaskan invoice', channel: 'web' },
            { ...context, onEvent },
        );

        expect(preflight).toHaveBeenCalledTimes(1);
        expect(onEvent.mock.calls).toEqual([
            [{ type: 'delta', text: 'Jawaban ' }],
            [{ type: 'delta', text: 'berbukti' }],
        ]);
        expect(result).toMatchObject({ answer: 'Jawaban berbukti' });
        expect(result).not.toHaveProperty('qualityGate');
    });

    it('keeps the assistant available when JEV preflight is unavailable', async () => {
        vi.stubEnv('ASSISTANT_JEV_ENABLED', 'true');
        preflight.mockResolvedValueOnce({
            status: 'unavailable',
            code: 'timeout',
        });

        const result = await generateVirtualCsReply(
            { question: 'Jelaskan invoice', channel: 'web' },
            context,
        );

        expect(result).toMatchObject({ answer: 'Jawaban berbukti' });
        expect(result).not.toHaveProperty('qualityGate');
    });

    it('waits for exchange persistence before returning the normal answer', async () => {
        let finishSave!: () => void;
        save.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));
        let finished = false;
        const pending = generateVirtualCsReply({ question: 'Jelaskan invoice', channel: 'web' }, context).then((r) => { finished = true; return r; });
        await vi.waitFor(() => expect(finishSave).toBeDefined());
        expect(finished).toBe(false);
        finishSave();
        expect(await pending).toMatchObject({ answer: 'Jawaban berbukti', historySaved: true });
    });
    it('reports unsaved reply on database write failure without suppressing answer', async () => {
        save.mockRejectedValue(new Error('write failed'));
        expect(await generateVirtualCsReply({ question: 'halo', channel: 'web' }, context)).toMatchObject({ historySaved: false });
    });
    it('persists network fallback so it also survives remount', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        completion.mockRejectedValue(new Error('synthetic network error'));
        const result = await generateVirtualCsReply({ question: 'Jelaskan invoice', channel: 'web' }, context);
        expect(result).toMatchObject({ historySaved: true, conversationId: 'authorized' });
        expect(save).toHaveBeenCalledTimes(1);
        vi.restoreAllMocks();
    });
    it('does not load or write a client-supplied conversation without identity', async () => {
        await generateVirtualCsReply({ question: 'halo', channel: 'web' }, { conversationId: 'foreign' });
        expect(getConversation).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    });
});

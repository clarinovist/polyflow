import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assessmentNeedsRevision,
    buildAssistantRevisionInstruction,
    evaluateAssistantDraft,
    evaluateAssistantPreflight,
    sanitizeAssistantJevText,
} from '../assistant-jev';

const originalFetch = global.fetch;

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.stubEnv('ASSISTANT_JEV_ENABLED', 'true');
    vi.stubEnv('SYSTEMONE_API_KEY', 'test-key');
});

afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('assistant JEV data minimization', () => {
    it('redacts identifiers, contact data, amounts, and supplied entity labels', () => {
        const sanitized = sanitizeAssistantJevText(
            'Cek PO-2026-0042 untuk Customer Acme Jaya, budi@example.com, 081234567890, Rp 12.500. URL https://internal.invalid/x',
            ['Acme Jaya'],
        );

        expect(sanitized).toContain('<DOCUMENT>');
        expect(sanitized).toContain('<ENTITY_A>');
        expect(sanitized).toContain('<EMAIL>');
        expect(sanitized).toContain('<PHONE>');
        expect(sanitized).toContain('<AMOUNT>');
        expect(sanitized).toContain('<URL>');
        expect(sanitized).not.toMatch(
            /PO-2026-0042|Acme Jaya|budi@example.com|081234567890|12\.500|internal\.invalid/,
        );
    });
});

describe('assistant JEV client', () => {
    it('returns a validated preflight and sends no requester name or document number', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response({
                model: 'jev-1.13.0',
                answers: {
                    intent: {
                        type: 'choice',
                        choice: 'data',
                        confidence: 0.9,
                        probabilities: {
                            guidance: 0.02,
                            diagnosis: 0.03,
                            data: 0.9,
                            execution: 0.02,
                            conversation: 0.03,
                        },
                    },
                    route: {
                        type: 'choice',
                        choice: 'data_tools',
                        confidence: 0.9,
                        probabilities: {
                            data_tools: 0.9,
                            knowledge_base: 0.04,
                            clarify: 0.04,
                            conversation: 0.02,
                        },
                    },
                    needs_clarification: { type: 'noul', noul: 0.1 },
                },
                usage: { input_tokens: 100, output_tokens: 20 },
            }),
        );
        global.fetch = fetchMock;

        const result = await evaluateAssistantPreflight({
            question: 'Cek PO-2026-0042 milik Budi',
            deterministicIntent: 'data',
            availableToolNames: ['get_purchase_order'],
            requesterName: 'Budi',
        });

        expect(result).toMatchObject({
            status: 'completed',
            data: {
                intent: 'data',
                route: 'data_tools',
                routeConfidence: 0.9,
            },
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.typesafe.ai/v1/systemone');
        expect(init.redirect).toBe('error');
        const serialized = String(init.body);
        expect(serialized).not.toMatch(/PO-2026-0042|Budi/);
        expect(init.headers.Authorization).toBe('Bearer test-key');
    });

    it('fails open with bounded error metadata and never echoes provider bodies', async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValue(response({ secret: 'provider detail' }, 429));

        await expect(
            evaluateAssistantPreflight({
                question: 'cek stok',
                deterministicIntent: 'data',
                availableToolNames: [],
            }),
        ).resolves.toEqual({ status: 'unavailable', code: 'rate_limited' });
    });

    it('parses quality assessment and redacts evidence entities', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response({
                model: 'jev-1.13.0',
                answers: {
                    disposition: {
                        type: 'choice',
                        choice: 'revise',
                        confidence: 0.8,
                        probabilities: {
                            pass: 0.1,
                            revise: 0.8,
                            clarify: 0.1,
                        },
                    },
                    helpfulness: {
                        type: 'score',
                        score: 1.8,
                        confidence: 0.7,
                        legend: {
                            '0': 'bad',
                            '1': 'weak',
                            '2': 'ok',
                            '3': 'good',
                            '4': 'great',
                        },
                        probabilities: {
                            '0': 0,
                            '1': 0.3,
                            '2': 0.6,
                            '3': 0.1,
                            '4': 0,
                        },
                    },
                    unsupported_claim: { type: 'noul', noul: 0.8 },
                    excessive_verbosity: { type: 'noul', noul: 0.7 },
                },
                usage: { input_tokens: 200, output_tokens: 30 },
            }),
        );
        global.fetch = fetchMock;

        const result = await evaluateAssistantDraft({
            question: 'Cek PO-2026-0042',
            draft: 'PO-2026-0042 milik Acme Jaya pasti gagal.',
            preflight: {
                intent: 'diagnosis',
                route: 'data_tools',
                routeConfidence: 0.9,
                needsClarification: 0,
            },
            evidence: [
                {
                    summary: 'PO-2026-0042 milik Acme Jaya ditemukan',
                    facts: [{ label: 'Status', value: 'DRAFT' }],
                    entities: [
                        {
                            type: 'PurchaseOrder',
                            id: 'PO-2026-0042',
                            label: 'Acme Jaya',
                        },
                    ],
                    source: 'tenant-data',
                    checkedAt: new Date().toISOString(),
                    completeness: 'partial',
                },
            ],
            toolOutcomes: [{ name: 'get_purchase_order', outcome: 'SUCCESS' }],
        });

        expect(result).toMatchObject({
            status: 'completed',
            data: {
                disposition: 'revise',
                helpfulness: 1.8,
                unsupportedClaim: 0.8,
                excessiveVerbosity: 0.7,
            },
        });
        const serialized = String(fetchMock.mock.calls[0][1].body);
        expect(serialized).not.toMatch(/PO-2026-0042|Acme Jaya/);
        expect(serialized).toContain('DRAFT');
        expect(serialized).toContain('<ENTITY_');
    });

    it('rejects a non-TypeSafe or malformed endpoint without making a request', async () => {
        vi.stubEnv('SYSTEMONE_ENDPOINT', 'https://untrusted.invalid/v1/systemone');
        const fetchMock = vi.fn();
        global.fetch = fetchMock;

        await expect(
            evaluateAssistantPreflight({
                question: 'cek stok',
                deterministicIntent: 'data',
                availableToolNames: [],
            }),
        ).resolves.toEqual({ status: 'unavailable', code: 'invalid_request' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('assistant JEV revision policy', () => {
    it('requires revision for weak, unsupported, verbose, or clarification drafts', () => {
        expect(
            assessmentNeedsRevision({
                disposition: 'pass',
                helpfulness: 3,
                unsupportedClaim: 0.1,
                excessiveVerbosity: 0.1,
            }),
        ).toBe(false);
        expect(
            assessmentNeedsRevision({
                disposition: 'pass',
                helpfulness: 2,
                unsupportedClaim: 0.1,
                excessiveVerbosity: 0.1,
            }),
        ).toBe(true);
    });

    it('builds targeted revision instructions without asking for new tools', () => {
        const instruction = buildAssistantRevisionInstruction({
            disposition: 'clarify',
            helpfulness: 1.5,
            unsupportedClaim: 0.8,
            excessiveVerbosity: 0.8,
        });
        expect(instruction).toContain('jangan memanggil tool lagi');
        expect(instruction).toContain('Hapus klaim');
        expect(instruction).toContain('tepat satu pertanyaan klarifikasi');
    });
});

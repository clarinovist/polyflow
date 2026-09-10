import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const getDetail = vi.fn();
vi.mock('@/actions/admin/help-admin', () => ({
    getHelpConversationDetail: (...args: unknown[]) => getDetail(...args),
}));

import ConversationDetailPage from '../page';

describe('ConversationDetailPage', () => {
    it('renders ordered messages, safe tool metadata, and truncation notice', async () => {
        getDetail.mockResolvedValue({
            status: 'OK',
            data: {
                interaction: {
                    id: 'interaction-1',
                    question: 'Nilai berubah',
                    answerPreview: 'Mohon detail',
                    outcome: 'PARTIAL',
                    channel: 'web',
                    createdAt: new Date('2026-01-01T00:00:00Z'),
                    citedSlugs: ['panduan-nilai'],
                },
                conversation: {
                    id: 'conversation-1',
                    channel: 'web',
                    status: 'ACTIVE',
                    createdAt: new Date('2026-01-01T00:00:00Z'),
                    lastMessageAt: new Date('2026-01-01T00:01:00Z'),
                },
                messages: [
                    {
                        id: 'm1',
                        role: 'USER',
                        content: 'Pesan pengguna',
                        createdAt: new Date('2026-01-01T00:00:00Z'),
                        storageMayBeTruncated: false,
                    },
                    {
                        id: 'm2',
                        role: 'ASSISTANT',
                        content: 'Jawaban aman',
                        createdAt: new Date('2026-01-01T00:01:00Z'),
                        storageMayBeTruncated: true,
                    },
                ],
                tools: [
                    {
                        name: 'search_help_articles',
                        allowed: true,
                        outcome: 'SUCCESS',
                        createdAt: new Date('2026-01-01T00:00:30Z'),
                    },
                ],
                page: 1,
                limit: 50,
                total: 2,
            },
        });

        const html = renderToStaticMarkup(
            await ConversationDetailPage({
                params: Promise.resolve({ interactionId: 'interaction-1' }),
                searchParams: Promise.resolve({}),
            }),
        );
        expect(html.indexOf('Pesan pengguna')).toBeLessThan(
            html.indexOf('Jawaban aman'),
        );
        expect(html).toContain('search_help_articles');
        expect(html).toContain('mungkin terpotong');
        expect(html).toContain('tanpa payload mentah');
    });

    it('renders a generic unavailable state without internal errors', async () => {
        getDetail.mockResolvedValue({ status: 'UNAVAILABLE' });
        const html = renderToStaticMarkup(
            await ConversationDetailPage({
                params: Promise.resolve({ interactionId: 'interaction-1' }),
                searchParams: Promise.resolve({}),
            }),
        );
        expect(html).toContain('Thread tidak tersedia');
        expect(html).toContain('Tidak ada database lain');
    });
});

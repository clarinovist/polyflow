// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { PolyflowChatPanel } from '../polyflow-chat-panel';
import { PolyflowChatWidget } from '../polyflow-chat-widget';

let userId: string | null = 'user-1';
let pathname = '/finance/invoices/sales/inv-1';
vi.mock('next-auth/react', () => ({ useSession: () => ({
    status: userId ? 'authenticated' : 'unauthenticated',
    data: userId ? { user: { id: userId } } : null,
}) }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, asChild, variant: _variant, size: _size, ...props }:
        React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: string; size?: string }) =>
        asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} /> }));

function json(body: unknown, status = 200) { return { ok: status < 400, status, json: async () => body } as Response; }
function conversation(id = 'conv-1', canContinue = true, text = 'Jawaban tersimpan') {
    return { id, pathname, canContinue, nextOffset: null,
        messages: [{ id: 'q-1', role: 'user', text: 'Pertanyaan lama' }, { id: 'a-1', role: 'assistant', text }] };
}
let historyHandler: (url: URL) => Promise<Response>;
let chatHandler: (url: string) => Promise<Response>;
let fetchMock: MockInstance<typeof fetch>;
async function ready() { await waitFor(() => expect(screen.queryByText('Memuat riwayat…')).toBeNull()); }
async function ask() {
    await ready();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Periksa invoice ini' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
}
function renderPanel() { return render(<PolyflowChatPanel currentPath={pathname} contextualProfilesEnabled />); }

beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    userId = 'user-1';
    pathname = '/finance/invoices/sales/inv-1';
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1024,
    });
    Element.prototype.scrollIntoView = vi.fn();
    historyHandler = async () => json({ conversation: null });
    chatHandler = async (url) => url.endsWith('/stream')
        ? json({ error: 'stream unavailable' }, 500)
        : json({ success: true, data: { answer: 'Invoice sudah diperiksa.', conversationId: 'conv-1', historySaved: true } });
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        return url.startsWith('/api/chat/history') ? historyHandler(new URL(url, 'http://localhost')) : chatHandler(url);
    });
});

describe('PolyflowChatPanel persistent contextual history', () => {
    it('shows Finance and sends identical context to stream and JSON fallback', async () => {
        renderPanel();
        await ask();
        expect(await screen.findByText('Invoice sudah diperiksa.')).toBeTruthy();
        const calls = fetchMock.mock.calls.filter((call) => !String(call[0]).includes('/history'));
        expect(calls).toHaveLength(2);
        for (const call of calls) expect(JSON.parse(String(call[1]?.body)).workContext).toEqual({ pathname });
    });

    it('restores latest conversation after remount/login and continues with its ID', async () => {
        historyHandler = async () => json({ conversation: conversation() });
        const first = renderPanel();
        expect(await screen.findByText('Jawaban tersimpan')).toBeTruthy();
        first.unmount();
        renderPanel();
        expect(await screen.findByText('Jawaban tersimpan')).toBeTruthy();
        await ask();
        await screen.findByText('Invoice sudah diperiksa.');
        const call = fetchMock.mock.calls.find((call) => call[0] === '/api/chat');
        expect(JSON.parse(String(call?.[1]?.body)).conversationId).toBe('conv-1');
    });

    it('Chat baru clears thread explicitly but does not delete history', async () => {
        historyHandler = async () => json({ conversation: conversation() });
        renderPanel();
        await screen.findByText('Jawaban tersimpan');
        fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }));
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
        await ask();
        await screen.findByText('Invoice sudah diperiksa.');
        const call = fetchMock.mock.calls.find((call) => call[0] === '/api/chat');
        expect(JSON.parse(String(call?.[1]?.body)).conversationId).toBeUndefined();
        expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
    });

    it('lists paginated history and opens another context read-only', async () => {
        historyHandler = async (url) => {
            if (url.searchParams.get('mode') === 'list') return json({
                conversations: [{ id: url.searchParams.has('offset') ? 'conv-2' : 'conv-1', title: url.searchParams.has('offset') ? 'Chat kedua' : 'Chat pertama', profile: 'production', lastMessageAt: '2026-09-11T01:00:00Z', pathname: '/production/orders/order-1' }],
                nextOffset: url.searchParams.has('offset') ? null : 20,
            });
            if (url.searchParams.get('mode') === 'detail') return json({ conversation: { ...conversation('conv-2', false), pathname: '/production/orders/order-1' } });
            return json({ conversation: null });
        };
        renderPanel();
        await ready();
        fireEvent.click(screen.getByRole('button', { name: 'Riwayat chat' }));
        await screen.findByText('Chat pertama');
        fireEvent.click(screen.getByRole('button', { name: 'Riwayat lainnya' }));
        fireEvent.click(await screen.findByRole('button', { name: /Chat kedua/ }));
        expect(await screen.findByText('Jawaban tersimpan')).toBeTruthy();
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
        expect(screen.getByRole('link', { name: /Buka halaman asal/ }).getAttribute('href')).toBe('/production/orders/order-1');
        fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }));
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
    });

    it('loads older messages without duplicating existing IDs', async () => {
        historyHandler = async (url) => json({ conversation: url.searchParams.has('offset')
            ? { ...conversation(), messages: [{ id: 'old', role: 'user', text: 'Pesan terdahulu' }] }
            : { ...conversation(), nextOffset: 50 } });
        renderPanel();
        await screen.findByText('Jawaban tersimpan');
        fireEvent.click(screen.getByRole('button', { name: 'Pesan sebelumnya' }));
        expect(await screen.findByText('Pesan terdahulu')).toBeTruthy();
        expect(screen.getAllByText('Jawaban tersimpan')).toHaveLength(1);
    });

    it('shows read error with retry instead of silently claiming empty history', async () => {
        historyHandler = async () => json({ error: 'Riwayat gagal dimuat' }, 500);
        renderPanel();
        expect(await screen.findByRole('alert')).toBeTruthy();
        historyHandler = async () => json({ conversation: conversation() });
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(await screen.findByText('Jawaban tersimpan')).toBeTruthy();
    });

    it('does not let a late restore overwrite Chat baru', async () => {
        let resolve!: (value: Response) => void;
        historyHandler = () => new Promise((r) => { resolve = r; });
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }));
        await act(async () => resolve(json({ conversation: conversation() })));
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
    });

    it('does not let a late JSON response overwrite a new chat on the same path', async () => {
        let resolve!: (value: Response) => void;
        chatHandler = async (url) => url.endsWith('/stream') ? json({}, 500) : new Promise((r) => { resolve = r; });
        renderPanel();
        await ask();
        await waitFor(() => expect(resolve).toBeDefined());
        fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }));
        await act(async () => resolve(json({ success: true, data: { answer: 'Jawaban terlambat' } })));
        expect(screen.queryByText('Jawaban terlambat')).toBeNull();
    });

    it('discards stale history/answers across navigation and clears old draft', async () => {
        let resolve!: (value: Response) => void;
        historyHandler = () => new Promise((r) => { resolve = r; });
        const { rerender } = renderPanel();
        historyHandler = async () => json({ conversation: null });
        rerender(<PolyflowChatPanel currentPath="/production/orders/order-1" contextualProfilesEnabled />);
        await ready();
        await act(async () => resolve(json({ conversation: conversation() })));
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
        expect(screen.getByText(/Konteks berpindah ke/)).toBeTruthy();
    });

    it.each(['/', '/finance', '/production/orders'])('has a single compact welcome without question cards at %s', async (currentPath) => {
        render(<PolyflowChatPanel currentPath={currentPath} contextualProfilesEnabled />);
        await ready();
        expect(screen.queryByText(/contoh pertanyaan/i)).toBeNull();
        expect(screen.queryByRole('button', { name: /Periksa invoice|Stok barang|Apa yang perlu|SPK aktif/ })).toBeNull();
        expect(screen.getAllByText(/Ceritakan apa yang ingin/)).toHaveLength(1);
        expect(screen.getByRole('textbox')).toBeTruthy();
    });
    it('shows delivery status separately and retains useful clarification suggestions on JSON fallback', async () => {
        chatHandler = async (url) => url.endsWith('/stream') ? json({}, 500) : json({ success: true, data: {
            answer: 'Dugaan bug perlu diperiksa.', bugReportNotice: 'Telegram belum tersedia.', suggestions: ['Field mana yang berubah?'],
        } });
        renderPanel();
        await ask();
        expect(await screen.findByText('Telegram belum tersedia.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Field mana yang berubah?' })).toBeTruthy();
    });
    it('shows SSE delivery metadata without changing the diagnosis', async () => {
        chatHandler = async () => new Response('data: {"type":"done","data":{"answer":"Dugaan bug, belum terkonfirmasi.","bugReportNotice":"Notifikasi terkirim."}}\n\n');
        renderPanel();
        await ask();
        expect(await screen.findByText('Notifikasi terkirim.')).toBeTruthy();
        expect(screen.getByText('Dugaan bug, belum terkonfirmasi.')).toBeTruthy();
    });
    it('uses general profile when rollout is disabled', async () => {
        render(<PolyflowChatPanel currentPath={pathname} />);
        await ready();
        expect(screen.queryByRole('button', { name: 'Periksa invoice yang sedang saya buka' })).toBeNull();
    });

    it('clears private content at logout and account switch', async () => {
        historyHandler = async () => json({ conversation: conversation() });
        const { rerender } = renderPanel();
        await screen.findByText('Jawaban tersimpan');
        userId = null;
        rerender(<PolyflowChatPanel />);
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
        userId = 'user-2';
        historyHandler = async () => json({ conversation: null });
        rerender(<PolyflowChatPanel />);
        await ready();
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
    });

    it('ignores late SSE chunks after Chat baru and never falls back into old thread', async () => {
        let streamController!: ReadableStreamDefaultController<Uint8Array>;
        chatHandler = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } }), { status: 200 });
        renderPanel();
        await ask();
        await waitFor(() => expect(streamController).toBeDefined());
        await act(async () => streamController.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"Jawaban parsial"}\n\n')));
        expect(await screen.findByText('Jawaban parsial')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }));
        await act(async () => streamController.enqueue(new TextEncoder().encode('data: {"type":"done","data":{"answer":"SSE terlambat","conversationId":"old"}}\n\n')));
        expect(screen.queryByText('SSE terlambat')).toBeNull();
        expect(screen.queryByText('Jawaban parsial')).toBeNull();
        expect(fetchMock.mock.calls.some((call) => call[0] === '/api/chat')).toBe(false);
    });

    it('restores current-context messages after navigating back', async () => {
        historyHandler = async (url) => json({ conversation: url.searchParams.get('pathname') === pathname ? conversation() : null });
        const { rerender } = renderPanel();
        await screen.findByText('Jawaban tersimpan');
        rerender(<PolyflowChatPanel currentPath="/production/orders/order-1" contextualProfilesEnabled />);
        await ready();
        expect(screen.queryByText('Jawaban tersimpan')).toBeNull();
        rerender(<PolyflowChatPanel currentPath={pathname} contextualProfilesEnabled />);
        expect(await screen.findByText('Jawaban tersimpan')).toBeTruthy();
    });

    it('warns if the server could not save a visible reply', async () => {
        chatHandler = async (url) => url.endsWith('/stream') ? json({}, 500) : json({ success: true, data: { answer: 'Jawaban lokal', historySaved: false } });
        renderPanel();
        await ask();
        expect(await screen.findByText(/Jawaban ini belum tersimpan/)).toBeTruthy();
    });
});

describe('PolyflowChatWidget collision protection and minimize', () => {
    it('reserves a bounded desktop safe area without inspecting page actions', () => {
        const globalCss = readFileSync('src/app/globals.css', 'utf8');
        expect(globalCss).toMatch(
            /@media \(min-width: 64rem\) \{[\s\S]*?body:has\(\[data-desktop-safe-area\]\) main::after/,
        );
        expect(globalCss).not.toMatch(
            /body:has\(\[data-polyflow-chat-fab\]\) main::after/,
        );

        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1440,
        });
        const mutationObserver = vi.fn();
        const resizeObserver = vi.fn();
        vi.stubGlobal('MutationObserver', mutationObserver);
        vi.stubGlobal('ResizeObserver', resizeObserver);

        render(
            <>
                <main>
                    {Array.from({ length: 2_000 }, (_, index) => (
                        <button
                            key={index}
                            data-testid={index === 1_999 ? 'bottom-right-action' : undefined}
                            style={index < 1_999 ? { position: 'absolute', top: -10_000 } : undefined}
                        >
                            Action {index}
                        </button>
                    ))}
                </main>
                <PolyflowChatWidget />
            </>,
        );

        const trigger = screen.getByRole('button', {
            name: 'Buka Asisten Polyflow',
        });
        const root = trigger.parentElement;
        expect(root?.dataset.desktopSafeArea).toBe('');
        expect(root?.className).toContain('bottom-5');
        expect(root?.className).toContain('right-5');
        expect(root?.className).toContain('z-50');
        expect(mutationObserver).not.toHaveBeenCalled();
        expect(resizeObserver).not.toHaveBeenCalled();

        const bottomRightAction = screen.getByTestId('bottom-right-action');
        const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
        const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
        act(() => {
            for (let index = 0; index < 100; index += 1) {
                window.dispatchEvent(new Event('scroll'));
                window.dispatchEvent(new Event('resize'));
            }
            bottomRightAction.setAttribute('data-repeated-mutation', '100');
        });

        expect(querySelectorAll).not.toHaveBeenCalled();
        expect(measure).not.toHaveBeenCalled();
        expect(root?.dataset.desktopSafeArea).toBe('');
    });

    it.each([
        '/warehouse/mobile/receipts',
        '/sales/mobile/orders',
        '/production/mobile/tasks',
        '/finance/mobile/tasks',
        '/purchasing/mobile/tasks',
        '/hrd/mobile/tasks',
    ])('preserves the mobile bottom-nav layout without a main spacer at %s', (mobilePath) => {
        pathname = mobilePath;
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 390,
        });

        render(<PolyflowChatWidget />);

        const root = screen.getByRole('button', {
            name: 'Buka Asisten Polyflow',
        }).parentElement;
        expect(root?.className).toContain('bottom-20');
        expect(root?.style.bottom).toBe('');
        expect(root?.getAttribute('data-polyflow-chat-fab')).toBe('');
        expect(root?.hasAttribute('data-desktop-safe-area')).toBe(false);
    });

    it('retains conversation and draft, preserves events, and restores focus on Escape', async () => {
        historyHandler = async () => json({ conversation: conversation() });
        const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
        render(<PolyflowChatWidget contextualProfilesEnabled />);
        fireEvent.click(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
        expect(
            dispatchEvent.mock.calls.some(
                ([event]) => event.type === 'polyflow-assistant-open',
            ),
        ).toBe(true);
        await screen.findByText('Jawaban tersimpan');
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draf belum dikirim' } });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(
            dispatchEvent.mock.calls.some(
                ([event]) => event.type === 'polyflow-assistant-close',
            ),
        ).toBe(true);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
        fireEvent.click(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draf belum dikirim');
        expect(screen.getByText('Jawaban tersimpan')).toBeTruthy();
        expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/history'))).toHaveLength(1);
    });

    it('finishes a pending reply while minimized and outside click closes without reset', async () => {
        let resolve!: (value: Response) => void;
        chatHandler = async (url) => url.endsWith('/stream') ? json({}, 500) : new Promise((r) => { resolve = r; });
        render(<PolyflowChatWidget contextualProfilesEnabled />);
        fireEvent.click(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
        await ask();
        await waitFor(() => expect(resolve).toBeDefined());
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => resolve(json({ success: true, data: { answer: 'Selesai di latar' } })));
        fireEvent.click(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
        expect(await screen.findByText('Selesai di latar')).toBeTruthy();
    });
});

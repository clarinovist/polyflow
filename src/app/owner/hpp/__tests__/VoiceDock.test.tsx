// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import { voiceCommandSchema } from '@/lib/owner-hpp/voice-commands';

const mocks = vi.hoisted(() => ({
    parse: vi.fn(),
    toastError: vi.fn(),
    hold: {
        state: 'idle',
        message: '',
        secondsLeft: 30,
        willCancel: false,
        onAudio: null as null | ((audio: Blob) => Promise<void>),
    },
    transcribe: vi.fn(),
}));

vi.mock('@/actions/owner-hpp/owner-hpp-voice', () => ({ parseOwnerHppVoice: mocks.parse }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('../voice-client', () => ({ requestTranscription: mocks.transcribe }));
vi.mock('../useHoldToRecord', () => ({
    useHoldToRecord: (options: { onAudio: (audio: Blob) => Promise<void> }) => {
        mocks.hold.onAudio = options.onAudio;
        return { ...mocks.hold, handlers: {} };
    },
}));

import { VoiceDock } from '../VoiceDock';

const priceCommand = voiceCommandSchema.parse({ op: 'set_sell_price', price: 21000, heard: 'dua puluh satu ribu' });

function renderDock(onApply = vi.fn().mockReturnValue(true)) {
    render(<VoiceDock scenario={chainScenario()} activeStageId="ext" onApply={onApply} />);
    return onApply;
}

function openTyping() {
    fireEvent.click(screen.getByRole('button', { name: 'Ketik perintah' }));
}

function type(text: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Transkrip perintah' }), { target: { value: text } });
}

describe('VoiceDock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks.hold, { state: 'idle', message: '', secondsLeft: 30, willCancel: false });
        mocks.parse.mockResolvedValue({ success: true, data: { commands: [priceCommand], warnings: [] } });
    });
    afterEach(cleanup);

    it('keeps the sheet closed until asked and offers a push-to-talk button', () => {
        renderDock();

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', { name: 'Tahan untuk bicara' })).toBeTruthy();
    });

    it('disables Proses while the transcript is empty', () => {
        renderDock();
        openTyping();

        expect((screen.getByRole('button', { name: 'Proses' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('processes the edited transcript, previews it and applies only on Terapkan', async () => {
        const onApply = renderDock();
        openTyping();
        type('harga jual dua puluh satu ribu');

        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));
        await screen.findByRole('region', { name: 'Pratinjau perubahan' });

        expect(mocks.parse).toHaveBeenCalledWith('harga jual dua puluh satu ribu', expect.objectContaining({ stages: expect.any(Array) }));
        expect(screen.getByText(/Harga jual/)).toBeTruthy();
        expect(onApply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Terapkan/ }));
        expect(onApply).toHaveBeenCalledWith([priceCommand]);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the preview open when the workspace rejects the change', async () => {
        const onApply = renderDock(vi.fn().mockReturnValue(false));
        openTyping();
        type('harga jual dua puluh satu ribu');
        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));
        await screen.findByRole('region', { name: 'Pratinjau perubahan' });

        fireEvent.click(screen.getByRole('button', { name: /Terapkan/ }));

        expect(onApply).toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('shows server warnings in the preview', async () => {
        mocks.parse.mockResolvedValue({ success: true, data: { commands: [], warnings: ['Perintah dilewati: angka 5 tidak ada di ucapan.'] } });
        renderDock();
        openTyping();
        type('sesuatu');

        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));

        expect((await screen.findByRole('list', { name: 'Peringatan' })).textContent).toContain('tidak ada di ucapan');
    });

    it('toasts the error when the action fails and keeps the transcript', async () => {
        mocks.parse.mockResolvedValue({ success: false, error: 'Gagal memproses, coba lagi atau ketik manual.' });
        renderDock();
        openTyping();
        type('sesuatu');

        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Gagal memproses, coba lagi atau ketik manual.'));
        expect((screen.getByRole('textbox', { name: 'Transkrip perintah' }) as HTMLTextAreaElement).value).toBe('sesuatu');
    });

    it('toasts a friendly message when the action throws', async () => {
        mocks.parse.mockRejectedValue(new Error('network'));
        renderDock();
        openTyping();
        type('sesuatu');

        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Gagal memproses, coba lagi atau ketik manual.'));
    });

    it('puts a recorded transcript in the editable box, appending to earlier text', async () => {
        mocks.transcribe.mockResolvedValue('tambah benang');
        renderDock();
        openTyping();
        type('halo');

        await waitFor(() => expect(mocks.hold.onAudio).not.toBeNull());
        await mocks.hold.onAudio?.(new Blob(['x']));

        await waitFor(() =>
            expect((screen.getByRole('textbox', { name: 'Transkrip perintah' }) as HTMLTextAreaElement).value).toBe('halo tambah benang'),
        );
    });

    it('opens the sheet by itself after a recording', async () => {
        mocks.transcribe.mockResolvedValue('hapus listrik');
        renderDock();

        await waitFor(() => expect(mocks.hold.onAudio).not.toBeNull());
        await mocks.hold.onAudio?.(new Blob(['x']));

        expect(await screen.findByRole('dialog')).toBeTruthy();
    });

    it('drops a stale preview when the transcript is edited', async () => {
        renderDock();
        openTyping();
        type('harga jual dua puluh satu ribu');
        fireEvent.click(screen.getByRole('button', { name: 'Proses' }));
        await screen.findByRole('region', { name: 'Pratinjau perubahan' });

        type('harga jual dua puluh dua ribu');

        expect(screen.queryByRole('region', { name: 'Pratinjau perubahan' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Proses' })).toBeTruthy();
    });

    it('closes the sheet and discards the preview from the close button', async () => {
        renderDock();
        openTyping();

        fireEvent.click(screen.getByRole('button', { name: 'Tutup perintah suara' }));

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the recording countdown and hint messages from the hook', () => {
        Object.assign(mocks.hold, { state: 'recording', secondsLeft: 12, message: 'Tahan untuk bicara.' });
        renderDock();

        expect(screen.getByText(/Merekam… 12 dtk/)).toBeTruthy();
        expect(screen.getByText('Tahan untuk bicara.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Lepas untuk selesai' })).toBeTruthy();
    });

    it('tells the owner how to cancel while the finger is outside the button', () => {
        Object.assign(mocks.hold, { state: 'recording', willCancel: true });
        renderDock();

        expect(screen.getByRole('button', { name: 'Lepas di luar tombol untuk batal' })).toBeTruthy();
    });

    it('disables the mic button while transcribing', () => {
        mocks.hold.state = 'transcribing';
        renderDock();

        expect((screen.getByRole('button', { name: 'Mendengarkan…' }) as HTMLButtonElement).disabled).toBe(true);
    });
});

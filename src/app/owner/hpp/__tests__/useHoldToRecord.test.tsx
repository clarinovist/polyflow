// @vitest-environment jsdom

import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import {
    HOLD_MESSAGES,
    pickRecorderMime,
    RECORDER_MIME_CANDIDATES,
    useHoldToRecord,
} from '../useHoldToRecord';

class FakeRecorder {
    static supported = new Set<string>(['audio/mp4']);
    static last: FakeRecorder | null = null;
    static chunkSize = 1000;
    static isTypeSupported(mime: string) {
        return FakeRecorder.supported.has(mime);
    }
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(
        public stream: unknown,
        options?: { mimeType?: string },
    ) {
        this.mimeType = options?.mimeType ?? '';
        FakeRecorder.last = this;
    }
    start() {
        this.state = 'recording';
    }
    stop() {
        this.state = 'inactive';
        if (FakeRecorder.chunkSize > 0) {
            this.ondataavailable?.({ data: new Blob([new Uint8Array(FakeRecorder.chunkSize)]) });
        }
        this.onstop?.();
    }
}

const stopTrack = vi.fn();
const getUserMedia = vi.fn();
const onAudio = vi.fn();

function Harness() {
    const hold = useHoldToRecord({ onAudio });
    return (
        <div>
            <button type="button" data-testid="mic" {...hold.handlers}>mic</button>
            <output data-testid="state">{hold.state}</output>
            <output data-testid="message">{hold.message}</output>
            <output data-testid="seconds">{hold.secondsLeft}</output>
            <output data-testid="cancel">{String(hold.willCancel)}</output>
        </div>
    );
}

const mic = () => screen.getByTestId('mic');
const state = () => screen.getByTestId('state').textContent;
const message = () => screen.getByTestId('message').textContent;

async function press() {
    await act(async () => {
        fireEvent.pointerDown(mic(), { pointerId: 1, clientX: 5, clientY: 5 });
    });
}

async function lift() {
    await act(async () => {
        fireEvent.pointerUp(mic(), { pointerId: 1 });
    });
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe('pickRecorderMime', () => {
    it('returns the first supported candidate in order', () => {
        expect(pickRecorderMime(() => true)).toBe(RECORDER_MIME_CANDIDATES[0]);
        expect(pickRecorderMime((m) => m === 'audio/webm')).toBe('audio/webm');
        expect(pickRecorderMime(() => false)).toBeUndefined();
    });
});

describe('useHoldToRecord', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        FakeRecorder.supported = new Set(['audio/mp4']);
        FakeRecorder.chunkSize = 1000;
        FakeRecorder.last = null;
        onAudio.mockResolvedValue(undefined);
        getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('records while held and hands the audio over on release', async () => {
        render(<Harness />);

        await press();
        expect(state()).toBe('recording');
        expect(FakeRecorder.last?.mimeType).toBe('audio/mp4');
        await advance(VOICE_LIMITS.minHoldMs + 200);
        await lift();

        expect(onAudio).toHaveBeenCalledTimes(1);
        const audio = onAudio.mock.calls[0][0] as Blob;
        expect(audio.size).toBe(1000);
        expect(audio.type).toBe('audio/mp4');
        expect(state()).toBe('idle');
        expect(stopTrack).toHaveBeenCalled();
    });

    it('shows the transcribing state while the audio is being processed', async () => {
        let finish: () => void = () => {};
        onAudio.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
        render(<Harness />);

        await press();
        await advance(500);
        await lift();
        expect(state()).toBe('transcribing');
        await act(async () => { finish(); });

        expect(state()).toBe('idle');
    });

    it('ignores a short tap with a hint and sends nothing', async () => {
        render(<Harness />);

        await press();
        await advance(50);
        await lift();

        expect(onAudio).not.toHaveBeenCalled();
        expect(state()).toBe('idle');
        expect(message()).toBe(HOLD_MESSAGES.tooShort);
    });

    it('cancels when the pointer slides out of the button', async () => {
        render(<Harness />);
        vi.spyOn(mic(), 'getBoundingClientRect').mockReturnValue({
            left: 0, right: 50, top: 0, bottom: 50, width: 50, height: 50, x: 0, y: 0, toJSON: () => ({}),
        });

        await press();
        await advance(500);
        await act(async () => { fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 200, clientY: 200 }); });
        expect(screen.getByTestId('cancel').textContent).toBe('true');
        await lift();

        expect(onAudio).not.toHaveBeenCalled();
        expect(message()).toBe(HOLD_MESSAGES.cancelled);
    });

    it('keeps recording when the pointer moves but stays inside', async () => {
        render(<Harness />);
        vi.spyOn(mic(), 'getBoundingClientRect').mockReturnValue({
            left: 0, right: 50, top: 0, bottom: 50, width: 50, height: 50, x: 0, y: 0, toJSON: () => ({}),
        });

        await press();
        await act(async () => { fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 10, clientY: 10 }); });

        expect(screen.getByTestId('cancel').textContent).toBe('false');
        expect(state()).toBe('recording');
    });

    it.each(['pointerCancel', 'lostPointerCapture'] as const)('stops on %s', async (name) => {
        render(<Harness />);

        await press();
        await advance(500);
        await act(async () => { fireEvent[name](mic(), { pointerId: 1 }); });

        expect(onAudio).toHaveBeenCalledTimes(1);
    });

    it('stops by itself at the maximum duration and counts down', async () => {
        render(<Harness />);

        await press();
        await advance(VOICE_LIMITS.maxRecordMs / 2);
        expect(Number(screen.getByTestId('seconds').textContent)).toBeLessThan(VOICE_LIMITS.maxRecordMs / 1000);
        await advance(VOICE_LIMITS.maxRecordMs / 2 + 10);

        expect(onAudio).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty recording', async () => {
        FakeRecorder.chunkSize = 0;
        render(<Harness />);

        await press();
        await advance(500);
        await lift();

        expect(onAudio).not.toHaveBeenCalled();
        expect(state()).toBe('error');
        expect(message()).toBe(HOLD_MESSAGES.empty);
    });

    it('shows the failure message from the audio handler', async () => {
        onAudio.mockRejectedValue(new Error('Gagal mendengar.'));
        render(<Harness />);

        await press();
        await advance(500);
        await lift();

        expect(state()).toBe('error');
        expect(message()).toBe('Gagal mendengar.');
    });

    it('falls back to a generic message for a non-Error rejection', async () => {
        onAudio.mockRejectedValue('x');
        render(<Harness />);

        await press();
        await advance(500);
        await lift();

        expect(message()).toBe(HOLD_MESSAGES.generic);
    });

    it.each([
        ['NotAllowedError', HOLD_MESSAGES.denied],
        ['NotFoundError', HOLD_MESSAGES.noDevice],
        ['AbortError', HOLD_MESSAGES.generic],
    ])('maps a %s microphone error to a clear message', async (name, expected) => {
        getUserMedia.mockRejectedValue(Object.assign(new Error('x'), { name }));
        render(<Harness />);

        await press();

        expect(state()).toBe('error');
        expect(message()).toBe(expected);
        expect(onAudio).not.toHaveBeenCalled();
    });

    it('treats a lift before the microphone is ready as the permission step', async () => {
        let grant: (stream: unknown) => void = () => {};
        getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
        render(<Harness />);

        await press();
        await lift();
        await act(async () => { grant({ getTracks: () => [{ stop: stopTrack }] }); });

        expect(state()).toBe('idle');
        expect(message()).toBe(HOLD_MESSAGES.permissionReady);
        expect(stopTrack).toHaveBeenCalled();
        expect(FakeRecorder.last).toBeNull();
    });

    it('reports unsupported when MediaRecorder is missing', async () => {
        vi.stubGlobal('MediaRecorder', undefined);
        render(<Harness />);

        await press();

        expect(state()).toBe('unsupported');
        expect(message()).toBe(HOLD_MESSAGES.unsupported);
        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('reports unsupported when there is no microphone API', async () => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
        render(<Harness />);

        await press();

        expect(state()).toBe('unsupported');
    });

    it('blocks the context menu on the button', () => {
        render(<Harness />);

        const notPrevented = fireEvent.contextMenu(mic());

        expect(notPrevented).toBe(false);
    });

    it('ignores a second press while transcribing', async () => {
        onAudio.mockReturnValue(new Promise(() => {}));
        render(<Harness />);

        await press();
        await advance(500);
        await lift();
        await press();

        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('releases the microphone when unmounted mid-recording', async () => {
        const view = render(<Harness />);

        await press();
        view.unmount();

        expect(stopTrack).toHaveBeenCalled();
        expect(onAudio).not.toHaveBeenCalled();
    });

    it('falls back to the default mime when the browser supports none of the candidates', async () => {
        FakeRecorder.supported = new Set();
        render(<Harness />);

        await press();
        await advance(500);
        await lift();

        expect((onAudio.mock.calls[0][0] as Blob).type).toBe('audio/mp4');
    });
});

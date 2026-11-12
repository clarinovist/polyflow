'use client';

import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from 'react';

export type HoldState =
    | 'idle'
    | 'recording'
    | 'transcribing'
    | 'error'
    | 'unsupported';

/** Tried in order; the first one the browser can record is used as-is. */
export const RECORDER_MIME_CANDIDATES = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
] as const;

export const HOLD_MESSAGES = {
    tooShort: 'Tahan untuk bicara.',
    permissionReady: 'Mikrofon siap. Tahan tombol lagi untuk bicara.',
    cancelled: 'Dibatalkan.',
    empty: 'Rekaman kosong, coba lagi.',
    unsupported: 'Perekam suara tidak tersedia di browser ini. Ketik manual.',
    denied: 'Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan browser.',
    noDevice: 'Mikrofon tidak ditemukan.',
    generic: 'Gagal merekam, coba lagi atau ketik manual.',
} as const;

const COUNTDOWN_TICK_MS = 250;
const MS_PER_SECOND = 1000;

export function pickRecorderMime(
    isSupported: (mime: string) => boolean,
): string | undefined {
    return RECORDER_MIME_CANDIDATES.find((mime) => isSupported(mime));
}

function micErrorMessage(error: unknown): string {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return HOLD_MESSAGES.denied;
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return HOLD_MESSAGES.noDevice;
    }
    return HOLD_MESSAGES.generic;
}

function stopTracks(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
}

function isInsideButton(event: ReactPointerEvent<HTMLElement>): boolean {
    const rect = event.currentTarget.getBoundingClientRect();
    return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
    );
}

interface Session {
    stream: MediaStream | null;
    recorder: MediaRecorder | null;
    chunks: Blob[];
    startedAt: number;
    /** Finger lifted (or aborted) before the microphone was ready. */
    isReleased: boolean;
    isFinished: boolean;
    isCancelled: boolean;
    maxTimer: ReturnType<typeof setTimeout> | null;
    tick: ReturnType<typeof setInterval> | null;
}

function newSession(): Session {
    return {
        stream: null,
        recorder: null,
        chunks: [],
        startedAt: 0,
        isReleased: false,
        isFinished: false,
        isCancelled: false,
        maxTimer: null,
        tick: null,
    };
}

function clearTimers(session: Session) {
    if (session.maxTimer) clearTimeout(session.maxTimer);
    if (session.tick) clearInterval(session.tick);
    session.maxTimer = null;
    session.tick = null;
}

interface HoldOptions {
    /** Receives the finished recording (sent as-is, no conversion). */
    onAudio: (audio: Blob) => Promise<void>;
}

export function useHoldToRecord({ onAudio }: HoldOptions) {
    const [state, setState] = useState<HoldState>('idle');
    const [message, setMessage] = useState('');
    const [secondsLeft, setSecondsLeft] = useState(
        VOICE_LIMITS.maxRecordMs / MS_PER_SECOND,
    );
    const [willCancel, setWillCancel] = useState(false);
    const sessionRef = useRef<Session | null>(null);
    const willCancelRef = useRef(false);
    const isMountedRef = useRef(true);
    const onAudioRef = useRef(onAudio);

    useEffect(() => {
        onAudioRef.current = onAudio;
    }, [onAudio]);

    const settle = useCallback((next: HoldState, text = '') => {
        if (!isMountedRef.current) return;
        setState(next);
        setMessage(text);
        setWillCancel(false);
        willCancelRef.current = false;
    }, []);

    const deliver = useCallback(
        async (session: Session) => {
            const type = session.recorder?.mimeType || 'audio/mp4';
            const audio = new Blob(session.chunks, { type });
            if (audio.size === 0) {
                settle('error', HOLD_MESSAGES.empty);
                return;
            }
            settle('transcribing');
            try {
                await onAudioRef.current(audio);
                settle('idle');
            } catch (error) {
                const text =
                    error instanceof Error && error.message
                        ? error.message
                        : HOLD_MESSAGES.generic;
                settle('error', text);
            }
        },
        [settle],
    );

    const handleStopped = useCallback(
        (session: Session) => {
            stopTracks(session.stream);
            session.stream = null;
            if (session.isCancelled) {
                settle('idle', HOLD_MESSAGES.cancelled);
                return;
            }
            const heldMs = Date.now() - session.startedAt;
            if (heldMs < VOICE_LIMITS.minHoldMs) {
                settle('idle', HOLD_MESSAGES.tooShort);
                return;
            }
            void deliver(session);
        },
        [deliver, settle],
    );

    const finish = useCallback((cancel: boolean) => {
        const session = sessionRef.current;
        if (!session || session.isFinished) return;
        session.isFinished = true;
        session.isCancelled = cancel;
        session.isReleased = true;
        clearTimers(session);
        if (session.recorder && session.recorder.state !== 'inactive') {
            session.recorder.stop();
        }
    }, []);

    const startRecorder = useCallback(
        (session: Session, stream: MediaStream) => {
            session.stream = stream;
            const mime = pickRecorderMime((candidate) =>
                MediaRecorder.isTypeSupported(candidate),
            );
            const recorder = new MediaRecorder(
                stream,
                mime ? { mimeType: mime } : undefined,
            );
            session.recorder = recorder;
            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) session.chunks.push(event.data);
            };
            recorder.onstop = () => handleStopped(session);
            session.startedAt = Date.now();
            recorder.start();
            setSecondsLeft(VOICE_LIMITS.maxRecordMs / MS_PER_SECOND);
            session.maxTimer = setTimeout(
                () => finish(false),
                VOICE_LIMITS.maxRecordMs,
            );
            session.tick = setInterval(() => {
                const left =
                    VOICE_LIMITS.maxRecordMs - (Date.now() - session.startedAt);
                setSecondsLeft(Math.max(0, Math.ceil(left / MS_PER_SECOND)));
            }, COUNTDOWN_TICK_MS);
        },
        [finish, handleStopped],
    );

    const onStream = useCallback(
        (session: Session, stream: MediaStream) => {
            if (session.isFinished || session.isReleased) {
                stopTracks(stream);
                session.isFinished = true;
                settle('idle', HOLD_MESSAGES.permissionReady);
                return;
            }
            try {
                startRecorder(session, stream);
            } catch {
                stopTracks(stream);
                session.isFinished = true;
                settle('error', HOLD_MESSAGES.generic);
            }
        },
        [settle, startRecorder],
    );

    const begin = useCallback(() => {
        const session = newSession();
        sessionRef.current = session;
        settle('recording');
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => onStream(session, stream))
            .catch((error: unknown) => {
                session.isFinished = true;
                clearTimers(session);
                settle('error', micErrorMessage(error));
            });
    }, [onStream, settle]);

    const isSupported = useCallback((): boolean => {
        return (
            typeof MediaRecorder !== 'undefined' &&
            Boolean(navigator.mediaDevices?.getUserMedia)
        );
    }, []);

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (state === 'recording' || state === 'transcribing') return;
            if (!isSupported()) {
                settle('unsupported', HOLD_MESSAGES.unsupported);
                return;
            }
            try {
                event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch {
                // Capture is best effort; the lift events still reach the button.
            }
            begin();
        },
        [begin, isSupported, settle, state],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (state !== 'recording') return;
            const outside = !isInsideButton(event);
            if (outside === willCancelRef.current) return;
            willCancelRef.current = outside;
            setWillCancel(outside);
        },
        [state],
    );

    const release = useCallback(() => {
        const session = sessionRef.current;
        if (!session || session.isFinished) return;
        session.isReleased = true;
        finish(willCancelRef.current);
    }, [finish]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            const session = sessionRef.current;
            if (!session) return;
            session.isFinished = true;
            clearTimers(session);
            if (session.recorder) session.recorder.onstop = null;
            if (session.recorder?.state === 'recording')
                session.recorder.stop();
            stopTracks(session.stream);
        };
    }, []);

    const handlers = useMemo(
        () => ({
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: release,
            onPointerCancel: release,
            onLostPointerCapture: release,
            onContextMenu: (event: { preventDefault: () => void }) =>
                event.preventDefault(),
        }),
        [handlePointerDown, handlePointerMove, release],
    );

    return { state, message, secondsLeft, willCancel, handlers };
}

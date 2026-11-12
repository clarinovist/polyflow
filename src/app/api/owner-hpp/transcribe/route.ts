import { requireOwnerHppAccess } from '@/lib/auth/owner-hpp-access';
import { withTenantRoute } from '@/lib/core/tenant';
import { ApplicationError, isNextControlFlowError } from '@/lib/errors/errors';
import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import {
    buildSttPrompt,
    voiceContextSchema,
    type VoiceContext,
} from '@/lib/owner-hpp/voice-prompt';
import {
    readSttConfig,
    STT_MESSAGES,
    transcribeAudio,
    validateAudio,
} from '@/lib/owner-hpp/voice-stt';
import type { NextRequest } from 'next/server';

// Server Actions stop at a 1 MB body by default and the recording may reach
// 1.5 MB, so audio comes in through a route handler. Raising the global limit
// would touch build config shared by the whole app.

const MULTIPART_OVERHEAD_BYTES = 20_000;
const MAX_BODY_BYTES = VOICE_LIMITS.maxAudioBytes + MULTIPART_OVERHEAD_BYTES;
const STATUS_UNAUTHORIZED = 401;
const STATUS_BAD_REQUEST = 400;
const STATUS_TOO_LARGE = 413;
const STATUS_BAD_GATEWAY = 502;
const STATUS_UNAVAILABLE = 503;

const SESSION_ENDED = 'Sesi berakhir, muat ulang halaman.';
const BAD_FORM = 'Rekaman tidak terbaca.';
const GENERIC_DENIED = 'Halaman ini tidak tersedia untuk akun Anda.';

function failure(error: string, status: number, code: string): Response {
    return Response.json({ success: false, error, code }, { status });
}

/** The guard may redirect (no session) or throw a typed error; both become JSON. */
function guardFailure(error: unknown): Response {
    if (isNextControlFlowError(error)) {
        return failure(
            SESSION_ENDED,
            STATUS_UNAUTHORIZED,
            'AUTHENTICATION_ERROR',
        );
    }
    if (error instanceof ApplicationError) {
        return failure(error.message, error.statusCode, error.code);
    }
    return failure(GENERIC_DENIED, STATUS_UNAUTHORIZED, 'AUTHORIZATION_ERROR');
}

function isOversized(request: NextRequest): boolean {
    const declared = Number(request.headers.get('content-length'));
    return Number.isFinite(declared) && declared > MAX_BODY_BYTES;
}

function readContext(value: FormDataEntryValue | null): VoiceContext | null {
    if (typeof value !== 'string') return null;
    try {
        const parsed = voiceContextSchema.safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

async function readForm(request: NextRequest): Promise<FormData | null> {
    try {
        return await request.formData();
    } catch {
        return null;
    }
}

export const POST = withTenantRoute(async function POST(request: NextRequest) {
    try {
        await requireOwnerHppAccess();
    } catch (error) {
        return guardFailure(error);
    }

    const config = readSttConfig(process.env);
    if (!config) {
        return failure(
            STT_MESSAGES.notConfigured,
            STATUS_UNAVAILABLE,
            'STT_NOT_CONFIGURED',
        );
    }
    if (isOversized(request)) {
        return failure(
            STT_MESSAGES.tooLarge,
            STATUS_TOO_LARGE,
            'AUDIO_TOO_LARGE',
        );
    }

    const form = await readForm(request);
    const file = form?.get('file');
    if (!form || !(file instanceof Blob)) {
        return failure(BAD_FORM, STATUS_BAD_REQUEST, 'BAD_REQUEST');
    }
    const check = validateAudio(file);
    if (!check.ok) {
        return failure(check.error, STATUS_BAD_REQUEST, 'INVALID_AUDIO');
    }

    const result = await transcribeAudio({
        audio: file,
        config,
        prompt: buildSttPrompt(readContext(form.get('context'))),
    });
    if (!result.ok) {
        return failure(result.error, STATUS_BAD_GATEWAY, 'STT_FAILED');
    }
    return Response.json({ success: true, data: { text: result.text } });
});

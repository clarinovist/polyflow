'use server';

import { requireOwnerHppAccess } from '@/lib/auth/owner-hpp-access';
import { withTenant } from '@/lib/core/tenant';
import {
    ApplicationError,
    safeAction,
    ValidationError,
} from '@/lib/errors/errors';
import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import {
    LLM_MESSAGES,
    readLlmConfig,
    requestVoiceCompletion,
} from '@/lib/owner-hpp/voice-llm';
import {
    buildSystemPrompt,
    buildUserMessage,
    parseVoiceResponse,
    voiceContextSchema,
} from '@/lib/owner-hpp/voice-prompt';
import { verifyCommandNumbers } from '@/lib/owner-hpp/voice-verify';

const VOICE_FAILED_CODE = 'VOICE_PARSE_FAILED';
const VOICE_FAILED_STATUS = 502;

function voiceFailure(message: string): ApplicationError {
    return new ApplicationError(
        message,
        VOICE_FAILED_CODE,
        VOICE_FAILED_STATUS,
    );
}

function readTranscript(value: unknown): string {
    if (typeof value !== 'string') {
        throw new ValidationError('Transkrip tidak valid.');
    }
    const transcript = value.trim();
    if (!transcript) throw new ValidationError('Transkrip masih kosong.');
    if (transcript.length > VOICE_LIMITS.maxTranscriptLength) {
        throw new ValidationError(
            `Transkrip terlalu panjang (maksimal ${VOICE_LIMITS.maxTranscriptLength} karakter).`,
        );
    }
    return transcript;
}

// The guard runs first: the edge lets /owner through unauthenticated.

export const parseOwnerHppVoice = withTenant(async function parseOwnerHppVoice(
    transcriptInput: unknown,
    contextInput: unknown,
) {
    return safeAction(async () => {
        await requireOwnerHppAccess();
        const transcript = readTranscript(transcriptInput);
        const context = voiceContextSchema.safeParse(contextInput);
        if (!context.success) {
            throw new ValidationError('Konteks tahap tidak valid.');
        }
        const config = readLlmConfig(process.env);
        if (!config) throw voiceFailure(LLM_MESSAGES.notConfigured);

        const completion = await requestVoiceCompletion({
            config,
            system: buildSystemPrompt(),
            user: buildUserMessage(transcript, context.data),
        });
        if (!completion.ok) throw voiceFailure(completion.error);

        const parsed = parseVoiceResponse(completion.content);
        if (!parsed.success) throw voiceFailure(LLM_MESSAGES.failed);

        return verifyCommandNumbers(parsed.commands, transcript);
    });
});

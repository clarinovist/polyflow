import { formatDecimal } from './number-input';
import { commandNumbers, type VoiceCommand } from './voice-commands';
import { extractNumbers, isSpokenNumber } from './voice-numbers';

export interface VerifiedCommands {
    commands: VoiceCommand[];
    warnings: string[];
}

function unspokenNumber(
    command: VoiceCommand,
    spoken: readonly number[],
): number | null {
    const missing = commandNumbers(command).find(
        ({ value }) => !isSpokenNumber(value, spoken),
    );
    return missing ? missing.value : null;
}

function skipWarning(command: VoiceCommand, value: number): string {
    const heard = command.heard ? ` (terdengar: "${command.heard}")` : '';
    return `Perintah dilewati: angka ${formatDecimal(value, 6)} tidak ada di ucapan${heard}.`;
}

/**
 * Model output is never trusted blindly: every number in a command must equal a
 * number found in the transcript. A command that fails is skipped, not applied.
 */
export function verifyCommandNumbers(
    commands: readonly VoiceCommand[],
    transcript: string,
): VerifiedCommands {
    const spoken = extractNumbers(transcript);
    const accepted: VoiceCommand[] = [];
    const warnings: string[] = [];
    for (const command of commands) {
        const missing = unspokenNumber(command, spoken);
        if (missing === null) accepted.push(command);
        else warnings.push(skipWarning(command, missing));
    }
    return { commands: accepted, warnings };
}

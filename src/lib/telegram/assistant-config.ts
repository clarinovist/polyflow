import { z } from 'zod';

const booleanString = z
    .enum(['true', 'false', '1', '0', 'on', 'off'])
    .default('false')
    .transform((value) => ['true', '1', 'on'].includes(value));

const configSchema = z.object({
    TELEGRAM_ASSISTANT_BOT_TOKEN: z.string().min(20),
    TELEGRAM_ASSISTANT_BOT_KEY: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: z.string().min(32).max(256),
    TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET: z.string().min(32).max(256),
    TELEGRAM_ASSISTANT_BOT_USERNAME: z
        .string()
        .regex(/^[A-Za-z0-9_]{5,32}$/),
    TELEGRAM_ASSISTANT_PUBLIC_BASE_URL: z.string().url(),
    TELEGRAM_ASSISTANT_KILL_SWITCH: booleanString,
});

export type TelegramAssistantConfig = z.infer<typeof configSchema>;

export function loadTelegramAssistantConfig(
    env: NodeJS.ProcessEnv = process.env,
): TelegramAssistantConfig {
    return configSchema.parse(env);
}

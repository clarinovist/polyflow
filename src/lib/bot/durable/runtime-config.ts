import { z } from 'zod';

const emptyStringAsUndefined = (value: unknown) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalTelegramString = <T extends z.ZodTypeAny>(schema: T) =>
    z.preprocess(emptyStringAsUndefined, schema.optional());

const optionalUrl = optionalTelegramString(z.string().url());
const optionalToken = optionalTelegramString(z.string().min(32));
export const ASSISTANT_BROKER_CANARY_TOOL =
    'get_daily_production_output' as const;
const brokerCanaryAllowlistSchema = z
    .string()
    .refine(
        (value) =>
            value === '' || value.trim() === ASSISTANT_BROKER_CANARY_TOOL,
        `Only ${ASSISTANT_BROKER_CANARY_TOOL} may be brokered in this tranche`,
    );

const runtimeSchema = z.object({
    ASSISTANT_WORKER_TOKEN: z.string().min(32),
    ASSISTANT_STORAGE_ROOT: z.string().min(1).default('/data/tenants'),
    ASSISTANT_WORKER_HOST: z.string().default('0.0.0.0'),
    ASSISTANT_WORKER_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(3010),
    ASSISTANT_MAX_OPEN_HARNESSES: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20),
    ASSISTANT_HARNESS_IDLE_MS: z.coerce
        .number()
        .int()
        .min(10_000)
        .default(300_000),
    ASSISTANT_BROKER_URL: optionalUrl,
    ASSISTANT_BROKER_TOKEN: optionalToken,
    ASSISTANT_BROKER_ALLOWED_TOOLS: brokerCanaryAllowlistSchema.default(''),
    ASSISTANT_CONTROL_TENANT_DATABASE_URLS: z.string().default(''),
    LLM_BASE_URL: z.string().url(),
    LLM_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1),
    LLM_CONTEXT_WINDOW: z.coerce.number().int().min(4096).default(65536),
    LLM_MAX_TOKENS: z.coerce.number().int().min(256).default(4096),
    TELEGRAM_ASSISTANT_BOT_TOKEN: optionalTelegramString(z.string().min(20)),
    TELEGRAM_ASSISTANT_BOT_KEY: optionalTelegramString(
        z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    ),
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: optionalTelegramString(
        z.string().min(32),
    ),
    TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET: optionalTelegramString(
        z.string().min(32),
    ),
    TELEGRAM_ASSISTANT_BOT_USERNAME: optionalTelegramString(
        z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
    ),
    TELEGRAM_ASSISTANT_PUBLIC_BASE_URL: optionalTelegramString(
        z.string().url(),
    ),
    TELEGRAM_ASSISTANT_KILL_SWITCH: z
        .enum(['true', 'false', '1', '0', 'on', 'off'])
        .default('false'),
    TELEGRAM_ASSISTANT_CONSUMER_INTERVAL_MS: z.coerce
        .number()
        .int()
        .min(500)
        .max(60_000)
        .default(2_000),
});

export type AssistantWorkerRuntimeConfig = z.infer<typeof runtimeSchema>;

export function loadAssistantWorkerRuntimeConfig(
    env: NodeJS.ProcessEnv = process.env,
): AssistantWorkerRuntimeConfig {
    return runtimeSchema.parse(env);
}

const brokerRuntimeSchema = z.object({
    ASSISTANT_BROKER_TOKEN: z.string().min(32),
    ASSISTANT_BROKER_HOST: z.string().default('0.0.0.0'),
    ASSISTANT_BROKER_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(3020),
    ASSISTANT_BROKER_ALLOWED_TOOLS: brokerCanaryAllowlistSchema.default(
        ASSISTANT_BROKER_CANARY_TOOL,
    ),
    ASSISTANT_QUERY_DATABASE_URLS: z.string().min(1),
});

export type AssistantBrokerRuntimeConfig = z.infer<typeof brokerRuntimeSchema>;

export function loadAssistantBrokerRuntimeConfig(
    env: NodeJS.ProcessEnv = process.env,
): AssistantBrokerRuntimeConfig {
    return brokerRuntimeSchema.parse(env);
}

export type AssistantRuntime = 'legacy' | 'pi-durable';
export function getAssistantRuntime(
    env: NodeJS.ProcessEnv = process.env,
): AssistantRuntime {
    const value = env.ASSISTANT_RUNTIME ?? 'legacy';
    if (value !== 'legacy' && value !== 'pi-durable') {
        throw new Error('ASSISTANT_RUNTIME must be legacy or pi-durable');
    }
    return value;
}

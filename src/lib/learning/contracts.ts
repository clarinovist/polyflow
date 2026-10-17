import { z } from 'zod';

export const LEARNING_VERSION = 'product-reliability-v1';
export const DAY_MS = 86_400_000;
const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;
export const LEARNING_DOMAINS = [
    { key: 'PRODUCT', label: 'Reliabilitas produk', supported: true },
    { key: 'MARKETING', label: 'Marketing', supported: false },
    { key: 'MATERIALS', label: 'Pola bahan / pesanan', supported: false },
    { key: 'PRICING', label: 'Harga', supported: false },
    { key: 'REGIONS', label: 'Wilayah usaha', supported: false },
] as const;

// Rules are investigation triggers, NOT statistical significance or privacy thresholds.
export const LEARNING_METRICS = {
    help_failure_share: {
        label: 'Hasil bantuan tercatat gagal / parsial',
        denominator: 'Interaksi dengan outcome SUCCESS, PARTIAL, atau FAILED',
        source: 'HelpInteraction.outcome',
        module: 'assistant',
        minimum: 20,
        threshold: 0.2,
        action: 'Periksa jalur bantuan dengan kasus sintetis; verifikasi routing dan regression test. Outcome asisten bersifat heuristik.',
    },
    mobile_failure_share: {
        label: 'Event hasil tugas mobile tercatat gagal',
        denominator: 'Event MOBILE_TASK_COMPLETED + MOBILE_TASK_FAILED',
        source: 'UsageEvent.eventType',
        module: 'mobile',
        minimum: 20,
        threshold: 0.2,
        action: 'Periksa alur mobile dan instrumentasinya; reproduksi dengan data sintetis. Event bukan jumlah tugas atau pengguna unik.',
    },
    unmapped_view_share: {
        label: 'Event tampilan belum terpetakan',
        denominator: 'Event FEATURE_VIEW + MOBILE_PAGE_VIEW pada modul yang diizinkan',
        source: 'UsageEvent.featureKey',
        module: 'analytics',
        minimum: 20,
        threshold: 0.1,
        action: 'Tinjau feature registry dan coverage routing. Jangan mengambil path mentah atau menafsirkan pageview sebagai adopsi.',
    },
} as const;
export type MetricKey = keyof typeof LEARNING_METRICS;
export const metricKeySchema = z.enum(['help_failure_share', 'mobile_failure_share', 'unmapped_view_share']);
export const observationSchema = z.object({
    metricKey: metricKeySchema,
    numerator: z.number().int().nonnegative().max(2_147_483_647),
    denominator: z.number().int().nonnegative().max(2_147_483_647),
}).strict().refine(value => value.numerator <= value.denominator);
export type Observation = z.infer<typeof observationSchema>;

export type LearningPolicy = {
    enabled: true;
    version: string;
    activeFrom: Date;
    retentionDays: number;
    closedRetentionDays: number;
};
export type LearningConfiguration = LearningPolicy | {
    enabled: false;
    reason: 'DISABLED' | 'POLICY_REQUIRED';
};

/** Explicit configuration is the activation receipt; no inferred/default consent. */
export function learningConfiguration(env: Record<string, string | undefined> = process.env): LearningConfiguration {
    if (env.PRODUCT_LEARNING_ENABLED !== 'true') return { enabled: false, reason: 'DISABLED' };
    const parsed = z.object({
        version: z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/),
        activeFrom: z.iso.datetime({ offset: true }),
        retentionDays: z.coerce.number().int().min(30).max(90),
        closedRetentionDays: z.coerce.number().int().min(30).max(365),
        scope: z.literal('restricted-global-product-reliability'),
    }).safeParse({
        version: env.PRODUCT_LEARNING_POLICY_VERSION,
        activeFrom: env.PRODUCT_LEARNING_ACTIVE_FROM,
        retentionDays: env.PRODUCT_LEARNING_RETENTION_DAYS,
        closedRetentionDays: env.PRODUCT_LEARNING_CLOSED_RETENTION_DAYS,
        scope: env.PRODUCT_LEARNING_SCOPE,
    });
    if (!parsed.success) return { enabled: false, reason: 'POLICY_REQUIRED' };
    return { enabled: true, ...parsed.data, activeFrom: new Date(parsed.data.activeFrom) };
}

/** UTC instant at the start of the containing Jakarta calendar day. */
export function jakartaDayStart(now: Date): Date {
    return new Date(Math.floor((now.getTime() + JAKARTA_OFFSET) / DAY_MS) * DAY_MS - JAKARTA_OFFSET);
}
export function dayKey(start: Date): Date {
    return new Date(new Date(start.getTime() + JAKARTA_OFFSET).toISOString().slice(0, 10));
}
export function firstCompleteDay(activeFrom: Date): Date {
    const start = jakartaDayStart(activeFrom);
    return new Date(start.getTime() + (start < activeFrom ? DAY_MS : 0));
}
export function observationState(observation: Observation): 'NO_DATA' | 'INSUFFICIENT' | 'OBSERVED' {
    if (observation.denominator === 0) return 'NO_DATA';
    return observation.denominator < LEARNING_METRICS[observation.metricKey].minimum ? 'INSUFFICIENT' : 'OBSERVED';
}
export function warrantsInvestigation(observation: Observation): boolean {
    return observationState(observation) === 'OBSERVED' &&
        observation.numerator / observation.denominator >= LEARNING_METRICS[observation.metricKey].threshold;
}
export type EvaluationResult = 'INCONCLUSIVE' | 'UNCHANGED' | 'REGRESSED' | 'IMPROVED_OBSERVED_METRIC';
export function compareWindows(before: Observation, after: Observation, complete: boolean): EvaluationResult {
    if (!complete || before.metricKey !== after.metricKey ||
        before.denominator < 50 || after.denominator < 50) return 'INCONCLUSIVE';
    const delta = after.numerator / after.denominator - before.numerator / before.denominator;
    // Prespecified descriptive criterion: >=5 percentage points; never causal proof.
    if (delta <= -0.05 + 1e-10) return 'IMPROVED_OBSERVED_METRIC';
    if (delta >= 0.05 - 1e-10) return 'REGRESSED';
    return 'UNCHANGED';
}
export const learningReviewSchema = z.discriminatedUnion('action', [
    z.object({ id: z.string().min(1).max(100), action: z.enum(['accept', 'reject']) }).strict(),
    z.object({
        id: z.string().min(1).max(100), action: z.literal('intervention'),
        releaseRef: z.string().regex(/^[a-f0-9]{40}$/),
        verificationRef: z.string().regex(/^src\/[a-zA-Z0-9_./-]+\.(test|spec)\.tsx?$/).max(240)
            .refine(value => !value.includes('..')),
    }).strict(),
]);
export type LearningReview = z.infer<typeof learningReviewSchema>;

import { z } from 'zod';
import { DAY_MS } from './contracts';

export const OWNER_LEARNING_VERSION = 'owner-usage-commerce-v1';
export const OWNER_RETENTION_DAYS = 90;
export const OWNER_MODULES = ['dashboard', 'warehouse', 'production', 'finance', 'sales', 'purchasing', 'hrd', 'maklon', 'distribution'] as const;
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const count = z.number().int().nonnegative();
const amount = z.string().regex(/^-?\d+(\.\d+)?$/).max(80);

export type OwnerLearningPolicy = {
    enabled: true; ownerId: string; tenantIds: string[]; activeFrom: Date; version: string;
};
export function ownerLearningPolicy(env: Record<string, string | undefined> = process.env): OwnerLearningPolicy | { enabled: false; reason: 'DISABLED' | 'POLICY_REQUIRED' } {
    if (env.OWNER_LEARNING_ENABLED !== 'true') return { enabled: false, reason: 'DISABLED' };
    const result = z.object({
        ownerId: id, tenantIds: z.array(id).min(1).max(20),
        activeFrom: z.iso.datetime({ offset: true }),
        version: z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/),
        scope: z.literal('private-owner-usage-commerce'),
    }).safeParse({ ownerId: env.OWNER_LEARNING_USER_ID, tenantIds: env.OWNER_LEARNING_TENANT_IDS?.split(',').map(value => value.trim()).filter(Boolean), activeFrom: env.OWNER_LEARNING_ACTIVE_FROM, version: env.OWNER_LEARNING_POLICY_VERSION, scope: env.OWNER_LEARNING_SCOPE });
    if (!result.success || new Set(result.data.tenantIds).size !== result.data.tenantIds.length) return { enabled: false, reason: 'POLICY_REQUIRED' };
    return { enabled: true, ...result.data, activeFrom: new Date(result.data.activeFrom) };
}

// No arbitrary free text, transcript, email, phone, address or account credentials.
export const ownerUsageRowSchema = z.object({
    userId: id, module: z.enum(OWNER_MODULES), views: count, activeDays: count.max(30),
    completed: count, failed: count, retries: count,
}).strict();
export const ownerCustomerRowSchema = z.object({
    customerId: id.nullable(), orderType: z.string().max(40), status: z.string().max(40), orderCount: count, firstOrderAt: z.iso.datetime(), lastOrderAt: z.iso.datetime(),
    orderValue: amount, missingValueCount: count,
}).strict();
export const ownerPriceRowSchema = z.object({
    customerId: id.nullable(), variantId: id, unit: z.string().max(40), orderType: z.string().max(40),
    ppnMode: z.enum(['INCLUDE', 'EXCLUDE']), taxPercent: amount, discountPercent: amount,
    priceStatus: z.string().max(40).nullable(), reviewStatus: z.string().max(40), basis: z.enum(['ENTERED_SNAPSHOT', 'PRIMARY_CURRENT_LABEL']),
    lineCount: count, quantity: amount, minPrice: amount, maxPrice: amount,
}).strict();
export const ownerMovementRowSchema = z.object({
    customerId: id.nullable(), variantId: id, unit: z.string().max(40), kind: z.enum(['DISPATCH', 'RETURN_RECEIVED']),
    state: z.string().max(40), quantity: amount, lineCount: count,
}).strict();
export const ownerRegionRowSchema = z.object({ province: z.string().max(120).nullable(), city: z.string().max(120).nullable(), orderCount: count }).strict();
export const ownerSnapshotSchema = z.object({
    schemaVersion: z.literal(1),
    usage: z.array(ownerUsageRowSchema).max(500),
    customers: z.array(ownerCustomerRowSchema).max(200),
    prices: z.array(ownerPriceRowSchema).max(300),
    regions: z.array(ownerRegionRowSchema).max(200),
    movements: z.array(ownerMovementRowSchema).max(300),
    commerceState: z.enum(['OBSERVED', 'MODULE_NOT_ENABLED']),
    truncated: z.object({ usage: z.boolean(), customers: z.boolean(), prices: z.boolean(), regions: z.boolean(), movements: z.boolean() }).strict(),
    suggestions: z.array(z.enum(['CHECK_MOBILE_FRICTION', 'REVIEW_WORKFLOW_GUIDANCE', 'IMPROVE_REGION_DATA', 'REVIEW_SCOPE_VOLUME'])).max(4),
}).strict();
export type OwnerSnapshot = z.infer<typeof ownerSnapshotSchema>;

export function ownerWindow(activeFrom: Date, end: Date): { start: Date; end: Date } {
    return { start: new Date(Math.max(activeFrom.getTime(), end.getTime() - 30 * DAY_MS)), end };
}
export function ownerSuggestions(snapshot: Omit<OwnerSnapshot, 'suggestions'>): OwnerSnapshot['suggestions'] {
    const result: OwnerSnapshot['suggestions'] = [];
    if (snapshot.usage.some(row => row.completed + row.failed >= 20 && row.failed / (row.completed + row.failed) >= 0.2)) result.push('CHECK_MOBILE_FRICTION');
    if (snapshot.usage.some(row => row.retries >= 10)) result.push('REVIEW_WORKFLOW_GUIDANCE');
    if (snapshot.regions.some(row => !row.city || !row.province)) result.push('IMPROVE_REGION_DATA');
    if (Object.values(snapshot.truncated).some(Boolean)) result.push('REVIEW_SCOPE_VOLUME');
    return result;
}
export const OWNER_SUGGESTIONS = {
    CHECK_MOBILE_FRICTION: 'Periksa friksi alur mobile dengan reproduksi sintetis; event gagal bukan bukti kemampuan pengguna.',
    REVIEW_WORKFLOW_GUIDANCE: 'Tinjau kebutuhan panduan pada alur dengan retry berulang. Validasi konteks tugas sebelum menyimpulkan penyebab.',
    IMPROVE_REGION_DATA: 'Sebagian wilayah customer belum lengkap. Validasi master wilayah sebelum mengambil keputusan distribusi.',
    REVIEW_SCOPE_VOLUME: 'Ringkasan mencapai batas kapasitas. Jangan menggeneralisasi sampel; periksa cakupan sebelum memperluas analisis.',
} as const;

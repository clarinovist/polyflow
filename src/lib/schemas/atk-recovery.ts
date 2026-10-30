import { z } from 'zod';
import { parseBusinessDate } from '@/lib/utils/timezone';

export const atkRecoveryIntentSchema = z
    .object({
        sourceMovementId: z.string().trim().min(1).max(100),
        kind: z.enum(['REFUND', 'COMPENSATION']),
    })
    .strict();
export const atkRecoveryApplySchema = atkRecoveryIntentSchema
    .extend({
        requestId: z.string().uuid(),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        postingDate: z.string().refine((value) => {
            try {
                parseBusinessDate(value);
                return true;
            } catch {
                return false;
            }
        }),
        reason: z.string().trim().min(12).max(1000),
        confirmed: z.literal(true),
    })
    .strict();

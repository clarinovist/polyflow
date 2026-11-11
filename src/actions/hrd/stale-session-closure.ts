'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover } from '@/lib/auth/hrd-access';
import type {
    ClosureApplyResult,
    ClosurePolicy,
    ClosurePreview,
} from '@/lib/hrd/stale-session-closure-constants';
import {
    applyClosure,
    parseClosureFingerprint,
    parseClosureInput,
    previewClosure,
} from '@/services/hrd/stale-session-closure';

/**
 * Koreksi massal sesi lupa pulang. Hanya ADMIN/HRD. Server yang menghitung
 * semua jam pulang dan upah; klien hanya mengirim id, kebijakan, dan sidik
 * pratinjau (tidak ada jam pulang dari klien).
 */

export const previewStaleSessionClosure = withTenant(
    async function previewStaleSessionClosure(input: {
        recordIds: string[];
        policy: ClosurePolicy;
    }) {
        return safeAction(async (): Promise<ClosurePreview> => {
            await requireHrdApprover();
            const parsed = parseClosureInput(input);
            return previewClosure(prisma, { ...parsed, now: new Date() });
        });
    },
);

export const applyStaleSessionClosure = withTenant(
    async function applyStaleSessionClosure(input: {
        recordIds: string[];
        policy: ClosurePolicy;
        fingerprint: string;
    }) {
        return safeAction(async (): Promise<ClosureApplyResult> => {
            const session = await requireHrdApprover();
            const parsed = parseClosureInput(input);
            const fingerprint = parseClosureFingerprint(input.fingerprint);
            return applyClosure(prisma, {
                ...parsed,
                fingerprint,
                userId: session.user.id,
                now: new Date(),
            });
        });
    },
);

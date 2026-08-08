/**
 * Gabungkan tim + target tersimpan + edit belum-tersimpan + konteks historis
 * jadi satu baris per sales — dipakai TargetAllocationHeader (distribusi,
 * total teralokasi) dan TargetTable (render). Dipisah dari
 * SalesTargetsClient.tsx supaya orchestrator tetap <400 baris (plan §3).
 */

import { toDecimalNumber } from '@/lib/utils/utils';
import type {
    TargetRow,
    TargetContextRow,
    TeamMember,
    EditableField,
    EffectiveRow,
} from './types';

function resolveNum(v: unknown): number {
    if (v == null) return 0;
    return toDecimalNumber(v);
}

function pct(actual: number, target: number | null): number | null {
    if (target == null || target === 0) return null;
    return Math.round((actual / target) * 10000) / 100;
}

export function buildEffectiveRows(
    team: TeamMember[],
    targetMap: Map<string, TargetRow>,
    edits: Map<string, EditableField>,
    contextMap: Map<string, TargetContextRow>,
): EffectiveRow[] {
    return team.map((member) => {
        const t = targetMap.get(member.id);
        const edit = edits.get(member.id);
        const ctxRaw = contextMap.get(member.id);

        const revenueTarget =
            edit?.revenueTarget != null
                ? edit.revenueTarget
                : t != null
                  ? resolveNum(t.revenueTarget)
                  : 0;
        const visitTarget =
            edit?.visitTarget !== undefined
                ? edit.visitTarget
                : (t?.visitTarget ?? null);
        const orderTarget =
            edit?.orderTarget !== undefined
                ? edit.orderTarget
                : (t?.orderTarget ?? null);

        const revenueActual = t != null ? resolveNum(t.revenueActual) : 0;
        const visitActual = t?.visitActual ?? 0;
        const orderActual = t?.orderActual ?? 0;

        // Preview pencapaian lokal kalau target sedang diedit (belum tersimpan);
        // kalau tidak diedit, pakai persentase dari server apa adanya.
        const revenueAchievementPercent =
            edit?.revenueTarget != null
                ? pct(revenueActual, revenueTarget)
                : (t?.revenueAchievementPercent ?? null);
        const visitAchievementPercent =
            edit?.visitTarget !== undefined
                ? pct(visitActual, visitTarget)
                : (t?.visitAchievementPercent ?? null);
        const orderAchievementPercent =
            edit?.orderTarget !== undefined
                ? pct(orderActual, orderTarget)
                : (t?.orderAchievementPercent ?? null);

        return {
            userId: member.id,
            name: member.name ?? member.id.slice(0, 8),
            targetId: t?.id ?? null,
            revenueTarget,
            revenueTargetIsEdited: edit?.revenueTarget != null,
            revenueActual,
            revenueAchievementPercent,
            visitTarget,
            visitTargetIsEdited: edit?.visitTarget !== undefined,
            visitActual,
            visitAchievementPercent,
            orderTarget,
            orderTargetIsEdited: edit?.orderTarget !== undefined,
            orderActual,
            orderAchievementPercent,
            isEdited: edit != null,
            context: ctxRaw
                ? {
                      prevMonthActual: resolveNum(ctxRaw.prevMonthActual),
                      avg3MonthActual: resolveNum(ctxRaw.avg3MonthActual),
                      sameMonthLastYearActual: resolveNum(
                          ctxRaw.sameMonthLastYearActual,
                      ),
                  }
                : undefined,
        };
    });
}

import { prisma } from '@/lib/core/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ValidationError } from '@/lib/errors/errors';
import {
    calculatePaidInvoiceRevenueWithReturns,
    isProcessedReturnStatus,
} from '@/lib/sales/revenue-basis';

// ── Types ──────────────────────────────────────────────────────────

export type CommissionTierApplied = {
    minAchievementPercent: Decimal;
    ratePercent: Decimal;
};

export type CommissionEntry = {
    userId: string;
    userName: string | null;
    paidRevenue: Decimal;
    revenueTarget: Decimal | null;
    achievementPercent: number | null;
    tierApplied: CommissionTierApplied | null;
    commissionAmount: Decimal | null;
    warning: string | null;
};

export type CommissionResult = {
    entries: CommissionEntry[];
    unattributed: Decimal;
    unattributedPaidRevenue: Decimal;
    scheme: { id: string; name: string; basis: string } | null;
    warnings: string[];
    period: {
        from: Date;
        to: Date;
        periodYear: number;
        periodMonth: number;
    };
};

export type CalculateCommissionInput = {
    from: Date;
    to: Date;
    userId?: string;
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Same guard as target-service.calcAchievementPercent but exported here.
 * Returns null if target zero (no div by zero). Otherwise rounded to 2 decimals.
 */
export function calcCommissionAchievementPercent(
    actual: Decimal,
    target: Decimal,
): number | null {
    if (target.isZero()) return null;
    const pct = actual.div(target).mul(100);
    // same rounding as target-service
    return Number(pct.toFixed(2));
}

function toDecimal(v: Decimal | number | string | null | undefined): Decimal {
    if (v == null) return new Decimal(0);
    if (v instanceof Decimal) return v;
    return new Decimal(v.toString());
}

// ── Main ───────────────────────────────────────────────────────────

/**
 * Hitung komisi per sales untuk periode tertentu.
 *
 * Basis komisi = PAID_INVOICE (Q3 decision).
 * Periode diasumsikan = 1 bulan kalender untuk mapping ke SalesTarget
 * (di-resolve dari `from`). Jika range tidak persis 1 bulan, tetap pakai
 * periodYear/periodMonth dari `from` — ini sesuai desain target bulanan.
 *
 * Catatan schema Invoice: tidak ada field `paidDate` / kapan dibayar di model
 * Invoice (hanya `paidAmount` + `invoiceDate`). Jadi filter periode pakai
 * `invoiceDate` (bukan tanggal pembayaran aktual). Alternatif yang lebih akurat
 * adalah join Payment.paymentDate, tapi menambah kompleksitas query dan belum
 * ada kebutuhan — catat sebagai follow-up jika diperlukan akurasi paid-date.
 * Retur mengurangi omzet DI PERIODE RETUR TERJADI (Q5).
 */
export async function calculateCommission(
    input: CalculateCommissionInput,
): Promise<CommissionResult> {
    const { from, to, userId } = input;

    if (!(from instanceof Date) || isNaN(from.getTime())) {
        throw new ValidationError('from harus Date valid');
    }
    if (!(to instanceof Date) || isNaN(to.getTime())) {
        throw new ValidationError('to harus Date valid');
    }

    // Asumsi periode target = 1 bulan kalender, resolve dari `from`
    const periodYear = from.getFullYear();
    const periodMonth = from.getMonth() + 1;

    // ── 1. Query paid invoices + returns dalam periode ───────────
    const [invoices, returns, activeSchemes] = await Promise.all([
        prisma.invoice.findMany({
            where: {
                invoiceDate: { gte: from, lte: to },
                // Let pure function filter DRAFT/CANCELLED, but pre-filter for small perf
                status: { notIn: ['DRAFT', 'CANCELLED'] as never },
                ...(userId
                    ? {
                          salesOrder: { salesRepId: userId },
                      }
                    : {}),
            },
            select: {
                id: true,
                paidAmount: true,
                status: true,
                salesOrder: { select: { salesRepId: true } },
            },
        }),
        prisma.salesReturn.findMany({
            where: {
                returnDate: { gte: from, lte: to },
                status: { notIn: ['DRAFT', 'CANCELLED'] as never },
                ...(userId
                    ? {
                          salesOrder: { salesRepId: userId },
                      }
                    : {}),
            },
            select: {
                id: true,
                totalAmount: true,
                status: true,
                salesOrder: { select: { salesRepId: true } },
            },
        }),
        prisma.commissionScheme.findMany({
            where: { isActive: true, basis: 'PAID_INVOICE' as never },
            orderBy: { createdAt: 'desc' },
            include: { tiers: true },
        }),
    ]);

    // Adapt to revenue-basis pure input shapes
    const paidRows = invoices.map((inv) => ({
        id: inv.id,
        salesRepId: inv.salesOrder?.salesRepId ?? null,
        paidAmount: inv.paidAmount as unknown as Decimal,
        invoiceStatus: inv.status,
    }));

    const returnRows = returns
        .filter((r) => isProcessedReturnStatus(r.status))
        .map((r) => ({
            id: r.id,
            salesRepId: r.salesOrder?.salesRepId ?? null,
            totalAmount: (r.totalAmount ??
                new Decimal(0)) as unknown as Decimal,
            status: r.status,
        }));

    const revenueResult = calculatePaidInvoiceRevenueWithReturns(
        paidRows,
        returnRows,
    );

    // ── 2. Targets untuk periode yang sama ─────────────────────────
    const targets = await prisma.salesTarget.findMany({
        where: {
            periodYear,
            periodMonth,
            ...(userId ? { userId } : {}),
        },
        select: {
            userId: true,
            revenueTarget: true,
        },
    });

    const targetMap = new Map<string, Decimal>();
    for (const t of targets) {
        targetMap.set(
            t.userId,
            toDecimal(t.revenueTarget as unknown as Decimal),
        );
    }

    // Union userIds: dari attributed map + targetMap + (jika userId filter, pakai itu)
    const userIdSet = new Set<string>();
    for (const uid of revenueResult.attributed.keys()) {
        userIdSet.add(uid);
    }
    for (const uid of targetMap.keys()) {
        userIdSet.add(uid);
    }
    if (userId) userIdSet.add(userId);

    const allUserIds = Array.from(userIdSet);

    // ── 3. User names ───────────────────────────────────────────────
    const users =
        allUserIds.length > 0
            ? await prisma.user.findMany({
                  where: { id: { in: allUserIds } },
                  select: { id: true, name: true },
              })
            : [];
    const userNameMap = new Map<string, string | null>();
    for (const u of users) {
        userNameMap.set(u.id, u.name ?? null);
    }

    // ── 4. Active scheme & tier handling ────────────────────────────
    const warnings: string[] = [];
    const activeSchemeRaw = activeSchemes[0] ?? null;
    if (activeSchemes.length > 1) {
        warnings.push('MULTIPLE_ACTIVE_SCHEMES');
    }

    const scheme = activeSchemeRaw
        ? {
              id: activeSchemeRaw.id,
              name: activeSchemeRaw.name,
              basis: activeSchemeRaw.basis,
          }
        : null;

    const sortedTiers = activeSchemeRaw
        ? [...activeSchemeRaw.tiers].sort((a, b) => {
              const aDec = toDecimal(
                  a.minAchievementPercent as unknown as Decimal,
              );
              const bDec = toDecimal(
                  b.minAchievementPercent as unknown as Decimal,
              );
              return aDec.comparedTo(bDec);
          })
        : [];

    // ── 5. Build entries per sales ──────────────────────────────────

    const entries: CommissionEntry[] = [];

    // If no scheme active at all, whole result commissionAmount null, warning NO_ACTIVE_SCHEME
    const noActiveScheme = !activeSchemeRaw;

    for (const uid of allUserIds) {
        const paidRevenue = revenueResult.attributed.get(uid) ?? new Decimal(0);
        const hasTarget = targetMap.has(uid);
        const revenueTarget = hasTarget ? targetMap.get(uid)! : null;

        // Default
        let achievementPercent: number | null = null;
        let tierApplied: CommissionTierApplied | null = null;
        let commissionAmount: Decimal | null = null;
        let warning: string | null = null;

        if (noActiveScheme) {
            warning = 'NO_ACTIVE_SCHEME';
            // commissionAmount stays null, achievement still computed if possible for visibility?
            if (hasTarget && revenueTarget && !revenueTarget.isZero()) {
                achievementPercent = calcCommissionAchievementPercent(
                    paidRevenue,
                    revenueTarget,
                );
            } else if (!hasTarget) {
                // still mark as NO_ACTIVE_SCHEME (priority over NO_TARGET_SET per spec)
                achievementPercent = null;
            } else if (revenueTarget?.isZero()) {
                achievementPercent = null;
                // warning priority: NO_ACTIVE_SCHEME wins
            }
            entries.push({
                userId: uid,
                userName: userNameMap.get(uid) ?? null,
                paidRevenue,
                revenueTarget,
                achievementPercent,
                tierApplied: null,
                commissionAmount: null,
                warning,
            });
            continue;
        }

        // Scheme exists from here

        if (!hasTarget) {
            entries.push({
                userId: uid,
                userName: userNameMap.get(uid) ?? null,
                paidRevenue,
                revenueTarget: null,
                achievementPercent: null,
                tierApplied: null,
                commissionAmount: null,
                warning: 'NO_TARGET_SET',
            });
            continue;
        }

        // has target
        if (!revenueTarget || revenueTarget.isZero()) {
            entries.push({
                userId: uid,
                userName: userNameMap.get(uid) ?? null,
                paidRevenue,
                revenueTarget,
                achievementPercent: null,
                tierApplied: null,
                commissionAmount: null,
                warning: 'TARGET_ZERO',
            });
            continue;
        }

        achievementPercent = calcCommissionAchievementPercent(
            paidRevenue,
            revenueTarget,
        );

        // achievement null only when target zero (already handled). So here non-null.

        // Tier matching: highest minAchievementPercent <= achievementPercent
        // Exact boundary must match upper tier (<= semantics)
        let matched: (typeof sortedTiers)[number] | null = null;
        if (achievementPercent != null) {
            const achDec = new Decimal(achievementPercent);
            for (const tier of sortedTiers) {
                const minDec = toDecimal(
                    tier.minAchievementPercent as unknown as Decimal,
                );
                if (achDec.greaterThanOrEqualTo(minDec)) {
                    matched = tier;
                }
            }
        }

        if (!matched) {
            // Below lowest tier -> commission 0, not null (performa buruk, bukan missing data)
            commissionAmount = new Decimal(0);
            tierApplied = null;
        } else {
            tierApplied = {
                minAchievementPercent: toDecimal(
                    matched.minAchievementPercent as unknown as Decimal,
                ),
                ratePercent: toDecimal(
                    matched.ratePercent as unknown as Decimal,
                ),
            };
            const rateDec = tierApplied.ratePercent;
            // commission = paidRevenue * rate / 100 , Decimal, JANGAN float
            commissionAmount = paidRevenue.mul(rateDec.div(100));
        }

        entries.push({
            userId: uid,
            userName: userNameMap.get(uid) ?? null,
            paidRevenue,
            revenueTarget,
            achievementPercent,
            tierApplied,
            commissionAmount,
            warning,
        });
    }

    // Sort entries by paidRevenue desc for usefulness, but keep deterministic
    entries.sort((a, b) => {
        // compare Decimal via comparedTo
        return b.paidRevenue.comparedTo(a.paidRevenue);
    });

    return {
        entries,
        unattributed: revenueResult.unattributed,
        unattributedPaidRevenue: revenueResult.unattributed,
        scheme,
        warnings,
        period: { from, to, periodYear, periodMonth },
    };
}

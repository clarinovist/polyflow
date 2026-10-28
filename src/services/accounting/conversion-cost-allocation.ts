import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Journal-based conversion cost for cost reports: the POSTED amounts of the
 * tenant's chosen expense accounts in a period, split across the SPKs that
 * completed in it by material cost. Pure split + one read; no writes.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ConversionPoolAccount {
    accountId: string;
    code: string;
    name: string;
    amount: number;
}

export interface ConversionPool {
    total: number;
    byAccount: ConversionPoolAccount[];
}

const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const toRupiah = (cents: number) => cents / 100;

/** Debit minus credit per account, so reversals and corrections net out. */
export async function readConversionPool(
    db: Db,
    accountIds: string[],
    start: Date,
    end: Date,
): Promise<ConversionPool> {
    if (!accountIds.length) return { total: 0, byAccount: [] };
    const lines = await db.journalLine.findMany({
        where: {
            accountId: { in: accountIds },
            journalEntry: {
                status: 'POSTED',
                entryDate: { gte: start, lte: end },
            },
        },
        select: {
            accountId: true,
            debit: true,
            credit: true,
            account: { select: { code: true, name: true } },
        },
    });
    const byAccount = new Map<
        string,
        ConversionPoolAccount & { cents: number }
    >();
    for (const line of lines) {
        const current = byAccount.get(line.accountId) ?? {
            accountId: line.accountId,
            code: line.account.code,
            name: line.account.name,
            amount: 0,
            cents: 0,
        };
        byAccount.set(line.accountId, {
            ...current,
            cents: current.cents + toCents(line.debit) - toCents(line.credit),
        });
    }
    const accounts = [...byAccount.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(({ cents, ...account }) => ({
            ...account,
            amount: toRupiah(cents),
        }));
    const totalCents = [...byAccount.values()].reduce(
        (sum, a) => sum + a.cents,
        0,
    );
    return { total: toRupiah(totalCents), byAccount: accounts };
}

export interface AllocationTarget {
    productionOrderId: string;
    materialCost: number;
}

export interface MaterialAllocation {
    allocations: Map<string, number>;
    allocated: number;
    unallocated: number;
}

/**
 * Split `pool` by material cost in whole cents. The rounding remainder goes to
 * the target with the most material, so the parts add up to the pool exactly.
 * Nothing is split when the pool is not positive or no target has material:
 * the whole pool is then reported as unallocated rather than dropped.
 */
export function allocateByMaterial(
    targets: AllocationTarget[],
    pool: number,
): MaterialAllocation {
    const poolCents = toCents(pool);
    const weighted = targets
        .map((t) => ({
            id: t.productionOrderId,
            weight: toCents(t.materialCost),
        }))
        .filter((t) => t.weight > 0);
    const totalWeight = weighted.reduce((sum, t) => sum + t.weight, 0);
    if (poolCents <= 0 || totalWeight <= 0)
        return {
            allocations: new Map(),
            allocated: 0,
            unallocated: toRupiah(poolCents),
        };

    // BigInt keeps pool × weight exact; both can exceed 2^53 cents together.
    const shares = weighted.map((t) => ({
        ...t,
        cents: Number(
            (BigInt(poolCents) * BigInt(t.weight)) / BigInt(totalWeight),
        ),
    }));
    const remainder = poolCents - shares.reduce((sum, s) => sum + s.cents, 0);
    const largest = shares.reduce((best, s) =>
        s.weight > best.weight || (s.weight === best.weight && s.id < best.id)
            ? s
            : best,
    );
    const allocations = new Map(
        shares.map((s) => [
            s.id,
            toRupiah(s.id === largest.id ? s.cents + remainder : s.cents),
        ]),
    );
    return { allocations, allocated: toRupiah(poolCents), unallocated: 0 };
}

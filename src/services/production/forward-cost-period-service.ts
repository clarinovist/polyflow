import { Prisma, type PrismaClient } from '@prisma/client';
import { AuthorizationError, NotFoundError } from '@/lib/errors/errors';
import { hasAnyRole } from '@/lib/auth/roles';
import { availableProductionWip } from '@/services/accounting/production-wip-provenance';
import {
    COST_PERIOD_ACTION,
    costPeriodHash,
    costPeriodSourceHash,
    periodFailure,
    readCostPeriod,
    type CostPeriodEvidence,
} from '@/services/accounting/production-cost-period';
import type { RecoveryBackupStore } from './cost-recovery-service';

type Tx = Prisma.TransactionClient;
const zero = () => new Prisma.Decimal(0);

async function inspect(tx: Tx, orderId: string) {
    const order = await tx.productionOrder.findUnique({
        where: { id: orderId },
        include: { bom: true },
    });
    if (!order) throw new NotFoundError('Production Order');
    if (
        order.status !== 'IN_PROGRESS' ||
        order.isMaklon ||
        order.actualPackagingEnabled ||
        (order.estimatedConversionCost &&
            !order.estimatedConversionCost.isZero())
    )
        periodFailure('jenis atau biaya konversi SPK tidak didukung');
    const executions = await tx.productionExecution.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
        take: 501,
    });
    if (
        !executions.length ||
        executions.length > 500 ||
        executions.some(
            (e) =>
                e.status !== 'COMPLETED' ||
                !e.endTime ||
                !e.quantityProduced.isFinite() ||
                !e.quantityProduced.gt(0),
        ) ||
        !executions
            .reduce((s, e) => s.plus(e.quantityProduced), zero())
            .eq(order.actualQuantity ?? 0)
    )
        periodFailure(
            'hasil lama harus sudah selesai dan cocok dengan total SPK',
        );
    if (
        (await tx.materialIssue.count({
            where: { productionOrderId: orderId, status: 'STAGED' },
        })) ||
        (await tx.additionalMaterialRequest.count({
            where: { productionOrderId: orderId, status: 'PENDING' },
        }))
    )
        periodFailure('ada bahan staged atau permintaan tertunda');
    const movements = await tx.stockMovement.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
        take: 1001,
    });
    if (
        !movements.length ||
        movements.length > 1000 ||
        movements.some(
            (m) =>
                !['IN', 'OUT'].includes(m.type) ||
                m.reversalOfId ||
                m.companyOwned === false ||
                m.salesOrderId ||
                m.goodsReceiptId ||
                !m.quantity.isFinite() ||
                !m.quantity.gt(0) ||
                (m.productionExecutionId !== null &&
                    !executions.some(
                        (e) => e.id === m.productionExecutionId,
                    )) ||
                (m.type === 'OUT' && (!m.fromLocationId || m.toLocationId)) ||
                (m.type === 'IN' && (!m.toLocationId || m.fromLocationId)) ||
                /^(VOID:|CORRECTION:|PROD-ISSUE-|PROD-CONSOL-)/.test(
                    m.reference ?? '',
                ),
        )
    )
        periodFailure('riwayat pembalik/manual/sumber bahan tidak didukung');
    if (
        await tx.stockMovement.count({
            where: { reversalOfId: { in: movements.map((m) => m.id) } },
        })
    )
        periodFailure('sumber memiliki mutasi pembalik');
    const journals = await tx.journalEntry.findMany({
        where: { referenceId: { in: movements.map((m) => m.id) } },
        include: { lines: { include: { account: true } } },
        orderBy: { id: 'asc' },
    });
    if (
        await tx.journalEntry.count({
            where: {
                referenceId: { in: journals.map((j) => j.id) },
                status: { not: 'VOIDED' },
            },
        })
    )
        periodFailure('jurnal sumber dibalik terpisah');
    const scraps = await tx.scrapRecord.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
    });
    const variants = await tx.productVariant.findMany({
        where: { id: { in: movements.map((m) => m.productVariantId) } },
        select: { id: true, product: { select: { productType: true } } },
    });
    const balances = new Map<string, Prisma.Decimal>();
    let nullScrapCount = 0;
    const matchedScraps = new Set<string>();
    const affalByExecution = new Map<string, Prisma.Decimal>();
    for (const movement of movements) {
        const own = journals.filter((j) => j.referenceId === movement.id);
        const isScrap =
            variants.find((v) => v.id === movement.productVariantId)?.product
                .productType === 'SCRAP';
        if (
            isScrap &&
            movement.type === 'IN' &&
            !own.length &&
            (movement.cost === null || movement.cost.isZero())
        ) {
            const records = scraps.filter(
                (s) =>
                    s.productVariantId === movement.productVariantId &&
                    s.locationId === movement.toLocationId &&
                    s.quantity.eq(movement.quantity),
            );
            const matches = records.filter((s) =>
                executions.some(
                    (e) =>
                        e.id === s.productionExecutionId &&
                        Math.abs(
                            e.createdAt.getTime() -
                                movement.createdAt.getTime(),
                        ) <= 30000,
                ),
            );
            if (
                matches.length !== 1 ||
                matchedScraps.has(matches[0].id) ||
                movement.reference !==
                    `Production Scrap: ${order.orderNumber}` ||
                !movement.toLocationId ||
                movement.fromLocationId ||
                (movement.productionExecutionId !== null &&
                    movement.productionExecutionId !==
                        matches[0].productionExecutionId)
            )
                periodFailure('affal lama tidak memiliki sumber hasil tunggal');
            matchedScraps.add(matches[0].id);
            const owner = matches[0].productionExecutionId!;
            affalByExecution.set(
                owner,
                (affalByExecution.get(owner) ?? zero()).plus(movement.quantity),
            );
            if (movement.cost === null) nullScrapCount++;
            continue;
        }
        if (
            isScrap ||
            own.length !== 1 ||
            movement.cost === null ||
            !movement.cost.isFinite() ||
            movement.cost.lt(0)
        )
            periodFailure('nilai/jurnal bahan atau hasil tidak lengkap');
        const j = own[0];
        if (
            j.status !== 'POSTED' ||
            !j.isAutoGenerated ||
            j.referenceType !== 'MANUAL_ENTRY' ||
            j.lines.length < 2 ||
            j.lines.some(
                (l) =>
                    !l.debit.isFinite() ||
                    !l.credit.isFinite() ||
                    l.account.type !== 'ASSET' ||
                    l.currency !== 'IDR' ||
                    !l.exchangeRate.eq(1) ||
                    l.debit.lt(0) ||
                    l.credit.lt(0) ||
                    (l.debit.gt(0) && l.credit.gt(0)),
            )
        )
            periodFailure('vektor jurnal tidak valid');
        const amount = j.lines.reduce((s, l) => s.plus(l.debit), zero());
        if (
            !amount.gt(0) ||
            !amount.eq(j.lines.reduce((s, l) => s.plus(l.credit), zero())) ||
            amount
                .minus(movement.quantity.mul(movement.cost))
                .abs()
                .gt(movement.quantity.mul('0.00005').plus('0.005'))
        )
            periodFailure(
                'nilai jurnal tidak seimbang atau tidak cocok sumber',
            );
        if (
            movement.type === 'IN' &&
            movement.productVariantId !== order.bom.productVariantId
        )
            periodFailure('hasil bukan varian SPK');
        for (const l of j.lines) {
            const delta =
                movement.type === 'OUT' ? l.debit : l.credit.negated();
            if (!delta.isZero())
                balances.set(
                    l.accountId,
                    (balances.get(l.accountId) ?? zero()).plus(delta),
                );
        }
    }
    const outputTotal = movements
        .filter(
            (m) =>
                m.type === 'IN' &&
                m.productVariantId === order.bom.productVariantId,
        )
        .reduce((s, m) => s.plus(m.quantity), zero());
    if (!outputTotal.eq(order.actualQuantity ?? 0))
        periodFailure('mutasi hasil tidak cocok dengan total SPK');
    if (
        matchedScraps.size !== scraps.length ||
        executions.some(
            (e) =>
                !(affalByExecution.get(e.id) ?? zero()).eq(
                    Prisma.Decimal.max(
                        e.scrapQuantity,
                        e.scrapDaunQty.plus(e.scrapProngkolQty),
                    ),
                ),
        )
    )
        periodFailure('jumlah affal tidak cocok dengan hasil asal');
    if (!nullScrapCount || [...balances.values()].some((v) => v.lt(0)))
        periodFailure('bukan kasus affal kosong dengan sisa biaya nonnegatif');
    const base = {
        version: 1 as const,
        orderId,
        movementIds: movements.map((m) => m.id),
        executionIds: executions.map((e) => e.id),
        sourceHash: costPeriodSourceHash(movements, journals),
        executionHash: costPeriodHash(executions),
        historicalBalances: [...balances]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([accountId, amount]) => ({
                accountId,
                amount: amount.toFixed(2),
            })),
        nullScrapCount,
    };
    const fingerprint = costPeriodHash({ base, order, executions, scraps });
    return {
        order,
        executions,
        movements,
        journals,
        evidence: { ...base, fingerprint } satisfies CostPeriodEvidence,
    };
}

export async function previewForwardCostPeriod(
    db: PrismaClient,
    orderId: string,
) {
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const existing = await readCostPeriod(tx, orderId);
            if (existing) return { alreadyApplied: true as const, ...existing };
            const data = await inspect(tx, orderId);
            return { alreadyApplied: false as const, ...data.evidence };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 30000,
        },
    );
}

export async function startForwardCostPeriod(
    db: PrismaClient,
    input: {
        orderId: string;
        fingerprint: string;
        actorId: string;
        reason: string;
    },
    backup: RecoveryBackupStore,
) {
    if (
        !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
        input.reason.trim().length < 12 ||
        input.reason.length > 1000
    )
        periodFailure('preview dan alasan wajib lengkap');
    return db.$transaction(
        async (tx) => {
            const actor = await tx.user.findUnique({
                where: { id: input.actorId },
                select: {
                    isActive: true,
                    role: true,
                    roles: { select: { role: true } },
                },
            });
            if (
                !actor?.isActive ||
                !hasAnyRole(
                    { role: actor.role, roles: actor.roles.map((r) => r.role) },
                    ['ADMIN', 'FINANCE'],
                )
            )
                throw new AuthorizationError();
            await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id=${input.orderId} FOR UPDATE`;
            const previous = await readCostPeriod(tx, input.orderId);
            if (previous) {
                if (previous.fingerprint !== input.fingerprint)
                    periodFailure('persetujuan terdahulu berbeda');
                return { alreadyApplied: true };
            }
            await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE "productionOrderId"=${input.orderId} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "ProductionExecution" WHERE "productionOrderId"=${input.orderId} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT j.id FROM "JournalEntry" j JOIN "StockMovement" m ON m.id=j."referenceId" WHERE m."productionOrderId"=${input.orderId} ORDER BY j.id FOR UPDATE OF j`;
            await tx.$queryRaw`SELECT l.id FROM "JournalLine" l JOIN "JournalEntry" j ON j.id=l."journalEntryId" JOIN "StockMovement" m ON m.id=j."referenceId" WHERE m."productionOrderId"=${input.orderId} ORDER BY l.id FOR UPDATE OF l`;
            const data = await inspect(tx, input.orderId);
            if (data.evidence.fingerprint !== input.fingerprint)
                periodFailure('sumber berubah setelah preview');
            if (!backup.ready())
                periodFailure('cadangan pemulihan belum tersedia');
            const backupReference = await backup.save(
                data.evidence,
                input.fingerprint,
            );
            if (!backupReference) periodFailure('cadangan belum terverifikasi');
            const audit = await tx.auditLog.create({
                data: {
                    userId: input.actorId,
                    action: COST_PERIOD_ACTION,
                    entityType: 'ProductionOrder',
                    entityId: input.orderId,
                    dedupeKey: `${COST_PERIOD_ACTION}:${input.orderId}`,
                    details: input.reason.trim(),
                    changes: JSON.parse(
                        JSON.stringify({
                            ...data.evidence,
                            backupReference,
                            policy: 'FORWARD_ONLY_KEEP_HISTORY',
                            historicalValuesUnchanged: true,
                        }),
                    ) as Prisma.InputJsonObject,
                },
            });
            if (
                !(
                    await availableProductionWip(tx, input.orderId, {
                        lock: false,
                    })
                ).isZero()
            )
                periodFailure('biaya awal periode baru bukan nol');
            return { alreadyApplied: false, auditId: audit.id };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30000,
        },
    );
}

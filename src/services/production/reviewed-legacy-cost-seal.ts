import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import {
    costPeriodHash,
    costPeriodSourceHash,
    periodFailure,
    type CostPeriodEvidence,
} from '@/services/accounting/production-cost-period';

type Tx = Prisma.TransactionClient;
const zero = () => new Prisma.Decimal(0);

/** Explicit reviewed policy, not a repair: preserve closed legacy sets exactly.
 * Invalid live source or quantity evidence still rejects. No source IDs, cost
 * values, journal vectors or execution links are supplied by the caller. */
export async function inspectReviewedLegacySeal(tx: Tx, orderId: string) {
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
        periodFailure('jenis SPK tidak mendukung penyegelan riwayat');
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
                !['COMPLETED', 'VOIDED'].includes(e.status) ||
                (e.status !== 'VOIDED' && !e.endTime) ||
                [
                    e.quantityProduced,
                    e.scrapQuantity,
                    e.scrapDaunQty,
                    e.scrapProngkolQty,
                ].some((q) => !q.isFinite() || q.lt(0)),
        )
    ) {
        periodFailure(
            'ada sesi berjalan atau hasil historis tidak valid; konfirmasi operator diperlukan',
        );
    }
    const nonvoidOutput = executions
        .filter((e) => e.status !== 'VOIDED')
        .reduce((s, e) => s.plus(e.quantityProduced), zero());
    if (!nonvoidOutput.gt(0) || !nonvoidOutput.eq(order.actualQuantity ?? 0))
        periodFailure('total hasil historis tidak cocok dengan SPK');
    const materialIssues = await tx.materialIssue.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
        take: 2001,
    });
    if (
        materialIssues.length > 2000 ||
        materialIssues.some((m) => !['ISSUED', 'VOIDED'].includes(m.status) || !m.quantity.isFinite() || !m.quantity.gt(0)) ||
        (await tx.additionalMaterialRequest.count({
            where: { productionOrderId: orderId, status: 'PENDING' },
        }))
    )
        periodFailure(
            'ada bahan staged/pending atau riwayat bahan tidak lengkap',
        );
    const movements = await tx.stockMovement.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
        take: 1001,
    });
    const ids = new Set(movements.map((m) => m.id));
    if (
        !movements.length ||
        movements.length > 1000 ||
        movements.some(
            (m) =>
                !['IN', 'OUT'].includes(m.type) ||
                !m.quantity.isFinite() ||
                !m.quantity.gt(0) ||
                m.companyOwned === false ||
                m.salesOrderId ||
                m.goodsReceiptId ||
                m.packagingOwnerCustomerId ||
                (m.type === 'IN'
                    ? !m.toLocationId || !!m.fromLocationId
                    : !m.fromLocationId || !!m.toLocationId) ||
                /^PROD-(ISSUE|CONSOL)-/.test(m.reference ?? '') ||
                (m.productionExecutionId !== null &&
                    !executions.some(
                        (e) => e.id === m.productionExecutionId,
                    )) ||
                (m.reversalOfId !== null && !ids.has(m.reversalOfId)),
        )
    )
        periodFailure('sumber asing, bahan manual, atau pembalik lintas batas');
    if (
        await tx.stockMovement.count({
            where: { reversalOfId: { in: [...ids] }, id: { notIn: [...ids] } },
        })
    )
        periodFailure('pembalik sumber berada di luar SPK');
    const journals = await tx.journalEntry.findMany({
        where: { referenceId: { in: [...ids] } },
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
    const variants = await tx.productVariant.findMany({
        where: {
            id: { in: [...new Set(movements.map((m) => m.productVariantId))] },
        },
        select: { id: true, product: { select: { productType: true } } },
    });
    const scrapRecords = await tx.scrapRecord.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
        take: 2001,
    });
    if (scrapRecords.length > 2000)
        periodFailure('riwayat affal melebihi batas');
    const balances = new Map<string, Prisma.Decimal>();
    const materialNet = new Map<string, Prisma.Decimal>();
    const scrapNet = new Map<string, Prisma.Decimal>();
    let netOutput = zero(),
        nullScrapCount = 0,
        journaledScrap = 0,
        unlinkedReversals = 0;
    for (const m of movements) {
        const variant = variants.find((v) => v.id === m.productVariantId);
        if (!variant) periodFailure('identitas varian sumber hilang');
        const scrap = variant.product.productType === 'SCRAP';
        const output = m.productVariantId === order.bom.productVariantId;
        if (scrap) scrapNet.set(m.productVariantId, (scrapNet.get(m.productVariantId) ?? zero()).plus(m.type === 'IN' ? m.quantity : m.quantity.negated()));
        if (output)
            netOutput = netOutput.plus(
                m.type === 'IN' ? m.quantity : m.quantity.negated(),
            );
        else if (!scrap)
            materialNet.set(
                m.productVariantId,
                (materialNet.get(m.productVariantId) ?? zero()).plus(
                    m.type === 'OUT' ? m.quantity : m.quantity.negated(),
                ),
            );
        if (/^(VOID:|CORRECTION:)/.test(m.reference ?? '') && !m.reversalOfId)
            unlinkedReversals++;
        const own = journals.filter((j) => j.referenceId === m.id);
        if (scrap && m.cost === null) nullScrapCount++;
        if (scrap && !own.length && (m.cost === null || m.cost.isZero()))
            continue;
        if (
            own.length !== 1 ||
            (!scrap && (m.cost === null || !m.cost.isFinite() || m.cost.lt(0)))
        )
            periodFailure(
                'jurnal bahan/hasil hilang, ganda, atau nilainya tidak lengkap',
            );
        const journal = own[0];
        if (
            journal.status !== 'POSTED' ||
            !journal.isAutoGenerated ||
            journal.referenceType !== 'MANUAL_ENTRY' ||
            journal.lines.length < 2 ||
            journal.lines.some(
                (l) =>
                    !l.debit.isFinite() ||
                    !l.credit.isFinite() ||
                    l.debit.lt(0) ||
                    l.credit.lt(0) ||
                    (l.debit.gt(0) && l.credit.gt(0)) ||
                    l.currency !== 'IDR' ||
                    !l.exchangeRate.eq(1) ||
                    l.account.type !== 'ASSET',
            )
        )
            periodFailure('vektor jurnal historis tidak valid');
        const amount = journal.lines.reduce((s, l) => s.plus(l.debit), zero());
        if (
            !amount.gt(0) ||
            !amount.eq(journal.lines.reduce((s, l) => s.plus(l.credit), zero()))
        )
            periodFailure('jurnal historis tidak seimbang');
        if (
            !scrap &&
            amount
                .minus(m.quantity.mul(m.cost!))
                .abs()
                .gt(m.quantity.mul('0.00005').plus('0.005'))
        )
            periodFailure('nilai bahan/hasil tidak cocok jurnal asal');
        if (scrap) journaledScrap++;
        for (const l of journal.lines) {
            const delta = m.type === 'OUT' ? l.debit : l.credit.negated();
            if (!delta.isZero())
                balances.set(
                    l.accountId,
                    (balances.get(l.accountId) ?? zero()).plus(delta),
                );
        }
    }
    if (
        !netOutput.eq(nonvoidOutput) ||
        [...materialNet.values()].some((q) => q.lt(0))
    )
        periodFailure(
            'hasil bersih atau pengembalian bahan historis tidak cocok',
        );
    const matched = new Set<string>();
    for (const record of scrapRecords) {
        if (
            !record.quantity.isFinite() ||
            !record.quantity.gt(0) ||
            (record.productionExecutionId !== null &&
                !executions.some(
                    (e) =>
                        e.id === record.productionExecutionId &&
                        e.status !== 'VOIDED',
                ))
        )
            periodFailure('catatan affal tidak valid');
        const candidates = movements.filter(
            (m) =>
                m.type === 'IN' &&
                m.productVariantId === record.productVariantId &&
                m.toLocationId === record.locationId &&
                m.quantity.eq(record.quantity) &&
                Math.abs(m.createdAt.getTime() - record.recordedAt.getTime()) <=
                    30000,
        );
        if (candidates.length !== 1 || matched.has(candidates[0].id))
            periodFailure('identitas penerimaan affal historis tidak unik');
        matched.add(candidates[0].id);
    }
    const issued = new Map<string, Prisma.Decimal>();
    for (const m of materialIssues.filter(m => m.status === 'ISSUED')) issued.set(m.productVariantId, (issued.get(m.productVariantId) ?? zero()).plus(m.quantity));
    const recordedScrap = new Map<string, Prisma.Decimal>();
    for (const s of scrapRecords) recordedScrap.set(s.productVariantId, (recordedScrap.get(s.productVariantId) ?? zero()).plus(s.quantity));
    const equalTotals = (a: Map<string, Prisma.Decimal>, b: Map<string, Prisma.Decimal>) => [...new Set([...a.keys(), ...b.keys()])].every(id => (a.get(id) ?? zero()).eq(b.get(id) ?? zero()));
    if (!equalTotals(materialNet, issued) || !equalTotals(scrapNet, recordedScrap)) periodFailure('jumlah bersih bahan/affal tidak cocok dengan catatan pendukung');
    const anomalies = [
        {
            category: 'VOIDED_EXECUTIONS',
            count: executions.filter((e) => e.status === 'VOIDED').length,
        },
        { category: 'UNLINKED_REVERSALS_RETAINED', count: unlinkedReversals },
        {
            category: 'NEGATIVE_ACCOUNT_POOLS_RETAINED',
            count: [...balances.values()].filter((b) => b.lt(0)).length,
        },
        { category: 'JOURNALED_SCRAP_RETAINED', count: journaledScrap },
        {
            category: 'UNALLOCATED_SCRAP_RETAINED',
            count: scrapRecords.filter((r) => !r.productionExecutionId).length,
        },
        { category: 'NULL_SCRAP_COST_RETAINED', count: nullScrapCount },
    ].filter((a) => a.count > 0);
    if (!anomalies.length)
        periodFailure('tidak ada riwayat khusus untuk mode tinjauan');
    const base = {
        version: 2 as const,
        mode: 'REVIEWED_LEGACY_SEAL' as const,
        orderId,
        movementIds: movements.map((m) => m.id),
        executionIds: executions.map((e) => e.id),
        sourceHash: costPeriodSourceHash(movements, journals),
        executionHash: costPeriodHash(executions),
        materialIssueIds: materialIssues.map((m) => m.id),
        scrapRecordIds: scrapRecords.map((r) => r.id),
        supportHash: costPeriodHash({ materialIssues, scrapRecords }),
        nullScrapCount,
        anomalies,
        nonvoidOutput: nonvoidOutput.toString(),
        netOutput: netOutput.toString(),
        historicalBalances: [...balances]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([accountId, value]) => ({
                accountId,
                amount: value.toFixed(2),
            })),
    };
    const evidence: CostPeriodEvidence = {
        ...base,
        fingerprint: costPeriodHash({ base, order }),
    };
    return { evidence };
}

import { Prisma } from '@prisma/client';
import { nonClosingReferenceSql } from '@/services/accounting/closing-reference-filter';
import { getIncomeStatement } from '@/services/accounting/reports-service';
import { financeRange } from './finance-diagnostic-input';

const SAMPLE_LIMIT = 20;

export type CogsCoverageStatus = 'covered' | 'partial' | 'missing';
export type CogsConfidenceCap = 0.6 | 0.75 | 0.85 | 0.9;

export type CogsCoverageDimension = {
    code: string;
    status: CogsCoverageStatus;
    reason: string;
};

export type CogsDiagnosisFinding = {
    code: string;
    conditionStatus: 'confirmed';
    accountingConclusion: 'needs_review';
    area: 'bookkeeping' | 'shipment' | 'return' | 'production';
    amountBasis: string;
    count: number;
    amount: number;
    nominal: number;
    revenuePercentage: number | null;
    sourceId: string | null;
    materiality: number;
    reason: string;
    evidenceLimit: string;
    samples: Array<{
        sourceId: string;
        materiality: number;
        amount: number;
        reason: string;
    }>;
};

type SnapshotRow = { payload: unknown };
type SnapshotFinding = {
    code: string;
    area: CogsDiagnosisFinding['area'];
    amountBasis: string;
    count: number;
    amount: number;
    materiality: number;
    reason: string;
    evidenceLimit: string;
    samples: CogsDiagnosisFinding['samples'];
};
type Snapshot = {
    readable: boolean;
    metrics: Record<string, number>;
    findings: SnapshotFinding[];
};

type BookkeepingSnapshot = {
    reportCogs: number;
    journalCogs: number;
    difference: number;
};

const n = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

function object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function parseSnapshot(rows: SnapshotRow[]): Snapshot {
    const payload = object(rows[0]?.payload);
    const rawMetrics = object(payload?.metrics);
    if (!payload || !rawMetrics || !Array.isArray(payload.findings)) {
        return { readable: false, metrics: {}, findings: [] };
    }
    const metrics = Object.fromEntries(
        Object.entries(rawMetrics).map(([key, value]) => [key, n(value)]),
    );
    const findings = payload.findings.flatMap((raw): SnapshotFinding[] => {
        const row = object(raw);
        if (!row || typeof row.code !== 'string' || typeof row.area !== 'string')
            return [];
        const samples = Array.isArray(row.samples)
            ? row.samples
                  .flatMap((sample) => {
                      const parsed = object(sample);
                      if (!parsed || typeof parsed.sourceId !== 'string') return [];
                      return [{
                          sourceId: parsed.sourceId,
                          materiality: n(parsed.materiality),
                          amount: n(parsed.amount),
                          reason: typeof parsed.reason === 'string' ? parsed.reason : '',
                      }];
                  })
                  .sort(
                      (a, b) =>
                          b.materiality - a.materiality ||
                          a.sourceId.localeCompare(b.sourceId),
                  )
                  .slice(0, SAMPLE_LIMIT)
            : [];
        return [{
            code: row.code,
            area: row.area as SnapshotFinding['area'],
            amountBasis:
                typeof row.amountBasis === 'string' ? row.amountBasis : 'none',
            count: n(row.count),
            amount: n(row.amount),
            materiality: n(row.materiality),
            reason: typeof row.reason === 'string' ? row.reason : '',
            evidenceLimit:
                typeof row.evidenceLimit === 'string' ? row.evidenceLimit : '',
            samples,
        }];
    });
    return { readable: true, metrics, findings };
}

function dimension(
    code: string,
    status: CogsCoverageStatus,
    reason: string,
): CogsCoverageDimension {
    return { code, status, reason };
}

function confidenceCap(
    dimensions: CogsCoverageDimension[],
): CogsConfidenceCap {
    if (dimensions.some((item) => item.status === 'missing')) return 0.6;
    if (
        dimensions.some(
            (item) =>
                item.status === 'partial' &&
                [
                    'SHIPMENT_HISTORICAL_VALUATION',
                    'JOURNAL_ATTRIBUTION',
                    'PRODUCTION_REVERSAL_ATTRIBUTION',
                    'RETURN_COST_VECTOR',
                    'RETURN_COMMERCIAL_VECTOR',
                ].includes(item.code),
        )
    )
        return 0.75;
    if (dimensions.some((item) => item.status === 'partial')) return 0.85;
    return 0.9;
}

function coverageDimensions(
    bookkeeping: BookkeepingSnapshot,
    shipments: Snapshot,
    returns: Snapshot,
    production: Snapshot,
): CogsCoverageDimension[] {
    const dimensions: CogsCoverageDimension[] = [
        dimension(
            'PNL_COGS_JOURNAL_MATCH',
            Math.abs(bookkeeping.difference) <= 0.01 ? 'covered' : 'partial',
            Math.abs(bookkeeping.difference) <= 0.01
                ? 'Total COGS laporan cocok dengan jurnal POSTED kategori COGS pada batas WIB yang sama.'
                : `Selisih COGS laporan vs jurnal ${bookkeeping.difference.toFixed(2)} perlu ditelusuri.`,
        ),
        dimension(
            'SHIPMENT_COHORT',
            shipments.readable ? 'covered' : 'missing',
            shipments.readable
                ? 'Seluruh shipment OUT pada batas WIB dievaluasi sebelum sampel dibatasi.'
                : 'Hasil cohort shipment tidak dapat dibaca.',
        ),
        dimension(
            'SHIPMENT_REVERSAL_ATTRIBUTION',
            !shipments.readable
                ? 'missing'
                : shipments.metrics.legacyAttributionCount > 0
                  ? 'missing'
                  : 'covered',
            shipments.metrics.legacyAttributionCount > 0
                ? 'Ada referensi shipment legacy yang tidak dapat dipasangkan ke DO secara eksak.'
                : 'Reversal shipment dipasangkan hanya melalui referensi standar dan marker DO eksak.',
        ),
        dimension(
            'SHIPMENT_HISTORICAL_VALUATION',
            !shipments.readable
                ? 'missing'
                : shipments.metrics.historicalFallbackUnknownCount > 0
                  ? 'partial'
                  : 'covered',
            shipments.metrics.historicalFallbackUnknownCount > 0
                ? 'Jurnal menyimpan nilai historis, tetapi movement tidak menyimpan cabang fallback valuasi yang digunakan.'
                : 'Movement bernilai eksplisit atau tidak ada shipment aktif yang memerlukan atribusi fallback.',
        ),
        dimension(
            'RETURN_PHYSICAL',
            returns.readable ? 'covered' : 'missing',
            returns.readable
                ? 'Receipt GOOD dan DAMAGED dievaluasi terpisah melalui FK penerimaan.'
                : 'Hasil cohort penerimaan retur tidak dapat dibaca.',
        ),
        dimension(
            'RETURN_COMMERCIAL',
            returns.readable ? 'covered' : 'missing',
            returns.readable
                ? 'SalesReturnCredit dan CustomerCreditNote aktif maupun historis dievaluasi terpisah.'
                : 'Hasil cohort kredit retur tidak dapat dibaca.',
        ),
        dimension(
            'RETURN_COST_VECTOR',
            !returns.readable
                ? 'missing'
                : returns.metrics.unresolvedPhysicalVectorCount > 0
                  ? 'partial'
                  : 'covered',
            returns.metrics.unresolvedPhysicalVectorCount > 0
                ? 'Ada penerimaan GOOD tanpa movement/jurnal historis yang dapat divalidasi penuh.'
                : 'Movement dan jurnal reversal biaya retur GOOD divalidasi terhadap nilai historis.',
        ),
        dimension(
            'RETURN_COMMERCIAL_VECTOR',
            !returns.readable
                ? 'missing'
                : returns.metrics.unresolvedCommercialVectorCount > 0
                  ? 'partial'
                  : 'covered',
            returns.metrics.unresolvedCommercialVectorCount > 0
                ? 'Ada kredit/reversal komersial tanpa vector jurnal yang dapat divalidasi penuh.'
                : 'Jurnal kredit komersial aktif/reversed divalidasi balance, nilai, reference, dan inverse vector.',
        ),
        dimension(
            'PRODUCTION_MOVEMENTS',
            production.readable ? 'covered' : 'missing',
            production.readable
                ? 'Issue, output, scrap, return-in, adjustment, dan Maklon dibedakan.'
                : 'Hasil cohort movement produksi tidak dapat dibaca.',
        ),
        dimension(
            'PRODUCTION_REVERSAL_ATTRIBUTION',
            !production.readable
                ? 'missing'
                : production.metrics.ambiguousReversalCount > 0
                  ? 'missing'
                  : production.metrics.legacyUniqueReversalCount > 0
                    ? 'partial'
                    : 'covered',
            production.metrics.ambiguousReversalCount > 0
                ? 'Ada reversal produksi legacy dengan lebih dari satu kandidat sumber.'
                : production.metrics.legacyUniqueReversalCount > 0
                  ? 'Ada pairing legacy yang unik tetapi tidak memiliki marker SOURCE.'
                  : 'Pairing reversal produksi memakai marker SOURCE eksak.',
        ),
        dimension(
            'JOURNAL_ATTRIBUTION',
            !production.readable || !shipments.readable
                ? 'missing'
                : production.metrics.semanticRoleUnknownCount > 0
                  ? 'partial'
                  : 'covered',
            production.metrics.semanticRoleUnknownCount > 0
                ? 'Akun produksi sama-sama bertipe ASSET dan mapping WIP/inventory eksplisit tidak tersimpan untuk sebagian movement; vector nominal tetap diperiksa, tetapi peran GL ambigu.'
                : 'Jurnal movement ditautkan dengan MANUAL_ENTRY/referenceId movement dan mapping akun eksplisit tersedia untuk cohort produksi.',
        ),
    ];

    const crossPeriod =
        returns.metrics.crossPeriodCount > 0 ||
        production.metrics.outputIssueOutsideCount > 0 ||
        production.metrics.issueOutputOutsideCount > 0;
    const openingExposure =
        production.metrics.issueCount > 0 ||
        production.metrics.outputCount > 0 ||
        production.metrics.shipmentCount > 0;
    dimensions.push(
        dimension(
            'OPENING_AND_CROSS_PERIOD',
            crossPeriod || openingExposure ? 'partial' : 'covered',
            crossPeriod
                ? 'Ada aliran yang menyeberangi batas periode; opening inventory/WIP tidak direkonstruksi.'
                : openingExposure
                  ? 'Flow periode teramati, tetapi opening inventory/WIP tidak direkonstruksi sehingga ini bukan roll-forward nilai penuh.'
                  : 'Tidak ada flow produksi/shipment yang memerlukan opening inventory atau WIP dalam cohort.',
        ),
    );
    const sideFlows =
        shipments.metrics.offBalanceCount > 0 ||
        production.metrics.maklonCount > 0 ||
        production.metrics.scrapCount > 0 ||
        production.metrics.adjustmentCount > 0 ||
        production.metrics.returnInCount > 0;
    dimensions.push(
        dimension(
            'SIDE_FLOWS',
            sideFlows ? 'partial' : 'covered',
            sideFlows
                ? 'Maklon/off-balance, scrap, return-in, atau adjustment dilaporkan terpisah dan tidak dicampur ke biaya produksi.'
                : 'Tidak ada side flow dalam periode yang memerlukan pemisahan basis.',
        ),
    );
    const hasBridge =
        production.metrics.shipmentCount > 0 &&
        production.metrics.outputCount > 0;
    dimensions.push(
        dimension(
            'PRODUCTION_TO_SHIPMENT_LINEAGE',
            hasBridge ? 'partial' : 'covered',
            hasBridge
                ? 'Schema tidak memiliki lot/source link output produksi ke shipment; jembatan hanya agregat.'
                : 'Tidak ada pasangan cohort output dan shipment yang memerlukan klaim lineage.',
        ),
    );
    const sampleTruncated = [shipments, returns, production].some((snapshot) =>
        snapshot.findings.some((finding) => finding.count > finding.samples.length),
    );
    dimensions.push(
        dimension(
            'BOUNDED_SAMPLES',
            sampleTruncated ? 'partial' : 'covered',
            sampleTruncated
                ? `Sampel penyebab dibatasi ${SAMPLE_LIMIT}; count dan nominal tetap seluruh cohort.`
                : 'Seluruh penyebab cohort muat dalam batas sampel stabil.',
        ),
    );
    return dimensions;
}

function enrichFindings(
    snapshots: Snapshot[],
    nominalRevenue: number,
): CogsDiagnosisFinding[] {
    return snapshots
        .flatMap((snapshot) => snapshot.findings)
        .map((finding) => ({
            ...finding,
            conditionStatus: 'confirmed' as const,
            accountingConclusion: 'needs_review' as const,
            nominal: finding.amount,
            revenuePercentage:
                nominalRevenue > 0
                    ? (Math.abs(finding.amount) / nominalRevenue) * 100
                    : null,
            sourceId: finding.samples[0]?.sourceId ?? null,
        }))
        .sort(
            (a, b) =>
                b.materiality - a.materiality ||
                a.code.localeCompare(b.code) ||
                (a.sourceId ?? '').localeCompare(b.sourceId ?? ''),
        );
}

export function assembleCogsEconomicDiagnosis(
    range: ReturnType<typeof financeRange>,
    rows: { shipments: SnapshotRow[]; returns: SnapshotRow[]; production: SnapshotRow[] },
    bookkeeping: BookkeepingSnapshot = { reportCogs: 0, journalCogs: 0, difference: 0 },
) {
    const shipmentSnapshot = parseSnapshot(rows.shipments);
    const returnSnapshot = parseSnapshot(rows.returns);
    const productionSnapshot = parseSnapshot(rows.production);
    const dimensions = coverageDimensions(
        bookkeeping,
        shipmentSnapshot,
        returnSnapshot,
        productionSnapshot,
    );
    const cap = confidenceCap(dimensions);
    const nominalRevenue = shipmentSnapshot.metrics.nominalRevenue ?? 0;
    const findings = enrichFindings(
        [shipmentSnapshot, returnSnapshot, productionSnapshot],
        nominalRevenue,
    );
    if (Math.abs(bookkeeping.difference) > 0.01) {
        findings.push({
            code: 'PNL_COGS_JOURNAL_MISMATCH',
            conditionStatus: 'confirmed',
            accountingConclusion: 'needs_review',
            area: 'bookkeeping',
            amountBasis: 'pnl_vs_posted_cogs_journal',
            count: 1,
            amount: bookkeeping.difference,
            nominal: bookkeeping.difference,
            revenuePercentage:
                nominalRevenue > 0
                    ? (Math.abs(bookkeeping.difference) / nominalRevenue) * 100
                    : null,
            sourceId: null,
            materiality: Math.abs(bookkeeping.difference),
            reason: 'Total laporan COGS berbeda dari agregat jurnal POSTED kategori COGS pada periode WIB yang sama.',
            evidenceLimit: 'Periksa report/category/source journal; diagnosis tidak mengubah data.',
            samples: [],
        });
        findings.sort((a, b) => b.materiality - a.materiality || a.code.localeCompare(b.code));
    }

    const limitations = [
        'Kesamaan P&L COGS dengan jurnal kategori COGS hanya membuktikan konsistensi pembukuan/kategori, bukan kelengkapan biaya ekonomi.',
        'Nilai movement, nilai jurnal, nilai komersial retur, dan nominal penjualan adalah basis berbeda dan tidak dijumlahkan.',
        'Movement shipment biasanya tidak menyimpan sumber fallback historis; nilai variant saat ini bukan bukti historis.',
        'Tidak ada lineage lot output-produksi ke shipment; phase bridge bersifat agregat dan tidak membuktikan kausalitas per unit.',
        'Opening inventory, routed WIP, dan event di luar periode hanya ditandai sebagai batas/cross-period, bukan direkonstruksi.',
    ];

    return {
        range,
        bookkeeping,
        coverage: {
            mandatoryComplete: dimensions.every((item) => item.status === 'covered'),
            confidenceCap: cap,
            dimensions,
        },
        findings,
        shipments: {
            count: shipmentSnapshot.metrics.cohortCount ?? 0,
            activeCount: shipmentSnapshot.metrics.activeCount ?? 0,
            coveredCount: shipmentSnapshot.metrics.coveredCount ?? 0,
            reversedCount: shipmentSnapshot.metrics.reversedCount ?? 0,
            offBalanceCount: shipmentSnapshot.metrics.offBalanceCount ?? 0,
            quantity: shipmentSnapshot.metrics.quantity ?? 0,
            nominalSalesValue: nominalRevenue,
            postedCogsValue: shipmentSnapshot.metrics.postedCogs ?? 0,
            incompleteSalesValue:
                shipmentSnapshot.metrics.incompleteSalesValue ?? 0,
            explicitMovementValue: {
                amount: shipmentSnapshot.metrics.explicitMovementValue ?? 0,
                knownCount: shipmentSnapshot.metrics.explicitMovementKnownCount ?? 0,
            },
            historicalFallbackUnknownCount:
                shipmentSnapshot.metrics.historicalFallbackUnknownCount ?? 0,
        },
        returns: {
            count: returnSnapshot.metrics.cohortCount ?? 0,
            cohortBasis: {
                physicalReceiptInRange:
                    returnSnapshot.metrics.physicalInRangeCount ?? 0,
                completedStateUpdatedInRange:
                    returnSnapshot.metrics.completedInRangeCount ?? 0,
            },
            goodReceiptCount: returnSnapshot.metrics.goodReceiptCount ?? 0,
            damagedReceiptCount:
                returnSnapshot.metrics.damagedReceiptCount ?? 0,
            physicalRestockValue:
                returnSnapshot.metrics.physicalRestockValue ?? 0,
            activeCommercialCreditValue:
                returnSnapshot.metrics.activeCommercialCreditValue ?? 0,
            originalPostedRevenue:
                returnSnapshot.metrics.originalPostedRevenue ?? 0,
            completedWithoutActiveCreditCount:
                returnSnapshot.metrics.completedWithoutActiveCreditCount ?? 0,
            crossPeriodCount: returnSnapshot.metrics.crossPeriodCount ?? 0,
        },
        productionFlow: {
            materialIssue: {
                count: productionSnapshot.metrics.issueCount ?? 0,
                quantity: productionSnapshot.metrics.issueQuantity ?? 0,
                movementValue:
                    productionSnapshot.metrics.issueMovementValue ?? 0,
                journalValue:
                    productionSnapshot.metrics.issueJournalValue ?? 0,
            },
            wipToOutput: {
                outputCount: productionSnapshot.metrics.outputCount ?? 0,
                quantity: productionSnapshot.metrics.outputQuantity ?? 0,
                movementValue:
                    productionSnapshot.metrics.outputMovementValue ?? 0,
                journalValue:
                    productionSnapshot.metrics.outputJournalValue ?? 0,
            },
            shipmentCogs: {
                count: productionSnapshot.metrics.shipmentCount ?? 0,
                journalValue:
                    productionSnapshot.metrics.shipmentJournalValue ?? 0,
                attribution: 'aggregate_only' as const,
            },
            returnCost: {
                count: returnSnapshot.metrics.goodReceiptCount ?? 0,
                restockValue:
                    returnSnapshot.metrics.physicalRestockValue ?? 0,
            },
            sideFlows: {
                scrapCount: productionSnapshot.metrics.scrapCount ?? 0,
                returnInCount: productionSnapshot.metrics.returnInCount ?? 0,
                adjustmentCount:
                    productionSnapshot.metrics.adjustmentCount ?? 0,
                maklonOffBalanceCount:
                    productionSnapshot.metrics.maklonCount ?? 0,
            },
            crossPeriod: {
                outputWithIssueOutsideRange:
                    productionSnapshot.metrics.outputIssueOutsideCount ?? 0,
                issueWithOutputOutsideRange:
                    productionSnapshot.metrics.issueOutputOutsideCount ?? 0,
            },
            unattributedShipmentCount:
                productionSnapshot.metrics.unattributedShipmentCount ?? 0,
        },
        limitations,
    };
}

async function shipmentSnapshot(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
): Promise<SnapshotRow[]> {
    return tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        WITH movements AS (
            SELECT m.*, COUNT(*) OVER (PARTITION BY m."salesOrderId", m."productVariantId", m."fromLocationId", m.quantity, m.reference) AS "sourceVectorCount"
            FROM "StockMovement" m
            WHERE m.type = 'OUT' AND m."salesOrderId" IS NOT NULL
                AND m."fromLocationId" IS NOT NULL AND m."toLocationId" IS NULL
                AND m."goodsReceiptId" IS NULL AND m."productionOrderId" IS NULL
                AND m."createdAt" >= ${start} AND m."createdAt" <= ${end}
                AND ${nonClosingReferenceSql(Prisma.sql`m.reference`)}
        ), base AS (
            SELECT m.id, m.quantity, m.cost, m.reference, m."createdAt", m."sourceVectorCount", so."orderType",
                d.id AS "deliveryOrderId",
                COALESCE(dmatch.match_count, 0) AS "deliveryMatchCount",
                COALESCE(sales.nominal, 0) AS "nominalRevenue",
                COALESCE(j.active, 0) AS "activeJournals",
                COALESCE(j.posted_auto, 0) AS "postedAutoJournals",
                COALESCE(j.draft, 0) AS "draftJournals",
                COALESCE(j.debit, 0) AS debit, COALESCE(j.credit, 0) AS credit,
                COALESCE(j.cogs_debit, 0) AS "cogsDebit",
                COALESCE(j.asset_credit, 0) AS "assetCredit",
                COALESCE(rev.pair_count, 0) AS "reversalPairCount",
                CASE WHEN m."sourceVectorCount" = 1 THEN COALESCE(rev.pair_count, 0) ELSE 0 END AS "uniqueReversalCount",
                CASE WHEN m."sourceVectorCount" = 1 THEN COALESCE(rev.valid_count, 0) ELSE 0 END AS "validReversalCount",
                CASE WHEN m."sourceVectorCount" = 1 THEN COALESCE(rev.cross_period_count, 0) ELSE 0 END AS "crossPeriodReversalCount"
            FROM movements m
            JOIN "SalesOrder" so ON so.id = m."salesOrderId"
            LEFT JOIN LATERAL (
                SELECT candidate.id AS delivery_id, COUNT(*) OVER () AS match_count
                FROM "DeliveryOrder" candidate
                WHERE candidate."salesOrderId" = so.id
                    AND m.reference = ('Shipment for ' || so."orderNumber" || ' via ' || candidate."orderNumber")
                ORDER BY candidate.id LIMIT 1
            ) dmatch ON TRUE
            LEFT JOIN "DeliveryOrder" d ON d.id = dmatch.delivery_id AND dmatch.match_count = 1::bigint
            LEFT JOIN LATERAL (
                SELECT CASE WHEN SUM(i.quantity) > 0
                    THEN m.quantity * SUM(i.subtotal) / SUM(i.quantity) ELSE 0 END AS nominal
                FROM "SalesOrderItem" i
                WHERE i."salesOrderId" = so.id AND i."productVariantId" = m."productVariantId"
            ) sales ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE x.status <> 'VOIDED') AS active,
                    COUNT(*) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated") AS posted_auto,
                    COUNT(*) FILTER (WHERE x.status = 'DRAFT') AS draft,
                    COALESCE(SUM(x.debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS debit,
                    COALESCE(SUM(x.credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS credit,
                    COALESCE(SUM(x.cogs_debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS cogs_debit,
                    COALESCE(SUM(x.asset_credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS asset_credit
                FROM (
                    SELECT je.id, je.status, je."isAutoGenerated",
                        SUM(l.debit) AS debit, SUM(l.credit) AS credit,
                        SUM(CASE WHEN a.type = 'EXPENSE' AND a.category = 'COGS' THEN l.debit ELSE 0 END) AS cogs_debit,
                        SUM(CASE WHEN a.type = 'ASSET' THEN l.credit ELSE 0 END) AS asset_credit
                    FROM "JournalEntry" je
                    JOIN "JournalLine" l ON l."journalEntryId" = je.id
                    JOIN "Account" a ON a.id = l."accountId"
                    WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = m.id
                        AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                    GROUP BY je.id
                ) x
            ) j ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS pair_count,
                    COUNT(*) FILTER (WHERE r."createdAt" < ${start} OR r."createdAt" > ${end}) AS cross_period_count,
                    COUNT(*) FILTER (WHERE r."createdAt" >= ${start} AND r."createdAt" <= ${end}
                        AND COALESCE(rj.active, 0) = 1 AND COALESCE(rj.posted_auto, 0) = 1
                        AND COALESCE(rj.debit, 0) = COALESCE(rj.credit, 0)
                        AND COALESCE(rj.debit, 0) > 0
                        AND COALESCE(rj.cogs_credit, 0) > 0
                        AND COALESCE(rj.asset_debit, 0) = COALESCE(rj.cogs_credit, 0)) AS valid_count
                FROM "StockMovement" r
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) FILTER (WHERE x.status <> 'VOIDED') AS active,
                        COUNT(*) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated") AS posted_auto,
                        COALESCE(SUM(x.debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS debit,
                        COALESCE(SUM(x.credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS credit,
                        COALESCE(SUM(x.cogs_credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS cogs_credit,
                        COALESCE(SUM(x.asset_debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS asset_debit
                    FROM (
                        SELECT je.id, je.status, je."isAutoGenerated", SUM(l.debit) debit, SUM(l.credit) credit,
                            SUM(CASE WHEN a.type = 'EXPENSE' AND a.category = 'COGS' THEN l.credit ELSE 0 END) cogs_credit,
                            SUM(CASE WHEN a.type = 'ASSET' THEN l.debit ELSE 0 END) asset_debit
                        FROM "JournalEntry" je JOIN "JournalLine" l ON l."journalEntryId" = je.id
                        JOIN "Account" a ON a.id = l."accountId"
                        WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = r.id
                            AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                        GROUP BY je.id
                    ) x
                ) rj ON TRUE
                WHERE d.id IS NOT NULL AND r.type = 'IN'
                    AND r."salesOrderId" = m."salesOrderId"
                    AND r."productVariantId" = m."productVariantId"
                    AND r."toLocationId" = m."fromLocationId" AND r."fromLocationId" IS NULL
                    AND r."goodsReceiptId" IS NULL AND r."productionOrderId" IS NULL
                    AND r.quantity = m.quantity
                    AND r.reference = ('VOID: ' || m.reference || ' [SOURCE:' || d.id || ']')
            ) rev ON TRUE
        ), classified AS (
            SELECT *,
                CASE
                    WHEN "orderType" = 'MAKLON_JASA' THEN 'SHIPMENT_OFF_BALANCE_EXCLUDED'
                    WHEN "validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1
                        AND "cogsDebit" > 0 AND "assetCredit" = "cogsDebit" THEN 'SHIPMENT_REVERSAL_EXCLUDED'
                    WHEN "crossPeriodReversalCount" > 0 THEN 'SHIPMENT_REVERSAL_CROSS_PERIOD'
                    WHEN "reversalPairCount" > 0 THEN 'SHIPMENT_REVERSAL_INVALID'
                    WHEN "draftJournals" > 0 AND "postedAutoJournals" = 0 THEN 'SHIPMENT_JOURNAL_NOT_POSTED'
                    WHEN "activeJournals" = 0 AND (cost IS NULL OR cost * quantity = 0) THEN 'ZERO_VALUED_SALES_SHIPMENT'
                    WHEN "activeJournals" = 0 THEN 'SHIPMENT_JOURNAL_MISSING'
                    WHEN "activeJournals" <> 1 OR "postedAutoJournals" <> 1 THEN 'SHIPMENT_JOURNAL_MULTIPLE_OR_INVALID'
                    WHEN debit <> credit THEN 'SHIPMENT_JOURNAL_UNBALANCED'
                    WHEN "cogsDebit" <= 0 AND debit > 0 THEN 'SHIPMENT_COST_OUTSIDE_COGS'
                    WHEN "assetCredit" <= 0 OR "cogsDebit" <> "assetCredit" THEN 'SHIPMENT_JOURNAL_VECTOR_INVALID'
                    WHEN cost IS NOT NULL AND ABS(cost * quantity - "cogsDebit") > 0.01 THEN 'SHIPMENT_EXPLICIT_COST_MISMATCH'
                    ELSE 'SHIPMENT_COVERED_COGS'
                END AS code
            FROM base
        ), finding_rows AS (
            SELECT id AS "sourceId", code, 'shipment'::text AS area,
                CASE WHEN code IN ('SHIPMENT_COST_OUTSIDE_COGS', 'SHIPMENT_JOURNAL_VECTOR_INVALID', 'SHIPMENT_JOURNAL_UNBALANCED', 'SHIPMENT_JOURNAL_MULTIPLE_OR_INVALID') AND debit <> 0 THEN 'posted_cost_journal'
                     WHEN "cogsDebit" <> 0 THEN 'posted_cogs_journal'
                     WHEN cost IS NOT NULL THEN 'explicit_movement_cost'
                     ELSE 'nominal_sales_order_allocation' END AS "amountBasis",
                CASE WHEN code IN ('SHIPMENT_COST_OUTSIDE_COGS', 'SHIPMENT_JOURNAL_VECTOR_INVALID', 'SHIPMENT_JOURNAL_UNBALANCED', 'SHIPMENT_JOURNAL_MULTIPLE_OR_INVALID') AND debit <> 0 THEN debit
                     WHEN "cogsDebit" <> 0 THEN "cogsDebit"
                     WHEN cost IS NOT NULL THEN cost * quantity ELSE "nominalRevenue" END AS amount,
                ABS(CASE WHEN code IN ('SHIPMENT_COST_OUTSIDE_COGS', 'SHIPMENT_JOURNAL_VECTOR_INVALID', 'SHIPMENT_JOURNAL_UNBALANCED', 'SHIPMENT_JOURNAL_MULTIPLE_OR_INVALID') AND debit <> 0 THEN debit
                     WHEN "cogsDebit" <> 0 THEN "cogsDebit"
                     WHEN cost IS NOT NULL THEN cost * quantity ELSE "nominalRevenue" END) AS materiality,
                CASE code
                    WHEN 'SHIPMENT_OFF_BALANCE_EXCLUDED' THEN 'Shipment Maklon adalah cohort off-balance; journal movement tidak diharapkan.'
                    WHEN 'SHIPMENT_REVERSAL_EXCLUDED' THEN 'Shipment memiliki reversal movement dan jurnal exact-inverse valid dalam periode.'
                    WHEN 'SHIPMENT_REVERSAL_CROSS_PERIOD' THEN 'Shipment dibalik di luar periode; shipment asal tetap dipertahankan dalam cohort periode.'
                    WHEN 'SHIPMENT_REVERSAL_INVALID' THEN 'Movement reversal ditemukan tetapi jurnal exact-inverse belum valid/unik.'
                    WHEN 'SHIPMENT_JOURNAL_NOT_POSTED' THEN 'Hanya jurnal DRAFT ditemukan untuk movement shipment.'
                    WHEN 'ZERO_VALUED_SALES_SHIPMENT' THEN 'Penjualan shipment bernilai biaya nol/tidak tersedia; konfirmasi kebijakan by-product/scrap diperlukan.'
                    WHEN 'SHIPMENT_JOURNAL_MISSING' THEN 'Movement memiliki cost eksplisit tetapi tidak memiliki jurnal aktif.'
                    WHEN 'SHIPMENT_JOURNAL_MULTIPLE_OR_INVALID' THEN 'Jumlah/status/auto-generated jurnal movement bukan tepat satu POSTED auto journal.'
                    WHEN 'SHIPMENT_JOURNAL_UNBALANCED' THEN 'Total debit dan kredit jurnal shipment tidak sama.'
                    WHEN 'SHIPMENT_COST_OUTSIDE_COGS' THEN 'Biaya shipment terposting ke akun debit di luar kategori COGS.'
                    WHEN 'SHIPMENT_JOURNAL_VECTOR_INVALID' THEN 'Sisi kredit inventory/ASSET tidak seimbang dengan debit COGS.'
                    ELSE 'Cost eksplisit movement berbeda dari debit COGS historis lebih dari Rp0,01.' END AS reason,
                CASE WHEN cost IS NULL THEN 'Cabang fallback historis (standardCost/buyPrice/price) tidak disimpan.'
                     ELSE 'Kesimpulan kebijakan atau koreksi akun tetap memerlukan review Finance.' END AS "evidenceLimit"
            FROM classified WHERE code <> 'SHIPMENT_COVERED_COGS'
            UNION ALL
            SELECT id, 'SHIPMENT_LEGACY_REFERENCE_UNATTRIBUTED', 'shipment', 'none', 0,
                ABS("nominalRevenue"),
                'Referensi movement tidak cocok persis dengan format Shipment for SO via DO.',
                'DO/reversal tidak ditebak dari kemiripan teks; cohort ini menurunkan coverage.'
            FROM classified WHERE "deliveryOrderId" IS NULL
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY materiality DESC, "sourceId") AS rn
            FROM finding_rows
        ), grouped AS (
            SELECT code, area, "amountBasis", COUNT(*) AS count, SUM(amount) AS amount,
                MAX(materiality) AS materiality, MIN(reason) AS reason, MIN("evidenceLimit") AS "evidenceLimit",
                jsonb_agg(jsonb_build_object('sourceId', "sourceId", 'materiality', materiality::text,
                    'amount', amount::text, 'reason', reason) ORDER BY materiality DESC, "sourceId") FILTER (WHERE rn <= ${SAMPLE_LIMIT}) AS samples
            FROM ranked GROUP BY code, area, "amountBasis"
        )
        SELECT jsonb_build_object(
            'metrics', jsonb_build_object(
                'cohortCount', COUNT(*),
                'activeCount', COUNT(*) FILTER (WHERE "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)),
                'coveredCount', COUNT(*) FILTER (WHERE code = 'SHIPMENT_COVERED_COGS'),
                'reversedCount', COUNT(*) FILTER (WHERE code = 'SHIPMENT_REVERSAL_EXCLUDED'),
                'offBalanceCount', COUNT(*) FILTER (WHERE code = 'SHIPMENT_OFF_BALANCE_EXCLUDED'),
                'quantity', COALESCE(SUM(quantity) FILTER (WHERE "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)), 0)::text,
                'nominalRevenue', COALESCE(SUM("nominalRevenue") FILTER (WHERE "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)), 0)::text,
                'postedCogs', COALESCE(SUM("cogsDebit") FILTER (WHERE "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)), 0)::text,
                'explicitMovementValue', COALESCE(SUM(cost * quantity) FILTER (WHERE cost IS NOT NULL AND "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)), 0)::text,
                'explicitMovementKnownCount', COUNT(*) FILTER (WHERE cost IS NOT NULL AND "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)),
                'historicalFallbackUnknownCount', COUNT(*) FILTER (WHERE cost IS NULL AND "orderType" <> 'MAKLON_JASA' AND NOT ("validReversalCount" = 1 AND "uniqueReversalCount" = 1 AND "reversalPairCount" = 1)),
                'legacyAttributionCount', COUNT(*) FILTER (WHERE "deliveryMatchCount" <> 1),
                'incompleteSalesValue', COALESCE(SUM("nominalRevenue") FILTER (WHERE code NOT IN ('SHIPMENT_COVERED_COGS', 'SHIPMENT_REVERSAL_EXCLUDED', 'SHIPMENT_OFF_BALANCE_EXCLUDED')), 0)::text
            ),
            'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code', code, 'area', area, 'amountBasis', "amountBasis", 'count', count,
                'amount', amount::text, 'materiality', materiality::text, 'reason', reason,
                'evidenceLimit', "evidenceLimit", 'samples', samples
            ) ORDER BY materiality DESC, code) FROM grouped), '[]'::jsonb)
        ) AS payload
        FROM classified
    `);
}

async function returnSnapshot(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
): Promise<SnapshotRow[]> {
    return tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        WITH events AS (
            SELECT r.*,
                EXISTS (SELECT 1 FROM "SalesReturnItem" i JOIN "SalesReturnReceiptLine" rl ON rl."returnItemId" = i.id
                    WHERE i."salesReturnId" = r.id AND rl."receivedAt" >= ${start} AND rl."receivedAt" <= ${end}) AS "physicalInRange",
                EXISTS (SELECT 1 FROM "AuditLog" audit
                    WHERE audit."entityType" = 'SalesReturn' AND audit."entityId" = r.id
                        AND audit."toStatus" = 'COMPLETED'
                        AND audit."createdAt" >= ${start} AND audit."createdAt" <= ${end}) AS "completedInRange"
            FROM "SalesReturn" r
            WHERE (EXISTS (SELECT 1 FROM "SalesReturnItem" i JOIN "SalesReturnReceiptLine" rl ON rl."returnItemId" = i.id
                    WHERE i."salesReturnId" = r.id AND rl."receivedAt" >= ${start} AND rl."receivedAt" <= ${end})
                OR EXISTS (SELECT 1 FROM "AuditLog" audit
                    WHERE audit."entityType" = 'SalesReturn' AND audit."entityId" = r.id
                        AND audit."toStatus" = 'COMPLETED'
                        AND audit."createdAt" >= ${start} AND audit."createdAt" <= ${end}))
                AND ${nonClosingReferenceSql(Prisma.sql`r."returnNumber"`)}
        ), base AS (
            SELECT r.id, r.status, r."totalAmount", r."physicalInRange", r."completedInRange",
                COALESCE(receipts.good_count, 0) AS "goodReceiptCount",
                COALESCE(receipts.damaged_count, 0) AS "damagedReceiptCount",
                COALESCE(receipts.restock_value, 0) AS "restockValue",
                COALESCE(receipts.good_zero_count, 0) AS "goodZeroCount",
                COALESCE(receipts.good_invalid_count, 0) AS "goodInvalidCount",
                COALESCE(receipts.good_invalid_value, 0) AS "goodInvalidValue",
                c.id AS "creditId", c.status AS "creditStatus", c."totalAmount" AS "creditAmount", c."postedAt",
                cj.status AS "creditJournalStatus", cj."referenceType" AS "creditJournalReferenceType", cj."referenceId" AS "creditJournalReferenceId",
                cj."isAutoGenerated" AS "creditJournalAuto", cvec.debit AS "creditDebit", cvec.credit AS "creditCredit", cvec.asset_credit AS "creditAssetCredit",
                crj.status AS "creditReversalJournalStatus", crj."referenceType" AS "creditReversalReferenceType", crj."referenceId" AS "creditReversalReferenceId", crj."isAutoGenerated" AS "creditReversalAuto",
                crvec.debit AS "creditReversalDebit", crvec.credit AS "creditReversalCredit", COALESCE(crvec.inverse_mismatch, 0) AS "creditInverseMismatch",
                n.id AS "noteId", n.status AS "noteStatus", n."totalAmount" AS "noteAmount", n."postingDate",
                nj.status AS "noteJournalStatus", nj."referenceType" AS "noteJournalReferenceType", nj."referenceId" AS "noteJournalReferenceId",
                nj."isAutoGenerated" AS "noteJournalAuto", nvec.debit AS "noteDebit", nvec.credit AS "noteCredit", nvec.liability_credit AS "noteLiabilityCredit",
                nrj.status AS "noteReversalJournalStatus", nrj."referenceType" AS "noteReversalReferenceType", nrj."referenceId" AS "noteReversalReferenceId", nrj."isAutoGenerated" AS "noteReversalAuto",
                nrvec.debit AS "noteReversalDebit", nrvec.credit AS "noteReversalCredit", COALESCE(nrvec.inverse_mismatch, 0) AS "noteInverseMismatch",
                COALESCE(revenue.invoice_count, 0) AS "invoiceCount",
                COALESCE(revenue.posted_revenue, 0) AS "originalPostedRevenue"
            FROM events r
            LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE i.condition = 'GOOD') AS good_count,
                    COUNT(*) FILTER (WHERE i.condition = 'DAMAGED') AS damaged_count,
                    COALESCE(SUM(rl."restockValue") FILTER (WHERE i.condition = 'GOOD'), 0) AS restock_value,
                    COUNT(*) FILTER (WHERE i.condition = 'GOOD' AND rl."restockValue" = 0) AS good_zero_count,
                    COUNT(*) FILTER (WHERE i.condition = 'GOOD' AND rl."restockValue" > 0 AND NOT COALESCE(valid.valid, false)) AS good_invalid_count,
                    COALESCE(SUM(rl."restockValue") FILTER (WHERE i.condition = 'GOOD' AND rl."restockValue" > 0 AND NOT COALESCE(valid.valid, false)), 0) AS good_invalid_value
                FROM "SalesReturnItem" i
                JOIN "SalesReturnReceiptLine" rl ON rl."returnItemId" = i.id
                LEFT JOIN LATERAL (
                    SELECT (rl."movementId" IS NOT NULL AND rl."journalId" IS NOT NULL
                        AND m.type = 'RETURN_IN' AND m.id = rl."movementId"
                        AND m."productVariantId" = i."productVariantId"
                        AND m."salesOrderId" = r."salesOrderId"
                        AND m."fromLocationId" IS NULL AND m."toLocationId" = r."returnLocationId"
                        AND m.quantity = rl.quantity
                        AND je.status = 'POSTED' AND je."isAutoGenerated"
                        AND je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = m.id
                        AND vec.debit = rl."restockValue" AND vec.credit = rl."restockValue"
                        AND vec.inventory_debit = rl."restockValue" AND vec.cogs_credit = rl."restockValue") AS valid
                    FROM "StockMovement" m JOIN "JournalEntry" je ON je.id = rl."journalId"
                    JOIN LATERAL (
                        SELECT SUM(l.debit) debit, SUM(l.credit) credit,
                            SUM(CASE WHEN a.type = 'ASSET' THEN l.debit ELSE 0 END) inventory_debit,
                            SUM(CASE WHEN a.type = 'EXPENSE' AND a.category = 'COGS' THEN l.credit ELSE 0 END) cogs_credit
                        FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
                        WHERE l."journalEntryId" = je.id
                    ) vec ON TRUE
                    WHERE m.id = rl."movementId" AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                ) valid ON TRUE
                WHERE i."salesReturnId" = r.id
            ) receipts ON TRUE
            LEFT JOIN "SalesReturnCredit" c ON c."salesReturnId" = r.id
            LEFT JOIN "JournalEntry" cj ON cj.id = c."journalId" AND ${nonClosingReferenceSql(Prisma.sql`cj.reference`)}
            LEFT JOIN LATERAL (
                SELECT SUM(l.debit) debit, SUM(l.credit) credit,
                    SUM(CASE WHEN a.type = 'ASSET' THEN l.credit ELSE 0 END) asset_credit
                FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
                WHERE l."journalEntryId" = cj.id
            ) cvec ON TRUE
            LEFT JOIN "JournalEntry" crj ON crj.id = c."reversalJournalId" AND ${nonClosingReferenceSql(Prisma.sql`crj.reference`)}
            LEFT JOIN LATERAL (
                SELECT (SELECT SUM(debit) FROM "JournalLine" WHERE "journalEntryId" = crj.id) debit,
                    (SELECT SUM(credit) FROM "JournalLine" WHERE "journalEntryId" = crj.id) credit,
                    (SELECT COUNT(*) FROM (
                        SELECT "accountId" FROM "JournalLine"
                        WHERE "journalEntryId" IN (cj.id, crj.id) GROUP BY "accountId"
                        HAVING SUM(debit - credit) <> 0
                    ) mismatch) inverse_mismatch
            ) crvec ON TRUE
            LEFT JOIN "CustomerCreditNote" n ON n."salesReturnId" = r.id
            LEFT JOIN "JournalEntry" nj ON nj.id = n."journalId" AND ${nonClosingReferenceSql(Prisma.sql`nj.reference`)}
            LEFT JOIN LATERAL (
                SELECT SUM(l.debit) debit, SUM(l.credit) credit,
                    SUM(CASE WHEN a.type = 'LIABILITY' THEN l.credit ELSE 0 END) liability_credit
                FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
                WHERE l."journalEntryId" = nj.id
            ) nvec ON TRUE
            LEFT JOIN "JournalEntry" nrj ON nrj.id = n."reversalJournalId" AND ${nonClosingReferenceSql(Prisma.sql`nrj.reference`)}
            LEFT JOIN LATERAL (
                SELECT (SELECT SUM(debit) FROM "JournalLine" WHERE "journalEntryId" = nrj.id) debit,
                    (SELECT SUM(credit) FROM "JournalLine" WHERE "journalEntryId" = nrj.id) credit,
                    (SELECT COUNT(*) FROM (
                        SELECT "accountId" FROM "JournalLine"
                        WHERE "journalEntryId" IN (nj.id, nrj.id) GROUP BY "accountId"
                        HAVING SUM(debit - credit) <> 0
                    ) mismatch) inverse_mismatch
            ) nrvec ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT i.id) AS invoice_count,
                    COALESCE(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit ELSE 0 END), 0) AS posted_revenue
                FROM "Invoice" i
                LEFT JOIN "JournalEntry" je ON je."referenceType" = 'SALES_INVOICE' AND je."referenceId" = i.id
                    AND je.status = 'POSTED' AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                LEFT JOIN "JournalLine" l ON l."journalEntryId" = je.id
                LEFT JOIN "Account" a ON a.id = l."accountId"
                WHERE i."salesOrderId" = r."salesOrderId"
            ) revenue ON TRUE
        ), finding_rows AS (
            SELECT id AS "sourceId", 'RETURN_GOOD_COST_REVERSAL_MISSING'::text AS code, 'return'::text AS area,
                'historical_restock_value'::text AS "amountBasis", "goodInvalidValue" AS amount,
                ABS("goodInvalidValue") AS materiality,
                'Receipt GOOD bernilai positif tidak memiliki movement/jurnal reversal HPP yang valid.' AS reason,
                'Kondisi terkonfirmasi; akun/koreksi tetap memerlukan review Finance.' AS "evidenceLimit"
            FROM base WHERE "goodInvalidCount" > 0
            UNION ALL SELECT id, 'RETURN_GOOD_ZERO_OR_UNAVAILABLE_VALUE', 'return', 'historical_restock_value', 0,
                ABS(COALESCE("totalAmount", 0)),
                'Receipt GOOD tercatat dengan restockValue nol.',
                'Tidak boleh diganti dengan current standard cost; nilai historis perlu ditinjau.'
            FROM base WHERE "goodZeroCount" > 0
            UNION ALL SELECT id, 'RETURN_DAMAGED_NO_RESTOCK_EXPECTED', 'return', 'none', 0,
                ABS(COALESCE("totalAmount", 0)),
                'Receipt DAMAGED sengaja tidak membuat stock movement atau reversal HPP.',
                'Ini bukan missing journal; perlakuan kebijakan barang rusak tetap needs_review.'
            FROM base WHERE "damagedReceiptCount" > 0
            UNION ALL SELECT id, 'COMPLETED_RETURN_WITHOUT_COMMERCIAL_CREDIT', 'return', 'commercial_return_value', COALESCE("totalAmount", 0),
                ABS(COALESCE("totalAmount", 0)),
                'Retur COMPLETED tidak memiliki SalesReturnCredit atau CustomerCreditNote aktif.',
                'Lifecycle mengizinkan kondisi ini; apakah kredit diwajibkan adalah keputusan accounting/policy.'
            FROM base WHERE status = 'COMPLETED' AND COALESCE("creditStatus"::text, '') <> 'POSTED' AND COALESCE("noteStatus"::text, '') <> 'POSTED'
            UNION ALL SELECT id, 'COGS_REVERSAL_WITHOUT_COMMERCIAL_REVERSAL', 'return', 'commercial_return_value', COALESCE("totalAmount", 0),
                ABS(COALESCE("totalAmount", 0)),
                'Retur GOOD telah membalik biaya/HPP tetapi belum memiliki pembalikan revenue/customer credit aktif.',
                'Asimetri terkonfirmasi pada cohort; timing/kebijakan koreksi tetap needs_review.'
            FROM base WHERE "goodReceiptCount" > 0 AND "restockValue" > 0
                AND COALESCE("creditStatus"::text, '') <> 'POSTED' AND COALESCE("noteStatus"::text, '') <> 'POSTED'
            UNION ALL SELECT id, 'RETURN_COMMERCIAL_CREDIT_CROSS_PERIOD', 'return', 'commercial_credit_value',
                COALESCE("creditAmount", "noteAmount", 0), ABS(COALESCE("creditAmount", "noteAmount", 0)),
                'Kredit komersial aktif diposting di luar periode event retur.',
                'Cross-period bukan missing credit dan tidak ditambahkan ke nilai restock/HPP.'
            FROM base WHERE ("creditStatus" = 'POSTED' AND ("postedAt" < ${start} OR "postedAt" > ${end}))
                OR ("noteStatus" = 'POSTED' AND ("postingDate" < ${start} OR "postingDate" > ${end}))
            UNION ALL SELECT id, 'RETURN_CREDIT_REVERSED_HISTORY', 'return', 'commercial_credit_value',
                COALESCE("creditAmount", "noteAmount", 0), ABS(COALESCE("creditAmount", "noteAmount", 0)),
                'Retur memiliki riwayat kredit REVERSED.',
                'Riwayat reversal bukan kredit aktif dan tidak boleh dihitung sebagai missing physical reversal.'
            FROM base WHERE "creditStatus" = 'REVERSED' OR "noteStatus" = 'REVERSED'
            UNION ALL SELECT id, 'RETURN_CREDIT_REVERSAL_JOURNAL_INVALID', 'return', 'commercial_credit_value',
                COALESCE("creditAmount", "noteAmount", 0), ABS(COALESCE("creditAmount", "noteAmount", 0)),
                'Status kredit REVERSED tidak didukung jurnal pembalikan POSTED yang valid.',
                'Kondisi jurnal terkonfirmasi; dampak dan koreksi accounting tetap needs_review.'
            FROM base WHERE ("creditStatus" = 'REVERSED' AND ("creditReversalJournalStatus" IS DISTINCT FROM 'POSTED'
                    OR "creditReversalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "creditReversalReferenceId" IS DISTINCT FROM "creditId"
                    OR "creditReversalAuto" IS DISTINCT FROM true OR "creditReversalDebit" IS DISTINCT FROM "creditAmount"
                    OR "creditReversalCredit" IS DISTINCT FROM "creditAmount" OR COALESCE("creditInverseMismatch", 1) <> 0))
                OR ("noteStatus" = 'REVERSED' AND ("noteReversalJournalStatus" IS DISTINCT FROM 'POSTED'
                    OR "noteReversalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "noteReversalReferenceId" IS DISTINCT FROM "noteId"
                    OR "noteReversalAuto" IS DISTINCT FROM true OR "noteReversalDebit" IS DISTINCT FROM "noteAmount"
                    OR "noteReversalCredit" IS DISTINCT FROM "noteAmount" OR COALESCE("noteInverseMismatch", 1) <> 0))
            UNION ALL SELECT id, 'RETURN_CREDIT_REVIEW_REQUIRED', 'return', 'commercial_return_value',
                COALESCE("creditAmount", "totalAmount", 0), ABS(COALESCE("creditAmount", "totalAmount", 0)),
                'SalesReturnCredit berada pada REVIEW_REQUIRED.',
                'Status ini adalah evidence review, bukan kredit komersial aktif.'
            FROM base WHERE "creditStatus" = 'REVIEW_REQUIRED'
            UNION ALL SELECT id, 'RETURN_ACTIVE_CREDIT_JOURNAL_INVALID', 'return', 'commercial_credit_value',
                COALESCE("creditAmount", "noteAmount", 0), ABS(COALESCE("creditAmount", "noteAmount", 0)),
                'Kredit aktif tidak memiliki jurnal POSTED dengan reference semantics yang sesuai.',
                'SalesReturnCredit memakai SALES_RETURN/returnId; CustomerCreditNote memakai MANUAL_ENTRY/noteId.'
            FROM base WHERE ("creditStatus" = 'POSTED' AND ("creditJournalStatus" IS DISTINCT FROM 'POSTED' OR "creditJournalReferenceType" IS DISTINCT FROM 'SALES_RETURN' OR "creditJournalReferenceId" IS DISTINCT FROM id
                    OR "creditJournalAuto" IS DISTINCT FROM true OR "creditDebit" IS DISTINCT FROM "creditAmount" OR "creditCredit" IS DISTINCT FROM "creditAmount" OR "creditAssetCredit" IS DISTINCT FROM "creditAmount"))
                OR ("noteStatus" = 'POSTED' AND ("noteJournalStatus" IS DISTINCT FROM 'POSTED' OR "noteJournalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "noteJournalReferenceId" IS DISTINCT FROM "noteId"
                    OR "noteJournalAuto" IS DISTINCT FROM true OR "noteDebit" IS DISTINCT FROM "noteAmount" OR "noteCredit" IS DISTINCT FROM "noteAmount" OR "noteLiabilityCredit" IS DISTINCT FROM "noteAmount"))
            UNION ALL SELECT id, 'RETURN_MULTIPLE_ACTIVE_CREDIT_PATHS', 'return', 'commercial_credit_value',
                COALESCE("creditAmount", 0) + COALESCE("noteAmount", 0), ABS(COALESCE("creditAmount", 0) + COALESCE("noteAmount", 0)),
                'Dua jalur kredit komersial aktif ditemukan untuk satu retur.',
                'Nilai kedua jalur tetap dilaporkan sebagai basis komersial, tidak dicampur dengan restock.'
            FROM base WHERE "creditStatus" = 'POSTED' AND "noteStatus" = 'POSTED'
            UNION ALL SELECT id, 'RETURN_ORIGINAL_REVENUE_UNAVAILABLE', 'return', 'original_posted_revenue', 0,
                ABS(COALESCE("totalAmount", 0)),
                'Invoice/jurnal pendapatan POSTED asal tidak ditemukan untuk cohort retur.',
                'Ketiadaan evidence revenue tidak membuktikan pendapatan salah; perlu review dokumen sumber.'
            FROM base WHERE "invoiceCount" = 0 OR "originalPostedRevenue" = 0
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY materiality DESC, "sourceId") AS rn FROM finding_rows
        ), grouped AS (
            SELECT code, area, "amountBasis", COUNT(*) AS count, SUM(amount) AS amount,
                MAX(materiality) AS materiality, MIN(reason) AS reason, MIN("evidenceLimit") AS "evidenceLimit",
                jsonb_agg(jsonb_build_object('sourceId', "sourceId", 'materiality', materiality::text,
                    'amount', amount::text, 'reason', reason) ORDER BY materiality DESC, "sourceId") FILTER (WHERE rn <= ${SAMPLE_LIMIT}) AS samples
            FROM ranked GROUP BY code, area, "amountBasis"
        )
        SELECT jsonb_build_object(
            'metrics', jsonb_build_object(
                'cohortCount', COUNT(*),
                'physicalInRangeCount', COUNT(*) FILTER (WHERE "physicalInRange"),
                'completedInRangeCount', COUNT(*) FILTER (WHERE "completedInRange"),
                'goodReceiptCount', COALESCE(SUM("goodReceiptCount"), 0),
                'damagedReceiptCount', COALESCE(SUM("damagedReceiptCount"), 0),
                'physicalRestockValue', COALESCE(SUM("restockValue"), 0)::text,
                'activeCommercialCreditValue', COALESCE(SUM(CASE WHEN "creditStatus" = 'POSTED' THEN "creditAmount" ELSE 0 END + CASE WHEN "noteStatus" = 'POSTED' THEN "noteAmount" ELSE 0 END), 0)::text,
                'originalPostedRevenue', COALESCE(SUM("originalPostedRevenue"), 0)::text,
                'completedWithoutActiveCreditCount', COUNT(*) FILTER (WHERE status = 'COMPLETED' AND COALESCE("creditStatus"::text, '') <> 'POSTED' AND COALESCE("noteStatus"::text, '') <> 'POSTED'),
                'crossPeriodCount', COUNT(*) FILTER (WHERE ("creditStatus" = 'POSTED' AND ("postedAt" < ${start} OR "postedAt" > ${end})) OR ("noteStatus" = 'POSTED' AND ("postingDate" < ${start} OR "postingDate" > ${end}))),
                'unresolvedPhysicalVectorCount', COALESCE(SUM("goodInvalidCount"), 0),
                'unresolvedCommercialVectorCount', COUNT(*) FILTER (WHERE
                    ("creditStatus" = 'POSTED' AND ("creditJournalStatus" IS DISTINCT FROM 'POSTED' OR "creditJournalReferenceType" IS DISTINCT FROM 'SALES_RETURN' OR "creditJournalReferenceId" IS DISTINCT FROM id OR "creditJournalAuto" IS DISTINCT FROM true OR "creditDebit" IS DISTINCT FROM "creditAmount" OR "creditCredit" IS DISTINCT FROM "creditAmount" OR "creditAssetCredit" IS DISTINCT FROM "creditAmount"))
                    OR ("noteStatus" = 'POSTED' AND ("noteJournalStatus" IS DISTINCT FROM 'POSTED' OR "noteJournalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "noteJournalReferenceId" IS DISTINCT FROM "noteId" OR "noteJournalAuto" IS DISTINCT FROM true OR "noteDebit" IS DISTINCT FROM "noteAmount" OR "noteCredit" IS DISTINCT FROM "noteAmount" OR "noteLiabilityCredit" IS DISTINCT FROM "noteAmount"))
                    OR ("creditStatus" = 'REVERSED' AND ("creditReversalJournalStatus" IS DISTINCT FROM 'POSTED' OR "creditReversalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "creditReversalReferenceId" IS DISTINCT FROM "creditId" OR "creditReversalAuto" IS DISTINCT FROM true OR "creditReversalDebit" IS DISTINCT FROM "creditAmount" OR "creditReversalCredit" IS DISTINCT FROM "creditAmount" OR COALESCE("creditInverseMismatch", 1) <> 0))
                    OR ("noteStatus" = 'REVERSED' AND ("noteReversalJournalStatus" IS DISTINCT FROM 'POSTED' OR "noteReversalReferenceType" IS DISTINCT FROM 'MANUAL_ENTRY' OR "noteReversalReferenceId" IS DISTINCT FROM "noteId" OR "noteReversalAuto" IS DISTINCT FROM true OR "noteReversalDebit" IS DISTINCT FROM "noteAmount" OR "noteReversalCredit" IS DISTINCT FROM "noteAmount" OR COALESCE("noteInverseMismatch", 1) <> 0)))
            ),
            'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code', code, 'area', area, 'amountBasis', "amountBasis", 'count', count,
                'amount', amount::text, 'materiality', materiality::text, 'reason', reason,
                'evidenceLimit', "evidenceLimit", 'samples', samples
            ) ORDER BY materiality DESC, code) FROM grouped), '[]'::jsonb)
        ) AS payload FROM base
    `);
}

async function productionSnapshot(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
): Promise<SnapshotRow[]> {
    return tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        WITH params AS (SELECT ${new Date(start.getTime() - 366 * 86_400_000)}::timestamp AS "historyStart", ${new Date(end.getTime() + 366 * 86_400_000)}::timestamp AS "historyEnd"),
        candidates AS (
            SELECT DISTINCT "productionOrderId" AS id FROM "StockMovement"
            WHERE "productionOrderId" IS NOT NULL AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        ), moves AS (
            SELECT m.*, po."isMaklon", b."productVariantId" AS "outputVariantId", p."productType",
                p."inventoryAccountId" AS "movementInventoryAccountId",
                p."wipAccountId" AS "movementWipAccountId",
                substring(m.reference from '\\[SOURCE:([^\\]]+)\\]') AS "markerId"
            FROM "StockMovement" m JOIN candidates c ON c.id = m."productionOrderId"
            JOIN "ProductionOrder" po ON po.id = m."productionOrderId"
            JOIN "Bom" b ON b.id = po."bomId"
            JOIN "ProductVariant" pv ON pv.id = m."productVariantId"
            JOIN "Product" p ON p.id = pv."productId"
            CROSS JOIN params bounds
            WHERE m."createdAt" >= bounds."historyStart" AND m."createdAt" <= bounds."historyEnd"
        ), paired AS (
            SELECT m.*, legacy.candidate_count AS "legacyCandidateCount",
                CASE WHEN m."markerId" IS NOT NULL THEN m."markerId"
                     WHEN legacy.candidate_count = 1 THEN legacy.source_id ELSE NULL END AS "pairedSourceId",
                CASE WHEN m.reference NOT LIKE 'VOID:%' THEN 'original'
                     WHEN m."markerId" IS NOT NULL AND EXISTS (
                         SELECT 1 FROM moves o WHERE o.id = m."markerId"
                            AND o."productionOrderId" = m."productionOrderId"
                            AND o."productVariantId" = m."productVariantId"
                            AND o.quantity = m.quantity AND o.reference NOT LIKE 'VOID:%'
                            AND o.cost IS NOT DISTINCT FROM m.cost
                            AND ((m.type = 'IN' AND o.type = 'OUT' AND m."toLocationId" = o."fromLocationId" AND m."fromLocationId" IS NULL AND o."toLocationId" IS NULL)
                              OR (m.type = 'OUT' AND o.type = 'IN' AND m."fromLocationId" = o."toLocationId" AND m."toLocationId" IS NULL AND o."fromLocationId" IS NULL))
                     ) THEN 'exact'
                     WHEN m."markerId" IS NOT NULL THEN 'unmatched'
                     WHEN legacy.candidate_count = 1 THEN 'legacy_unique'
                     WHEN legacy.candidate_count > 1 THEN 'legacy_ambiguous'
                     ELSE 'unmatched' END AS "pairStatus"
            FROM moves m
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS candidate_count, MIN(o.id) AS source_id
                FROM moves o
                WHERE m.reference LIKE 'VOID:%' AND m."markerId" IS NULL
                    AND o.id <> m.id AND o.reference NOT LIKE 'VOID:%'
                    AND o."productionOrderId" = m."productionOrderId"
                    AND o."productVariantId" = m."productVariantId" AND o.quantity = m.quantity
                    AND ((m.type = 'IN' AND o.type = 'OUT') OR (m.type = 'OUT' AND o.type = 'IN'))
                    AND m.reference = ('VOID: ' || COALESCE(o.reference, o.id))
            ) legacy ON TRUE
        ), valid_pairs AS (
            SELECT r.id AS "reversalId", r."pairedSourceId" AS "sourceId"
            FROM paired r
            WHERE r."pairStatus" IN ('exact', 'legacy_unique')
                AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
                AND (SELECT COUNT(*) FROM "JournalEntry" je
                    WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = r.id
                        AND je.status <> 'VOIDED' AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}) = 1
                AND (SELECT COUNT(*) FROM "JournalEntry" je
                    WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = r."pairedSourceId"
                        AND je.status <> 'VOIDED' AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}) = 1
                AND NOT EXISTS (
                    SELECT 1 FROM (
                        SELECT l."accountId", SUM(l.debit - l.credit) AS net
                        FROM "JournalEntry" je JOIN "JournalLine" l ON l."journalEntryId" = je.id
                        WHERE je."referenceType" = 'MANUAL_ENTRY'
                            AND je."referenceId" IN (r.id, r."pairedSourceId")
                            AND je.status = 'POSTED' AND je."isAutoGenerated"
                            AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                        GROUP BY l."accountId"
                    ) vector WHERE vector.net <> 0
                )
                AND (SELECT COUNT(DISTINCT je."referenceId") FROM "JournalEntry" je
                    WHERE je."referenceType" = 'MANUAL_ENTRY'
                        AND je."referenceId" IN (r.id, r."pairedSourceId")
                        AND je.status = 'POSTED' AND je."isAutoGenerated"
                        AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}) = 2
        ), active_range AS (
            SELECT m.*,
                COALESCE(j.active, 0) AS "activeJournals", COALESCE(j.posted_auto, 0) AS "postedAutoJournals",
                COALESCE(j.debit, 0) AS debit, COALESCE(j.credit, 0) AS credit,
                COALESCE(j.asset_debit, 0) AS "assetDebit", COALESCE(j.asset_credit, 0) AS "assetCredit",
                COALESCE(j.wip_debit, 0) AS "wipDebit", COALESCE(j.wip_credit, 0) AS "wipCredit",
                COALESCE(j.inventory_debit, 0) AS "inventoryDebit", COALESCE(j.inventory_credit, 0) AS "inventoryCredit"
            FROM paired m
            LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE x.status <> 'VOIDED') AS active,
                    COUNT(*) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated") AS posted_auto,
                    COALESCE(SUM(x.debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS debit,
                    COALESCE(SUM(x.credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS credit,
                    COALESCE(SUM(x.asset_debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS asset_debit,
                    COALESCE(SUM(x.asset_credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS asset_credit,
                    COALESCE(SUM(x.wip_debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS wip_debit,
                    COALESCE(SUM(x.wip_credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS wip_credit,
                    COALESCE(SUM(x.inventory_debit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS inventory_debit,
                    COALESCE(SUM(x.inventory_credit) FILTER (WHERE x.status = 'POSTED' AND x."isAutoGenerated"), 0) AS inventory_credit
                FROM (
                    SELECT je.id, je.status, je."isAutoGenerated", SUM(l.debit) debit, SUM(l.credit) credit,
                        SUM(CASE WHEN a.type = 'ASSET' THEN l.debit ELSE 0 END) asset_debit,
                        SUM(CASE WHEN a.type = 'ASSET' THEN l.credit ELSE 0 END) asset_credit,
                        SUM(CASE WHEN l."accountId" = m."movementWipAccountId" THEN l.debit ELSE 0 END) wip_debit,
                        SUM(CASE WHEN l."accountId" = m."movementWipAccountId" THEN l.credit ELSE 0 END) wip_credit,
                        SUM(CASE WHEN l."accountId" = m."movementInventoryAccountId" THEN l.debit ELSE 0 END) inventory_debit,
                        SUM(CASE WHEN l."accountId" = m."movementInventoryAccountId" THEN l.credit ELSE 0 END) inventory_credit
                    FROM "JournalEntry" je JOIN "JournalLine" l ON l."journalEntryId" = je.id
                    JOIN "Account" a ON a.id = l."accountId"
                    WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = m.id
                        AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
                    GROUP BY je.id
                ) x
            ) j ON TRUE
            WHERE m."createdAt" >= ${start} AND m."createdAt" <= ${end}
                AND m."pairStatus" = 'original'
                AND NOT EXISTS (SELECT 1 FROM valid_pairs pair WHERE pair."sourceId" = m.id)
        ), classified AS (
            SELECT *, CASE
                WHEN "isMaklon" THEN 'PRODUCTION_MAKLON_OFF_BALANCE_EXCLUDED'
                WHEN "productType" = 'SCRAP' THEN 'PRODUCTION_SCRAP_SIDE_FLOW'
                WHEN type = 'ADJUSTMENT' THEN 'PRODUCTION_ADJUSTMENT_SIDE_FLOW'
                WHEN type IN ('IN', 'RETURN_IN') AND "productVariantId" <> "outputVariantId" THEN 'PRODUCTION_RETURN_IN_SIDE_FLOW'
                WHEN type = 'OUT' AND cost IS NULL AND "assetDebit" > 0 THEN 'PRODUCTION_ISSUE_GL_WITHOUT_MOVEMENT_VALUE'
                WHEN type = 'OUT' AND ("activeJournals" = 0) AND cost IS NULL THEN 'PRODUCTION_ISSUE_ZERO_OR_UNAVAILABLE_VALUE'
                WHEN type = 'OUT' AND "activeJournals" = 0 THEN 'PRODUCTION_ISSUE_JOURNAL_MISSING'
                WHEN type = 'OUT' AND ("activeJournals" <> 1 OR "postedAutoJournals" <> 1 OR debit <> credit OR "assetDebit" <= 0 OR "assetCredit" <= 0) THEN 'PRODUCTION_ISSUE_JOURNAL_INVALID'
                WHEN type = 'OUT' AND "movementWipAccountId" IS NOT NULL AND "movementInventoryAccountId" IS NOT NULL
                    AND ("wipDebit" <= 0 OR "inventoryCredit" <= 0 OR "wipDebit" <> "inventoryCredit") THEN 'PRODUCTION_ISSUE_ACCOUNT_ROLE_MISMATCH'
                WHEN type = 'OUT' AND cost IS NOT NULL AND ABS(cost * quantity - "assetDebit") > 0.01 THEN 'PRODUCTION_ISSUE_VALUE_MISMATCH'
                WHEN type = 'IN' AND "productVariantId" = "outputVariantId" AND (cost IS NULL OR cost * quantity = 0) AND "activeJournals" = 0 THEN 'PRODUCTION_OUTPUT_ZERO_VALUE'
                WHEN type = 'IN' AND "productVariantId" = "outputVariantId" AND "activeJournals" = 0 THEN 'PRODUCTION_OUTPUT_JOURNAL_MISSING'
                WHEN type = 'IN' AND "productVariantId" = "outputVariantId" AND ("activeJournals" <> 1 OR "postedAutoJournals" <> 1 OR debit <> credit OR "assetDebit" <= 0 OR "assetCredit" <= 0) THEN 'PRODUCTION_OUTPUT_JOURNAL_INVALID'
                WHEN type = 'IN' AND "productVariantId" = "outputVariantId" AND "movementWipAccountId" IS NOT NULL AND "movementInventoryAccountId" IS NOT NULL
                    AND ("inventoryDebit" <= 0 OR "wipCredit" <= 0 OR "inventoryDebit" <> "wipCredit") THEN 'PRODUCTION_OUTPUT_ACCOUNT_ROLE_MISMATCH'
                WHEN type = 'IN' AND "productVariantId" = "outputVariantId" AND cost IS NOT NULL AND ABS(cost * quantity - "assetDebit") > 0.01 THEN 'PRODUCTION_OUTPUT_VALUE_MISMATCH'
                ELSE 'PRODUCTION_FLOW_COVERED' END AS code
            FROM active_range
        ), cross_period AS (
            SELECT po.id,
                EXISTS (SELECT 1 FROM active_range m WHERE m."productionOrderId" = po.id AND m.type = 'IN' AND m."productVariantId" = m."outputVariantId") AS output_in,
                EXISTS (SELECT 1 FROM active_range m WHERE m."productionOrderId" = po.id AND m.type = 'OUT') AS issue_in,
                EXISTS (SELECT 1 FROM paired m WHERE m."productionOrderId" = po.id AND m.type = 'IN' AND m."productVariantId" = m."outputVariantId" AND (m."createdAt" < ${start} OR m."createdAt" > ${end})) AS output_outside,
                EXISTS (SELECT 1 FROM paired m WHERE m."productionOrderId" = po.id AND m.type = 'OUT' AND (m."createdAt" < ${start} OR m."createdAt" > ${end})) AS issue_outside
            FROM "ProductionOrder" po JOIN candidates c ON c.id = po.id
        ), shipment_bridge AS (
            SELECT COUNT(*) AS count,
                COALESCE(SUM(j.cogs_debit), 0) AS journal_value
            FROM "StockMovement" m JOIN "SalesOrder" so ON so.id = m."salesOrderId"
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(l.debit), 0) AS cogs_debit
                FROM "JournalEntry" je JOIN "JournalLine" l ON l."journalEntryId" = je.id
                JOIN "Account" a ON a.id = l."accountId"
                WHERE je."referenceType" = 'MANUAL_ENTRY' AND je."referenceId" = m.id
                    AND je.status = 'POSTED' AND je."isAutoGenerated"
                    AND a.type = 'EXPENSE' AND a.category = 'COGS'
                    AND ${nonClosingReferenceSql(Prisma.sql`je.reference`)}
            ) j ON TRUE
            WHERE m.type = 'OUT' AND m."salesOrderId" IS NOT NULL AND m."productionOrderId" IS NULL
                AND m."createdAt" >= ${start} AND m."createdAt" <= ${end} AND so."orderType" <> 'MAKLON_JASA'
        ), adjustments AS (
            SELECT COUNT(*) AS count FROM "StockMovement" m
            WHERE m.type = 'ADJUSTMENT' AND m."createdAt" >= ${start} AND m."createdAt" <= ${end}
        ), finding_rows AS (
            SELECT id AS "sourceId", code, 'production'::text area,
                CASE WHEN "assetDebit" <> 0 THEN 'posted_inventory_wip_journal'
                     WHEN cost IS NOT NULL THEN 'persisted_movement_cost' ELSE 'none' END AS "amountBasis",
                CASE WHEN "assetDebit" <> 0 THEN "assetDebit" WHEN cost IS NOT NULL THEN cost * quantity ELSE 0 END amount,
                GREATEST(ABS("assetDebit"), ABS(COALESCE(cost * quantity, 0))) materiality,
                CASE code
                    WHEN 'PRODUCTION_MAKLON_OFF_BALANCE_EXCLUDED' THEN 'Movement Maklon adalah off-balance; gap jurnal movement tidak dilaporkan.'
                    WHEN 'PRODUCTION_SCRAP_SIDE_FLOW' THEN 'Output SCRAP dilaporkan terpisah dan tidak ditambahkan sebagai konsumsi produksi.'
                    WHEN 'PRODUCTION_ADJUSTMENT_SIDE_FLOW' THEN 'Adjustment inventory produksi dilaporkan sebagai side flow terpisah.'
                    WHEN 'PRODUCTION_RETURN_IN_SIDE_FLOW' THEN 'IN non-output adalah return-in/side flow, bukan output produksi utama.'
                    WHEN 'PRODUCTION_ISSUE_GL_WITHOUT_MOVEMENT_VALUE' THEN 'Jurnal WIP positif ada, tetapi movement issue tidak menyimpan cost.'
                    WHEN 'PRODUCTION_OUTPUT_ZERO_VALUE' THEN 'Output produksi tersimpan dengan nilai nol dan tanpa jurnal bernilai.'
                    ELSE 'Movement dan jurnal produksi tidak memenuhi vector/value yang diharapkan.' END reason,
                'Movement value dan GL value dipertahankan terpisah; interpretasi accounting needs_review.' AS "evidenceLimit"
            FROM classified WHERE code <> 'PRODUCTION_FLOW_COVERED'
            UNION ALL
            SELECT id, CASE WHEN EXISTS (SELECT 1 FROM valid_pairs pair WHERE pair."reversalId" = paired.id) THEN 'PRODUCTION_REVERSAL_EXCLUDED'
                            WHEN "pairStatus" = 'legacy_ambiguous' THEN 'PRODUCTION_REVERSAL_LEGACY_AMBIGUOUS'
                            WHEN "pairStatus" = 'legacy_unique' THEN 'PRODUCTION_REVERSAL_JOURNAL_INVALID'
                            WHEN "pairStatus" = 'exact' THEN 'PRODUCTION_REVERSAL_JOURNAL_INVALID'
                            ELSE 'PRODUCTION_REVERSAL_UNMATCHED' END,
                'production', 'persisted_movement_cost', COALESCE(cost * quantity, 0), ABS(COALESCE(cost * quantity, 0)),
                'Movement VOID diperlakukan sebagai reversal dan tidak dihitung ulang pada flow aktif.',
                'SOURCE marker diprioritaskan; pairing reference-only tidak ditebak bila ambigu.'
            FROM paired WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} AND "pairStatus" <> 'original'
            UNION ALL
            SELECT id, 'PRODUCTION_OUTPUT_WITH_ISSUE_OUTSIDE_RANGE', 'production', 'none', 0, 0,
                'Output berada dalam periode tetapi material issue terkait hanya terlihat di luar periode.',
                'Opening/routed WIP tidak direkonstruksi.' FROM cross_period WHERE output_in AND NOT issue_in AND issue_outside
            UNION ALL
            SELECT id, 'MATERIAL_COST_REMAINS_IN_WIP_OR_INVENTORY', 'production', 'none', 0, 0,
                'Material issue berada dalam periode tetapi output belum berada dalam periode yang sama.',
                'Biaya dapat tetap di WIP/inventory atau melintasi periode; diagnosis tidak mengklaim seluruh issue menjadi COGS.' FROM cross_period WHERE issue_in AND NOT output_in
            UNION ALL
            SELECT id, 'PRODUCTION_ISSUE_WITH_OUTPUT_OUTSIDE_RANGE', 'production', 'none', 0, 0,
                'Material issue berada dalam periode tetapi output terkait hanya terlihat di luar periode.',
                'Closing WIP tidak direkonstruksi.' FROM cross_period WHERE issue_in AND NOT output_in AND output_outside
            UNION ALL
            SELECT 'aggregate-shipments', 'COST_FLOW_UNATTRIBUTED', 'production', 'posted_cogs_journal',
                journal_value, ABS(journal_value),
                'Shipment periode tidak dapat ditautkan secara eksak ke lot/output produksi.',
                'Schema hanya mendukung jembatan agregat; jangan menyatakan lineage per unit.' FROM shipment_bridge WHERE count > 0
            UNION ALL
            SELECT 'aggregate-adjustments', 'INVENTORY_ADJUSTMENT_OUTSIDE_COGS', 'production', 'none', 0, 0,
                'Adjustment inventory periode dilaporkan sebagai side flow terpisah.',
                'Adjustment tidak diasumsikan sebagai konsumsi atau output produksi.' FROM adjustments WHERE count > 0
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY materiality DESC, "sourceId") rn FROM finding_rows
        ), grouped AS (
            SELECT code, area, "amountBasis", COUNT(*) count, SUM(amount) amount, MAX(materiality) materiality,
                MIN(reason) reason, MIN("evidenceLimit") "evidenceLimit",
                jsonb_agg(jsonb_build_object('sourceId', "sourceId", 'materiality', materiality::text,
                    'amount', amount::text, 'reason', reason) ORDER BY materiality DESC, "sourceId") FILTER (WHERE rn <= ${SAMPLE_LIMIT}) samples
            FROM ranked GROUP BY code, area, "amountBasis"
        )
        SELECT jsonb_build_object(
            'metrics', jsonb_build_object(
                'issueCount', COUNT(*) FILTER (WHERE c.type = 'OUT' AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'),
                'issueQuantity', COALESCE(SUM(c.quantity) FILTER (WHERE c.type = 'OUT' AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'issueMovementValue', COALESCE(SUM(c.cost * c.quantity) FILTER (WHERE c.type = 'OUT' AND c.cost IS NOT NULL AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'issueJournalValue', COALESCE(SUM(c."assetDebit") FILTER (WHERE c.type = 'OUT' AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'outputCount', COUNT(*) FILTER (WHERE c.type = 'IN' AND c."productVariantId" = c."outputVariantId" AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'),
                'outputQuantity', COALESCE(SUM(c.quantity) FILTER (WHERE c.type = 'IN' AND c."productVariantId" = c."outputVariantId" AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'outputMovementValue', COALESCE(SUM(c.cost * c.quantity) FILTER (WHERE c.type = 'IN' AND c.cost IS NOT NULL AND c."productVariantId" = c."outputVariantId" AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'outputJournalValue', COALESCE(SUM(c."assetDebit") FILTER (WHERE c.type = 'IN' AND c."productVariantId" = c."outputVariantId" AND NOT c."isMaklon" AND c."productType" <> 'SCRAP'), 0)::text,
                'scrapCount', COUNT(*) FILTER (WHERE c."productType" = 'SCRAP'),
                'returnInCount', COUNT(*) FILTER (WHERE c.type IN ('IN', 'RETURN_IN') AND c."productVariantId" <> c."outputVariantId" AND c."productType" <> 'SCRAP'),
                'maklonCount', COUNT(*) FILTER (WHERE c."isMaklon"),
                'semanticRoleUnknownCount', COUNT(*) FILTER (WHERE NOT c."isMaklon" AND (c."movementWipAccountId" IS NULL OR c."movementInventoryAccountId" IS NULL)),
                'ambiguousReversalCount', (SELECT COUNT(*) FROM paired r WHERE r."createdAt" >= ${start} AND r."createdAt" <= ${end} AND r."pairStatus" <> 'original' AND NOT EXISTS (SELECT 1 FROM valid_pairs pair WHERE pair."reversalId" = r.id)),
                'legacyUniqueReversalCount', (SELECT COUNT(*) FROM valid_pairs pair JOIN paired r ON r.id = pair."reversalId" WHERE r."pairStatus" = 'legacy_unique'),
                'outputIssueOutsideCount', (SELECT COUNT(*) FROM cross_period WHERE output_in AND NOT issue_in AND issue_outside),
                'issueOutputOutsideCount', (SELECT COUNT(*) FROM cross_period WHERE issue_in AND NOT output_in AND output_outside),
                'shipmentCount', (SELECT count FROM shipment_bridge),
                'shipmentJournalValue', (SELECT journal_value::text FROM shipment_bridge),
                'unattributedShipmentCount', (SELECT count FROM shipment_bridge),
                'adjustmentCount', (SELECT count FROM adjustments)
            ),
            'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code', code, 'area', area, 'amountBasis', "amountBasis", 'count', count,
                'amount', amount::text, 'materiality', materiality::text, 'reason', reason,
                'evidenceLimit', "evidenceLimit", 'samples', samples
            ) ORDER BY materiality DESC, code) FROM grouped), '[]'::jsonb)
        ) AS payload FROM classified c
    `);
}

export async function diagnoseCogsEconomicCompleteness(
    tx: Prisma.TransactionClient,
    input: unknown,
) {
    const range = financeRange(input);
    // Sequential execution keeps the transaction/client boundary explicit and avoids
    // parallel query pressure inside the assistant's bounded read-only transaction.
    const report = await getIncomeStatement(range.start, range.end, tx);
    const cogsRows = await tx.$queryRaw<{ total: Prisma.Decimal }[]>(Prisma.sql`
        SELECT COALESCE(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit-l.debit ELSE l.debit-l.credit END), 0) AS total
        FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId" = j.id
        JOIN "Account" a ON a.id = l."accountId"
        WHERE j.status = 'POSTED' AND ${nonClosingReferenceSql(Prisma.sql`j.reference`)}
            AND j."entryDate" >= ${range.start} AND j."entryDate" <= ${range.end}
            AND a.category = 'COGS' AND a.type IN ('REVENUE', 'EXPENSE')
    `);
    const bookkeeping = {
        reportCogs: report.totalCOGS,
        journalCogs: n(cogsRows[0]?.total),
        difference: report.totalCOGS - n(cogsRows[0]?.total),
    };
    const shipments = await shipmentSnapshot(tx, range.start, range.end);
    const returns = await returnSnapshot(tx, range.start, range.end);
    const production = await productionSnapshot(tx, range.start, range.end);
    return assembleCogsEconomicDiagnosis(range, { shipments, returns, production }, bookkeeping);
}

import { Prisma } from '@prisma/client';
import { financeRange } from './finance-diagnostic-input';

const SAMPLE_LIMIT = 20;

export type InventoryCoverageStatus = 'covered' | 'partial' | 'missing';
export type InventoryConfidenceCap = 0.6 | 0.75 | 0.85 | 0.9;

export type InventoryCoverageDimension = {
    code: string;
    status: InventoryCoverageStatus;
    reason: string;
};

export type InventoryDiagnosisFinding = {
    code: string;
    conditionStatus: 'confirmed';
    accountingConclusion: 'needs_review';
    area: 'gl' | 'movement' | 'return' | 'production' | 'policy';
    flow: string;
    amountBasis: string;
    count: number;
    amount: number;
    nominal: number;
    glActivityPercentage: number | null;
    sourceId: string | null;
    materiality: number;
    reason: string;
    evidenceLimit: string;
    samples: Array<{
        sourceId: string;
        flow: string;
        unit: string | null;
        amount: number;
        materiality: number;
        reason: string;
    }>;
};

type SnapshotRow = { payload: unknown };
type SnapshotFinding = Omit<
    InventoryDiagnosisFinding,
    | 'conditionStatus'
    | 'accountingConclusion'
    | 'nominal'
    | 'glActivityPercentage'
    | 'sourceId'
>;
type Snapshot = {
    readable: boolean;
    metrics: Record<string, number>;
    findings: SnapshotFinding[];
    quantities: Array<{
        productVariantId: string;
        unit: string;
        inbound: number;
        outbound: number;
        transfer: number;
    }>;
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
        return { readable: false, metrics: {}, findings: [], quantities: [] };
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
                      if (!parsed || typeof parsed.sourceId !== 'string')
                          return [];
                      return [
                          {
                              sourceId: parsed.sourceId,
                              flow:
                                  typeof parsed.flow === 'string'
                                      ? parsed.flow
                                      : 'unknown',
                              unit:
                                  typeof parsed.unit === 'string'
                                      ? parsed.unit
                                      : null,
                              amount: n(parsed.amount),
                              materiality: n(parsed.materiality),
                              reason:
                                  typeof parsed.reason === 'string'
                                      ? parsed.reason
                                      : '',
                          },
                      ];
                  })
                  .sort(
                      (a, b) =>
                          b.materiality - a.materiality ||
                          a.sourceId.localeCompare(b.sourceId),
                  )
                  .slice(0, SAMPLE_LIMIT)
            : [];
        return [
            {
                code: row.code,
                area: row.area as SnapshotFinding['area'],
                flow: typeof row.flow === 'string' ? row.flow : 'unknown',
                amountBasis:
                    typeof row.amountBasis === 'string'
                        ? row.amountBasis
                        : 'none',
                count: n(row.count),
                amount: n(row.amount),
                materiality: n(row.materiality),
                reason: typeof row.reason === 'string' ? row.reason : '',
                evidenceLimit:
                    typeof row.evidenceLimit === 'string'
                        ? row.evidenceLimit
                        : '',
                samples,
            },
        ];
    });
    const quantities = Array.isArray(payload.quantities)
        ? payload.quantities.flatMap((raw) => {
              const row = object(raw);
              if (
                  !row ||
                  typeof row.productVariantId !== 'string' ||
                  typeof row.unit !== 'string'
              )
                  return [];
              return [
                  {
                      productVariantId: row.productVariantId,
                      unit: row.unit,
                      inbound: n(row.inbound),
                      outbound: n(row.outbound),
                      transfer: n(row.transfer),
                  },
              ];
          })
        : [];
    return { readable: true, metrics, findings, quantities };
}

const dimension = (
    code: string,
    status: InventoryCoverageStatus,
    reason: string,
): InventoryCoverageDimension => ({ code, status, reason });

function confidenceCap(
    dimensions: InventoryCoverageDimension[],
): InventoryConfidenceCap {
    if (
        dimensions.some(
            (item) =>
                item.status === 'missing' ||
                (item.code === 'INVENTORY_ACCOUNT_SCOPE' &&
                    item.status === 'partial'),
        )
    )
        return 0.6;
    if (
        dimensions.some(
            (item) =>
                item.status === 'partial' &&
                [
                    'INVENTORY_ACCOUNT_SCOPE',
                    'MOVEMENT_VALUATION',
                    'JOURNAL_ATTRIBUTION',
                ].includes(item.code),
        )
    )
        return 0.75;
    if (dimensions.some((item) => item.status === 'partial')) return 0.85;
    return 0.9;
}

function coverageDimensions(
    gl: Snapshot,
    movements: Snapshot,
): InventoryCoverageDimension[] {
    const dimensions = [
        dimension(
            'INVENTORY_ACCOUNT_SCOPE',
            !gl.readable
                ? 'missing'
                : (gl.metrics.mappedProductCount > 0 &&
                      gl.metrics.accountCount <= 0) ||
                    gl.metrics.unmappedProductCount > 0
                  ? 'partial'
                  : 'covered',
            !gl.readable
                ? 'Scope akun inventory tidak dapat dibaca.'
                : gl.metrics.mappedProductCount > 0 &&
                    gl.metrics.accountCount <= 0
                  ? 'Produk memiliki mapping, tetapi akun inventory ASSET yang aktif tidak dapat dibuktikan.'
                  : gl.metrics.unmappedProductCount > 0
                    ? String(gl.metrics.unmappedProductCount) +
                      ' produk non-fixed-asset tidak memiliki inventoryAccountId; fallback posting historis tidak direkonstruksi.'
                    : 'Scope akun berasal dari inventoryAccountId produk non-fixed-asset, bukan seluruh ASSET/CURRENT_ASSET.',
        ),
        dimension(
            'INVENTORY_GL_ACTIVITY',
            gl.readable ? 'covered' : 'missing',
            gl.readable
                ? 'Opening, debit, credit, dan closing mapped inventory GL dihitung dari jurnal POSTED; posting closing tetap termasuk karena inventory adalah balance-sheet ledger.'
                : 'Aktivitas inventory GL tidak dapat dibaca.',
        ),
        dimension(
            'MOVEMENT_COHORT',
            movements.readable ? 'covered' : 'missing',
            movements.readable
                ? 'Seluruh stock movement pada batas WIB dievaluasi sebelum sampel dibatasi.'
                : 'Cohort stock movement tidak dapat dibaca.',
        ),
        dimension(
            'MOVEMENT_VALUATION',
            !movements.readable
                ? 'missing'
                : movements.metrics.unvaluedCount > 0
                  ? 'partial'
                  : 'covered',
            movements.metrics.unvaluedCount > 0
                ? String(movements.metrics.unvaluedCount) +
                  ' movement bernilai nol/tidak menyimpan cost; current standard/buy/average cost tidak dipakai sebagai bukti historis.'
                : 'Persisted movement valuation tersedia untuk flow bernilai yang dievaluasi.',
        ),
        dimension(
            'JOURNAL_STATUS_VECTOR_ROLE',
            !movements.readable
                ? 'missing'
                : movements.metrics.invalidJournalCount > 0
                  ? 'partial'
                  : 'covered',
            movements.metrics.invalidJournalCount > 0
                ? 'Ada movement dengan status/vector/account role jurnal yang tidak memenuhi kontrak flow.'
                : 'Status, balance, dan semantic account role movement journal telah diperiksa.',
        ),
        dimension(
            'JOURNAL_ATTRIBUTION',
            !gl.readable || !movements.readable
                ? 'missing'
                : gl.metrics.orphanJournalCount > 0 ||
                    movements.metrics.semanticRoleUnknownCount > 0
                  ? 'partial'
                  : 'covered',
            gl.metrics.orphanJournalCount > 0 ||
                movements.metrics.semanticRoleUnknownCount > 0
                ? 'Ada jurnal inventory tanpa movement/source deterministik atau mapping semantic account yang tidak lengkap.'
                : 'Movement-linked dan orphan/manual inventory journals diperiksa terhadap scope akun exact.',
        ),
        dimension(
            'REVERSAL_PAIRING',
            !movements.readable
                ? 'missing'
                : movements.metrics.invalidReversalCount > 0 ||
                    movements.metrics.crossPeriodReversalCount > 0
                  ? 'partial'
                  : 'covered',
            movements.metrics.invalidReversalCount > 0 ||
                movements.metrics.crossPeriodReversalCount > 0
                ? 'Ada reversal invalid/ambigu atau lintas periode; flow tidak dihapus diam-diam.'
                : 'Reversal suppression mensyaratkan source pairing dan exact-inverse posted journal vector.',
        ),
        dimension(
            'RETURN_AND_PRODUCTION_FLOW',
            !movements.readable
                ? 'missing'
                : movements.metrics.crossPeriodProductionCount > 0
                  ? 'partial'
                  : 'covered',
            movements.metrics.crossPeriodProductionCount > 0
                ? 'Ada material issue tanpa output pada periode yang sama; biaya dapat tetap di WIP/cross-period.'
                : 'GOOD/DAMAGED return serta issue/output/WIP diperiksa sesuai lineage yang tersedia.',
        ),
        dimension(
            'SALES_AND_PURCHASE_RETURNS',
            movements.readable
                ? movements.metrics.purchaseReturnCount > 0
                  ? 'partial'
                  : 'covered'
                : 'missing',
            movements.metrics.purchaseReturnCount > 0
                ? 'Purchase-return movement tidak memiliki FK ke document journal; cohort dilaporkan sebagai attribution-limited needs_review.'
                : 'GOOD/DAMAGED sales return telah diperiksa dan tidak ada purchase-return cohort yang memerlukan text attribution.',
        ),
        dimension(
            'QUANTITY_LEDGER_RECONCILIATION',
            movements.readable ? 'covered' : 'missing',
            movements.readable
                ? 'Quantity movement dipertahankan per product variant dan primary unit; tidak dijumlahkan lintas unit atau disamakan dengan nilai.'
                : 'Quantity movement ledger tidak dapat dibaca.',
        ),
        dimension(
            'ADJUSTMENT_TRANSFER_OFF_BALANCE',
            movements.readable ? 'covered' : 'missing',
            movements.readable
                ? 'Adjustment gain/loss, transfer internal, dan Maklon/customer-owned off-balance dipisahkan; keberadaannya tidak menurunkan coverage.'
                : 'Policy flow tidak dapat dibaca.',
        ),
        dimension(
            'OPENING_AND_CROSS_PERIOD_ECONOMIC_VALUE',
            !movements.readable
                ? 'missing'
                : movements.metrics.movementCount > 0 ||
                    gl.metrics.accountCount > 0
                  ? 'partial'
                  : 'covered',
            movements.metrics.movementCount > 0 || gl.metrics.accountCount > 0
                ? 'GL opening tersedia, tetapi schema tidak memiliki historical inventory valuation snapshot; economic opening/roll-forward tidak direkonstruksi.'
                : 'Tidak ada mapped account atau movement yang memerlukan economic opening roll-forward.',
        ),
    ];
    const truncated = [...gl.findings, ...movements.findings].some(
        (finding) => finding.count > finding.samples.length,
    );
    dimensions.push(
        dimension(
            'BOUNDED_SAMPLES',
            truncated ? 'partial' : 'covered',
            truncated
                ? 'Sampel stabil dibatasi ' +
                  String(SAMPLE_LIMIT) +
                  '; count dan nominal tetap seluruh cohort.'
                : 'Seluruh finding muat dalam batas sampel stabil.',
        ),
    );
    return dimensions;
}

function basisOrder(basis: string): number {
    if (basis === 'posted_inventory_gl') return 0;
    if (basis === 'persisted_movement_value') return 1;
    if (basis === 'document_return_value') return 2;
    return 3;
}

function enrichFindings(
    snapshots: Snapshot[],
    glActivity: number,
): InventoryDiagnosisFinding[] {
    return snapshots
        .flatMap((snapshot) => snapshot.findings)
        .map((finding) => ({
            ...finding,
            conditionStatus: 'confirmed' as const,
            accountingConclusion: 'needs_review' as const,
            nominal: finding.amount,
            glActivityPercentage:
                finding.amountBasis === 'posted_inventory_gl' && glActivity > 0
                    ? (Math.abs(finding.amount) / glActivity) * 100
                    : null,
            sourceId: finding.samples[0]?.sourceId ?? null,
        }))
        .sort(
            (a, b) =>
                basisOrder(a.amountBasis) - basisOrder(b.amountBasis) ||
                b.materiality - a.materiality ||
                a.code.localeCompare(b.code) ||
                (a.sourceId ?? '').localeCompare(b.sourceId ?? ''),
        );
}

export function assembleInventoryEconomicDiagnosis(
    range: ReturnType<typeof financeRange>,
    rows: { gl: SnapshotRow[]; movements: SnapshotRow[] },
) {
    const gl = parseSnapshot(rows.gl);
    const movements = parseSnapshot(rows.movements);
    const dimensions = coverageDimensions(gl, movements);
    const glActivity =
        Math.abs(gl.metrics.periodDebit ?? 0) +
        Math.abs(gl.metrics.periodCredit ?? 0);
    const findings = enrichFindings([gl, movements], glActivity);
    if (movements.metrics.movementCount > 0 || gl.metrics.accountCount > 0) {
        findings.push({
            code: 'OPENING_INVENTORY_UNAVAILABLE',
            conditionStatus: 'confirmed',
            accountingConclusion: 'needs_review',
            area: 'gl',
            flow: 'opening',
            amountBasis: 'none',
            count: 1,
            amount: 0,
            nominal: 0,
            glActivityPercentage: null,
            sourceId: null,
            materiality: 0,
            reason: 'Historical economic inventory opening value is unavailable from the mutable Inventory snapshot.',
            evidenceLimit: 'Mapped GL opening is available, but quantity, movement valuation, and GL cannot be forced into an exact economic roll-forward.',
            samples: [],
        });
    }
    findings.sort(
        (a, b) =>
            basisOrder(a.amountBasis) - basisOrder(b.amountBasis) ||
            b.materiality - a.materiality ||
            a.code.localeCompare(b.code),
    );
    const completenessReasons = dimensions
        .filter((item) => item.status !== 'covered')
        .map((item) => item.code + ': ' + item.reason);
    return {
        range,
        gl: {
            accountCount: gl.metrics.accountCount ?? 0,
            mappedProductCount: gl.metrics.mappedProductCount ?? 0,
            unmappedProductCount: gl.metrics.unmappedProductCount ?? 0,
            openingBalance: gl.metrics.openingBalance ?? 0,
            periodDebit: gl.metrics.periodDebit ?? 0,
            periodCredit: gl.metrics.periodCredit ?? 0,
            closingBalance: gl.metrics.closingBalance ?? 0,
            rollforwardGap:
                (gl.metrics.closingBalance ?? 0) -
                ((gl.metrics.openingBalance ?? 0) +
                    (gl.metrics.periodDebit ?? 0) -
                    (gl.metrics.periodCredit ?? 0)),
            journalCount: gl.metrics.journalCount ?? 0,
            manualJournalCount: gl.metrics.manualJournalCount ?? 0,
            orphanJournalCount: gl.metrics.orphanJournalCount ?? 0,
            closingReferenceCount: gl.metrics.closingReferenceCount ?? 0,
            scopeBasis: 'persisted_product_inventory_account_mapping' as const,
        },
        movementCoverage: {
            count: movements.metrics.movementCount ?? 0,
            coveredCount: movements.metrics.coveredCount ?? 0,
            unvaluedCount: movements.metrics.unvaluedCount ?? 0,
            withoutJournalCount: movements.metrics.withoutJournalCount ?? 0,
            invalidJournalCount: movements.metrics.invalidJournalCount ?? 0,
            valueMismatchCount: movements.metrics.valueMismatchCount ?? 0,
            semanticRoleUnknownCount:
                movements.metrics.semanticRoleUnknownCount ?? 0,
            validReversalCount: movements.metrics.validReversalCount ?? 0,
            invalidReversalCount: movements.metrics.invalidReversalCount ?? 0,
            crossPeriodReversalCount:
                movements.metrics.crossPeriodReversalCount ?? 0,
            quantities: movements.quantities,
        },
        flows: {
            receipts: movements.metrics.receiptCount ?? 0,
            shipments: movements.metrics.shipmentCount ?? 0,
            productionIssues: movements.metrics.issueCount ?? 0,
            productionOutputs: movements.metrics.outputCount ?? 0,
            goodReturns: movements.metrics.goodReturnCount ?? 0,
            damagedReturns: movements.metrics.damagedReturnCount ?? 0,
            purchaseReturns: movements.metrics.purchaseReturnCount ?? 0,
            adjustmentGains: movements.metrics.adjustmentGainCount ?? 0,
            adjustmentLosses: movements.metrics.adjustmentLossCount ?? 0,
            internalTransfers: movements.metrics.internalTransferCount ?? 0,
            offBalanceExcluded: movements.metrics.offBalanceCount ?? 0,
            materialCostRemainsInWip:
                movements.metrics.crossPeriodProductionCount ?? 0,
        },
        coverage: {
            mandatoryComplete: dimensions.every(
                (item) => item.status === 'covered',
            ),
            confidenceCap: confidenceCap(dimensions),
            dimensions,
            completenessReasons,
        },
        findings,
        limitations: [
            'Konsisten secara jurnal belum tentu lengkap secara ekonomi; quantity stock, movement valuation, dan saldo GL adalah basis berbeda.',
            'Inventory GL scope memakai persisted product inventoryAccountId. Fallback account resolver historis dan produk tanpa mapping membuat scope partial.',
            'Current Inventory.quantity/averageCost bukan historical period snapshot dan tidak digunakan untuk opening/end-date valuation.',
            'Null movement cost tidak diisi dari current standardCost, buyPrice, atau averageCost karena bukan bukti historical valuation.',
            'Purchase-return dan legacy flow tanpa movement/source FK tetap attribution-limited; manual inventory journal bukan otomatis accounting error.',
            'Material issue memindahkan inventory ke WIP, bukan otomatis ke COGS; transfer internal tidak menciptakan gain/loss.',
            'Balance-sheet inventory GL tetap memasukkan closing-reference postings; posting tersebut dilaporkan untuk review, bukan disembunyikan.',
        ],
    };
}

async function glSnapshot(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
): Promise<SnapshotRow[]> {
    return tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        WITH product_scope AS (
            SELECT p.id, p."inventoryAccountId"
            FROM "Product" p
            WHERE p."productType" <> 'FIXED_ASSET'
        ), inventory_accounts AS (
            SELECT DISTINCT p."inventoryAccountId" id
            FROM product_scope p
            JOIN "Account" a ON a.id = p."inventoryAccountId"
            WHERE p."inventoryAccountId" IS NOT NULL AND a.type = 'ASSET'
        ), scoped_lines AS (
            SELECT j.id "journalId", j."entryDate", j.reference,
                j."referenceType", j."referenceId", j."isAutoGenerated",
                l."accountId", l.debit, l.credit
            FROM "JournalEntry" j
            JOIN "JournalLine" l ON l."journalEntryId" = j.id
            JOIN inventory_accounts a ON a.id = l."accountId"
            WHERE j.status = 'POSTED' AND j."entryDate" <= ${end}
        ), period_journals AS (
            SELECT "journalId", MIN("entryDate") "entryDate",
                MIN(reference) reference,
                MIN("referenceType"::text) "referenceType",
                MIN("referenceId") "referenceId",
                BOOL_AND("isAutoGenerated") "isAutoGenerated",
                SUM(debit) debit, SUM(credit) credit
            FROM scoped_lines
            WHERE "entryDate" >= ${start}
            GROUP BY "journalId"
        ), classified AS (
            SELECT p.*, CASE
                WHEN p.reference LIKE 'CLOSING-%'
                    OR p.reference LIKE 'CLOSE-%'
                    THEN 'CLOSING_INVENTORY_JOURNAL_REVIEW'
                WHEN NOT EXISTS (
                    SELECT 1 FROM "StockMovement" m
                    WHERE m.id = p."referenceId"
                ) AND NOT EXISTS (
                    SELECT 1 FROM "SalesReturnReceiptLine" r
                    WHERE r."journalId" = p."journalId"
                ) THEN 'INVENTORY_JOURNAL_WITHOUT_MOVEMENT'
                ELSE 'ATTRIBUTED_INVENTORY_JOURNAL'
            END code
            FROM period_journals p
        ), finding_rows AS (
            SELECT "journalId" "sourceId", code, 'gl'::text area,
                'journal'::text flow, 'posted_inventory_gl'::text "amountBasis",
                debit-credit amount, GREATEST(ABS(debit), ABS(credit)) materiality,
                CASE code
                    WHEN 'CLOSING_INVENTORY_JOURNAL_REVIEW'
                        THEN 'Closing-reference journal touches a mapped inventory account and remains included in balance-sheet GL.'
                    ELSE 'Jurnal inventory tanpa stock movement yang dapat diatribusikan—perlu review Finance.'
                END reason,
                'Condition confirmed from exact mapped inventory account; business purpose and correction remain needs_review.' "evidenceLimit"
            FROM classified
            WHERE code <> 'ATTRIBUTED_INVENTORY_JOURNAL'
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY code, "amountBasis"
                ORDER BY materiality DESC, "sourceId"
            ) rn
            FROM finding_rows
        ), grouped AS (
            SELECT code, area, flow, "amountBasis", COUNT(*) count,
                SUM(amount) amount, SUM(materiality) materiality,
                MIN(reason) reason, MIN("evidenceLimit") "evidenceLimit",
                jsonb_agg(jsonb_build_object(
                    'sourceId', "sourceId", 'flow', flow, 'unit', NULL,
                    'amount', amount::text, 'materiality', materiality::text,
                    'reason', reason
                ) ORDER BY materiality DESC, "sourceId")
                    FILTER (WHERE rn <= ${SAMPLE_LIMIT}) samples
            FROM ranked
            GROUP BY code, area, flow, "amountBasis"
        )
        SELECT jsonb_build_object(
            'metrics', jsonb_build_object(
                'accountCount', (SELECT COUNT(*) FROM inventory_accounts),
                'mappedProductCount', (
                    SELECT COUNT(*) FROM product_scope
                    WHERE "inventoryAccountId" IS NOT NULL
                ),
                'unmappedProductCount', (
                    SELECT COUNT(*) FROM product_scope
                    WHERE "inventoryAccountId" IS NULL
                ),
                'openingBalance', COALESCE((
                    SELECT SUM(debit-credit) FROM scoped_lines
                    WHERE "entryDate" < ${start}
                ), 0)::text,
                'periodDebit', COALESCE((
                    SELECT SUM(debit) FROM scoped_lines
                    WHERE "entryDate" >= ${start}
                ), 0)::text,
                'periodCredit', COALESCE((
                    SELECT SUM(credit) FROM scoped_lines
                    WHERE "entryDate" >= ${start}
                ), 0)::text,
                'closingBalance', COALESCE((
                    SELECT SUM(debit-credit) FROM scoped_lines
                ), 0)::text,
                'journalCount', (SELECT COUNT(*) FROM period_journals),
                'manualJournalCount', (
                    SELECT COUNT(*) FROM period_journals
                    WHERE NOT "isAutoGenerated"
                ),
                'orphanJournalCount', (
                    SELECT COUNT(*) FROM classified
                    WHERE code = 'INVENTORY_JOURNAL_WITHOUT_MOVEMENT'
                ),
                'closingReferenceCount', (
                    SELECT COUNT(*) FROM classified
                    WHERE code = 'CLOSING_INVENTORY_JOURNAL_REVIEW'
                )
            ),
            'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code', code, 'area', area, 'flow', flow,
                'amountBasis', "amountBasis", 'count', count,
                'amount', amount::text, 'materiality', materiality::text,
                'reason', reason, 'evidenceLimit', "evidenceLimit",
                'samples', samples
            ) ORDER BY "amountBasis", materiality DESC, code) FROM grouped),
            '[]'::jsonb),
            'quantities', '[]'::jsonb
        ) payload
    `);
}

async function movementSnapshot(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
): Promise<SnapshotRow[]> {
    const historyStart = new Date(start.getTime() - 366 * 86_400_000);
    const historyEnd = new Date(end.getTime() + 366 * 86_400_000);
    return tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        WITH moves AS (
            SELECT m.*, pv."primaryUnit"::text unit,
                p."productType"::text "productType", p."inventoryAccountId",
                p."wipAccountId", p."cogsAccountId",
                b."productVariantId" "outputVariantId",
                fl."locationType"::text "fromLocationType",
                tl."locationType"::text "toLocationType",
                COALESCE(gr."isMaklon", false) "receiptMaklon",
                COALESCE(po."isMaklon", false) "productionMaklon",
                COALESCE(so."orderType"::text = 'MAKLON_JASA', false) "salesMaklon",
                COALESCE(mrt.match_count, 0) "maklonReturnMatchCount",
                sri.condition::text "returnCondition",
                substring(m.reference from '\[SOURCE:([^\]]+)\]') "markerId"
            FROM "StockMovement" m
            JOIN "ProductVariant" pv ON pv.id = m."productVariantId"
            JOIN "Product" p ON p.id = pv."productId"
            LEFT JOIN "Location" fl ON fl.id = m."fromLocationId"
            LEFT JOIN "Location" tl ON tl.id = m."toLocationId"
            LEFT JOIN "GoodsReceipt" gr ON gr.id = m."goodsReceiptId"
            LEFT JOIN "ProductionOrder" po ON po.id = m."productionOrderId"
            LEFT JOIN "Bom" b ON b.id = po."bomId"
            LEFT JOIN "SalesOrder" so ON so.id = m."salesOrderId"
            LEFT JOIN "SalesReturnReceiptLine" srr ON srr."movementId" = m.id
            LEFT JOIN "SalesReturnItem" sri ON sri.id = srr."returnItemId"
            LEFT JOIN LATERAL (
                SELECT COUNT(*) match_count
                FROM "MaklonMaterialReturn" mr
                WHERE mr.status = 'COMPLETED'
                    AND mr."sourceLocationId" = m."fromLocationId"
                    AND (m.reference = ('MRT-' || mr."returnNumber")
                        OR m.reference LIKE ('MRT-' || mr."returnNumber" || ' - %'))
                    AND EXISTS (
                        SELECT 1 FROM "MaklonMaterialReturnItem" item
                        WHERE item."maklonMaterialReturnId" = mr.id
                            AND item."productVariantId" = m."productVariantId"
                            AND item.quantity = m.quantity
                    )
            ) mrt ON TRUE
            WHERE m."createdAt" >= ${start} AND m."createdAt" <= ${end}
        ), history_moves AS (
            SELECT m.*,
                substring(m.reference from '\[SOURCE:([^\]]+)\]') "markerId"
            FROM "StockMovement" m
            WHERE m."createdAt" >= ${historyStart}
                AND m."createdAt" <= ${historyEnd}
        ), journal_per_entry AS (
            SELECT m.id "movementId", j.id "journalId", j.status::text status,
                j."isAutoGenerated", SUM(l.debit) debit, SUM(l.credit) credit,
                SUM(CASE WHEN l."accountId" = m."inventoryAccountId"
                    THEN l.debit ELSE 0 END) "inventoryDebit",
                SUM(CASE WHEN l."accountId" = m."inventoryAccountId"
                    THEN l.credit ELSE 0 END) "inventoryCredit",
                SUM(CASE WHEN l."accountId" = m."wipAccountId"
                    THEN l.debit ELSE 0 END) "wipDebit",
                SUM(CASE WHEN l."accountId" = m."wipAccountId"
                    THEN l.credit ELSE 0 END) "wipCredit",
                SUM(CASE WHEN l."accountId" = m."cogsAccountId"
                    THEN l.debit ELSE 0 END) "cogsDebit",
                SUM(CASE WHEN l."accountId" = m."cogsAccountId"
                    THEN l.credit ELSE 0 END) "cogsCredit",
                SUM(CASE WHEN a.type = 'ASSET' THEN l.debit ELSE 0 END) "assetDebit",
                SUM(CASE WHEN a.type = 'ASSET' THEN l.credit ELSE 0 END) "assetCredit"
            FROM moves m
            JOIN "JournalEntry" j ON j."referenceId" = m.id
                AND j."referenceType"::text = CASE
                    WHEN m.type = 'PURCHASE' THEN 'GOODS_RECEIPT'
                    WHEN m.type = 'ADJUSTMENT' THEN 'STOCK_ADJUSTMENT'
                    ELSE 'MANUAL_ENTRY'
                END
            JOIN "JournalLine" l ON l."journalEntryId" = j.id
            JOIN "Account" a ON a.id = l."accountId"
            GROUP BY m.id, j.id
        ), journals AS (
            SELECT "movementId",
                COUNT(*) FILTER (WHERE status <> 'VOIDED') "activeJournals",
                COUNT(*) FILTER (
                    WHERE status = 'POSTED' AND "isAutoGenerated"
                ) "postedAutoJournals",
                COALESCE(SUM(debit) FILTER (WHERE status = 'POSTED'), 0) debit,
                COALESCE(SUM(credit) FILTER (WHERE status = 'POSTED'), 0) credit,
                COALESCE(SUM("inventoryDebit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "inventoryDebit",
                COALESCE(SUM("inventoryCredit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "inventoryCredit",
                COALESCE(SUM("wipDebit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "wipDebit",
                COALESCE(SUM("wipCredit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "wipCredit",
                COALESCE(SUM("cogsDebit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "cogsDebit",
                COALESCE(SUM("cogsCredit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "cogsCredit",
                COALESCE(SUM("assetDebit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "assetDebit",
                COALESCE(SUM("assetCredit") FILTER (
                    WHERE status = 'POSTED'
                ), 0) "assetCredit"
            FROM journal_per_entry
            GROUP BY "movementId"
        ), paired AS (
            SELECT m.*, candidate.candidate_count "pairCandidateCount",
                source.id "pairedSourceId", source."createdAt" "sourceCreatedAt",
                CASE WHEN candidate.candidate_count <> 1 OR source.id IS NULL
                    THEN false
                    ELSE NOT EXISTS (
                        SELECT 1 FROM (
                            SELECT l."accountId", l.currency, l."exchangeRate",
                                SUM(l.debit-l.credit) net
                            FROM "JournalEntry" j
                            JOIN "JournalLine" l ON l."journalEntryId" = j.id
                            WHERE j.status = 'POSTED'
                                AND j."isAutoGenerated"
                                AND j."referenceId" IN (m.id, source.id)
                            GROUP BY l."accountId", l.currency, l."exchangeRate"
                        ) vector WHERE vector.net <> 0
                    ) AND (
                        SELECT COUNT(*) FROM "JournalEntry" j
                        WHERE j.status = 'POSTED'
                            AND j."isAutoGenerated"
                            AND j."referenceId" IN (m.id, source.id)
                    ) = 2 AND (
                        SELECT COUNT(DISTINCT j."referenceId")
                        FROM "JournalEntry" j
                        WHERE j.status = 'POSTED'
                            AND j."isAutoGenerated"
                            AND j."referenceId" IN (m.id, source.id)
                    ) = 2
                END "inverseJournal"
            FROM moves m
            LEFT JOIN LATERAL (
                SELECT COUNT(*) candidate_count, MIN(h.id) source_id
                FROM history_moves h
                WHERE m.reference LIKE 'VOID:%' AND h.id <> m.id
                    AND COALESCE(h.reference, '') NOT LIKE 'VOID:%'
                    AND h."productVariantId" = m."productVariantId"
                    AND h.quantity = m.quantity
                    AND ((m.type IN ('IN','RETURN_IN')
                            AND h.type IN ('OUT','RETURN_OUT'))
                        OR (m.type IN ('OUT','RETURN_OUT')
                            AND h.type IN ('IN','RETURN_IN')))
                    AND (
                        h.id = m."markerId"
                        OR m.reference = ('VOID: ' || COALESCE(h.reference, h.id))
                        OR m.reference = (
                            'VOID: ' || COALESCE(h.reference, h.id) ||
                            ' [SOURCE:' || COALESCE(m."markerId", '') || ']'
                        )
                    )
            ) candidate ON TRUE
            LEFT JOIN history_moves source
                ON source.id = candidate.source_id
                    AND candidate.candidate_count = 1
        ), base AS (
            SELECT p.*, COALESCE(j."activeJournals", 0) "activeJournals",
                COALESCE(j."postedAutoJournals", 0) "postedAutoJournals",
                COALESCE(j.debit, 0) debit, COALESCE(j.credit, 0) credit,
                COALESCE(j."inventoryDebit", 0) "inventoryDebit",
                COALESCE(j."inventoryCredit", 0) "inventoryCredit",
                COALESCE(j."wipDebit", 0) "wipDebit",
                COALESCE(j."wipCredit", 0) "wipCredit",
                COALESCE(j."cogsDebit", 0) "cogsDebit",
                COALESCE(j."cogsCredit", 0) "cogsCredit",
                COALESCE(j."assetDebit", 0) "assetDebit",
                COALESCE(j."assetCredit", 0) "assetCredit",
                (p."receiptMaklon" OR p."productionMaklon" OR p."salesMaklon"
                    OR p."maklonReturnMatchCount" = 1
                    OR p."fromLocationType" = 'CUSTOMER_OWNED'
                    OR p."toLocationType" = 'CUSTOMER_OWNED') "offBalance",
                ABS(COALESCE(p.cost * p.quantity, 0)) "movementValue",
                CASE
                    WHEN p."goodsReceiptId" IS NOT NULL OR p.type = 'PURCHASE'
                        THEN 'receipt'
                    WHEN p."salesOrderId" IS NOT NULL AND p.type = 'OUT'
                        THEN 'shipment'
                    WHEN p."productionOrderId" IS NOT NULL AND p.type = 'OUT'
                        THEN 'production_issue'
                    WHEN p."productionOrderId" IS NOT NULL AND p.type = 'IN'
                        AND p."productVariantId" = p."outputVariantId"
                        THEN 'production_output'
                    WHEN p."productionOrderId" IS NOT NULL AND p.type IN ('IN','RETURN_IN')
                        THEN 'production_return_in'
                    WHEN p.type = 'RETURN_IN'
                        AND p."returnCondition" = 'GOOD' THEN 'sales_return_good'
                    WHEN p.type = 'RETURN_IN' THEN 'return_in'
                    WHEN p.type = 'RETURN_OUT' THEN 'purchase_return'
                    WHEN p.type = 'ADJUSTMENT'
                        AND p."toLocationId" IS NOT NULL THEN 'adjustment_gain'
                    WHEN p.type = 'ADJUSTMENT' THEN 'adjustment_loss'
                    WHEN p.type = 'TRANSFER' THEN 'transfer'
                    WHEN p.type = 'OUT' THEN 'unattributed_out'
                    WHEN p.type = 'IN' THEN 'unattributed_in'
                    ELSE lower(p.type::text)
                END flow
            FROM paired p
            LEFT JOIN journals j ON j."movementId" = p.id
        ), valid_reversal_sources AS (
            SELECT "pairedSourceId" id
            FROM base
            WHERE reference LIKE 'VOID:%'
                AND "pairedSourceId" IS NOT NULL
                AND "inverseJournal"
                AND "sourceCreatedAt" >= ${start}
                AND "sourceCreatedAt" <= ${end}
        ), analyzed AS (
            SELECT b.*,
                EXISTS (
                    SELECT 1 FROM valid_reversal_sources v WHERE v.id = b.id
                ) "suppressedSource",
                (b."offBalance" OR (
                    b.type = 'TRANSFER'
                    AND b."fromLocationId" IS NOT NULL
                    AND b."toLocationId" IS NOT NULL
                    AND b."fromLocationType" = 'INTERNAL'
                    AND b."toLocationType" = 'INTERNAL'
                )) "noJournalExpected",
                (b.flow <> 'purchase_return'
                    AND b.type <> 'TRANSFER'
                    AND NOT b."offBalance") "directJournalExpected",
                (NOT EXISTS (
                    SELECT 1 FROM valid_reversal_sources v WHERE v.id = b.id
                ) AND NOT COALESCE(
                    b.reference LIKE 'VOID:%'
                    AND b."pairedSourceId" IS NOT NULL
                    AND b."inverseJournal"
                    AND b."sourceCreatedAt" >= ${start}
                    AND b."sourceCreatedAt" <= ${end},
                    false
                )) "activeEconomicFlow"
            FROM base b
        ), production_cross_period AS (
            SELECT "productionOrderId" id,
                SUM("movementValue") FILTER (WHERE type = 'OUT') amount
            FROM analyzed
            WHERE "productionOrderId" IS NOT NULL AND "activeEconomicFlow"
                AND NOT "offBalance"
            GROUP BY "productionOrderId"
            HAVING COUNT(*) FILTER (
                WHERE type = 'OUT' AND COALESCE(reference, '') NOT LIKE 'VOID:%'
            ) > 0 AND COUNT(*) FILTER (
                WHERE type = 'IN' AND "productVariantId" = "outputVariantId"
                    AND COALESCE(reference, '') NOT LIKE 'VOID:%'
            ) = 0
        ), finding_rows AS (
            SELECT id "sourceId", 'ZERO_VALUED_INVENTORY_MOVEMENT' code,
                'movement'::text area, flow,
                'persisted_movement_value'::text "amountBasis", 0::numeric amount,
                0::numeric materiality,
                'Persisted movement valuation is zero or unavailable; this does not mean stock quantity or economic value is zero.' reason,
                'Current standardCost, buyPrice, or averageCost is not historical movement evidence.' "evidenceLimit",
                unit
            FROM analyzed
            WHERE NOT "noJournalExpected" AND NOT "suppressedSource"
                AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                AND (cost IS NULL OR "movementValue" = 0)
            UNION ALL
            SELECT id, 'INVENTORY_MOVEMENT_WITHOUT_JOURNAL',
                CASE WHEN flow LIKE 'production_%' THEN 'production'
                    WHEN flow LIKE '%return%' THEN 'return' ELSE 'movement' END,
                flow, 'persisted_movement_value', "movementValue", "movementValue",
                'Valued stock movement has no directly attributable inventory journal.',
                'The condition is confirmed; policy intent and accounting correction remain needs_review.', unit
            FROM analyzed
            WHERE "directJournalExpected" AND NOT "suppressedSource"
                AND COALESCE(reference, '') NOT LIKE 'VOID:%' AND "movementValue" > 0
                AND "activeJournals" = 0
            UNION ALL
            SELECT id, 'INVENTORY_JOURNAL_VECTOR_INVALID',
                CASE WHEN flow LIKE 'production_%' THEN 'production'
                    WHEN flow LIKE '%return%' THEN 'return' ELSE 'movement' END,
                flow, 'posted_inventory_gl',
                GREATEST(ABS("inventoryDebit"), ABS("inventoryCredit")),
                GREATEST(ABS(debit), ABS(credit)),
                'Journal status, balance, or semantic debit/credit vector does not match the stock-flow contract.',
                'Condition confirmed from mapped accounts; business intent and correction remain needs_review.', unit
            FROM analyzed
            WHERE "directJournalExpected" AND NOT "suppressedSource"
                AND COALESCE(reference, '') NOT LIKE 'VOID:%' AND "activeJournals" > 0
                AND ("activeJournals" <> 1 OR "postedAutoJournals" <> 1
                    OR debit <> credit OR debit <= 0
                    OR (flow = 'receipt' AND "inventoryAccountId" IS NOT NULL
                        AND "inventoryDebit" <= 0)
                    OR (flow = 'shipment' AND "inventoryAccountId" IS NOT NULL
                        AND ("inventoryCredit" <= 0 OR (
                            "cogsAccountId" IS NOT NULL AND "cogsDebit" <= 0
                        )))
                    OR (flow = 'production_issue'
                        AND "inventoryAccountId" IS NOT NULL
                        AND ("inventoryCredit" <= 0 OR (
                            "wipAccountId" IS NOT NULL AND "wipDebit" <= 0
                        )))
                    OR (flow = 'production_output'
                        AND "inventoryAccountId" IS NOT NULL
                        AND ("inventoryDebit" <= 0 OR (
                            "wipAccountId" IS NOT NULL AND "wipCredit" <= 0
                        )))
                    OR (flow = 'sales_return_good'
                        AND "inventoryAccountId" IS NOT NULL
                        AND ("inventoryDebit" <= 0 OR (
                            "cogsAccountId" IS NOT NULL AND "cogsCredit" <= 0
                        )))
                    OR (flow = 'adjustment_gain'
                        AND "inventoryAccountId" IS NOT NULL
                        AND "inventoryDebit" <= 0)
                    OR (flow = 'adjustment_loss'
                        AND "inventoryAccountId" IS NOT NULL
                        AND "inventoryCredit" <= 0))
            UNION ALL
            SELECT id, 'INVENTORY_COST_POSTED_OUTSIDE_ASSET', 'movement', flow,
                'posted_inventory_gl',
                GREATEST(ABS("assetDebit"), ABS("assetCredit")),
                GREATEST(ABS("assetDebit"), ABS("assetCredit")),
                'The journal has an ASSET side but not the product mapped inventory account.',
                'Broad ASSET/CURRENT_ASSET is not accepted as inventory proof.', unit
            FROM analyzed
            WHERE "inventoryAccountId" IS NOT NULL
                AND "directJournalExpected" AND NOT "suppressedSource"
                AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                AND ((flow IN ('receipt','production_output','sales_return_good','adjustment_gain')
                        AND "assetDebit" > 0 AND "inventoryDebit" <= 0)
                    OR (flow IN ('shipment','production_issue','adjustment_loss')
                        AND "assetCredit" > 0 AND "inventoryCredit" <= 0))
            UNION ALL
            SELECT id, 'STOCK_VALUE_BASIS_UNATTRIBUTED', 'movement', flow,
                CASE WHEN GREATEST(ABS("assetDebit"), ABS("assetCredit")) > 0
                    THEN 'posted_inventory_gl' ELSE 'persisted_movement_value' END,
                CASE WHEN GREATEST(ABS("assetDebit"), ABS("assetCredit")) > 0
                    THEN GREATEST(ABS("assetDebit"), ABS("assetCredit"))
                    ELSE "movementValue" END,
                GREATEST("movementValue", ABS("assetDebit"), ABS("assetCredit")),
                'Product inventory account mapping or exact movement-to-document lineage is unavailable.',
                'Do not infer inventory role from account category or code prefix.', unit
            FROM analyzed
            WHERE NOT "suppressedSource" AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                AND ("inventoryAccountId" IS NULL OR flow = 'purchase_return')
                AND NOT "offBalance"
            UNION ALL
            SELECT id, 'MOVEMENT_JOURNAL_VALUE_MISMATCH', 'movement', flow,
                'persisted_movement_value', "movementValue", "movementValue",
                'Persisted movement value differs from the mapped inventory side of the posted journal by more than Rp0.01.',
                CASE WHEN flow = 'receipt'
                    THEN 'Receipt journalTotal may carry persisted rounding allocation; interpretation remains needs_review.'
                    ELSE 'Movement cost and posted GL are separate amount bases.' END, unit
            FROM analyzed
            WHERE NOT "suppressedSource" AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                AND cost IS NOT NULL AND "movementValue" > 0
                AND "inventoryAccountId" IS NOT NULL
                AND GREATEST(ABS("inventoryDebit"), ABS("inventoryCredit")) > 0
                AND ABS("movementValue" - GREATEST(
                    ABS("inventoryDebit"), ABS("inventoryCredit")
                )) > 0.01
            UNION ALL
            SELECT id, 'INVENTORY_ADJUSTMENT_GAIN_LOSS', 'policy', flow,
                CASE WHEN GREATEST(ABS("inventoryDebit"), ABS("inventoryCredit")) > 0
                    THEN 'posted_inventory_gl' ELSE 'persisted_movement_value' END,
                GREATEST("movementValue", ABS("inventoryDebit"), ABS("inventoryCredit")),
                GREATEST("movementValue", ABS("inventoryDebit"), ABS("inventoryCredit")),
                'Adjustment changes inventory and gain/loss according to direction; it is not automatically material consumption or COGS.',
                'Business reason and appropriateness remain needs_review.', unit
            FROM analyzed
            WHERE type = 'ADJUSTMENT' AND NOT "offBalance"
                AND COALESCE(reference, '') NOT LIKE 'VOID:%' AND NOT "suppressedSource"
            UNION ALL
            SELECT id, 'TRANSFER_NON_FINANCIAL_EXPECTED', 'policy', flow,
                'none', 0, 0,
                'Internal transfer changes location custody without economic gain/loss; no journal is expected.',
                'Only transfers between INTERNAL locations receive this treatment.', unit
            FROM analyzed
            WHERE type = 'TRANSFER' AND "fromLocationId" IS NOT NULL
                AND "toLocationId" IS NOT NULL
                AND "fromLocationType" = 'INTERNAL'
                AND "toLocationType" = 'INTERNAL'
            UNION ALL
            SELECT id, 'OFF_BALANCE_MOVEMENT_EXCLUDED', 'policy', flow,
                'none', 0, 0,
                'Maklon/customer-owned movement is off-balance and excluded from company inventory GL expectations.',
                'Exclusion uses persisted Maklon/order/location semantics, not zero value alone.', unit
            FROM analyzed WHERE "offBalance"
            UNION ALL
            SELECT id,
                CASE
                    WHEN "pairedSourceId" IS NOT NULL AND "inverseJournal"
                        AND "sourceCreatedAt" >= ${start}
                        AND "sourceCreatedAt" <= ${end}
                        THEN 'VALID_INVENTORY_REVERSAL'
                    WHEN "pairedSourceId" IS NOT NULL AND "inverseJournal"
                        THEN 'CROSS_PERIOD_INVENTORY_REVERSAL'
                    ELSE 'INVALID_INVENTORY_REVERSAL'
                END,
                'movement', flow,
                CASE WHEN "movementValue" > 0
                    THEN 'persisted_movement_value' ELSE 'none' END,
                "movementValue", "movementValue",
                CASE
                    WHEN "pairedSourceId" IS NOT NULL AND "inverseJournal"
                        AND "sourceCreatedAt" >= ${start}
                        AND "sourceCreatedAt" <= ${end}
                        THEN 'Exact paired reversal with inverse posted journal vector is excluded from active flow.'
                    WHEN "pairedSourceId" IS NOT NULL AND "inverseJournal"
                        THEN 'Valid reversal crosses the period boundary; the source period is not silently erased.'
                    ELSE 'Reversal source or exact-inverse journal vector cannot be proved.'
                END,
                'Pairing requires one source candidate and one POSTED auto journal per side with account-by-account net zero.', unit
            FROM analyzed
            WHERE reference LIKE 'VOID:%' AND NOT "offBalance"
            UNION ALL
            SELECT id, 'MATERIAL_COST_REMAINS_IN_WIP', 'production',
                'production_issue', 'persisted_movement_value',
                COALESCE(amount, 0), ABS(COALESCE(amount, 0)),
                'Material issue has no production output in the same period; cost may remain in WIP or cross the period.',
                'No exact opening WIP or output-to-shipment lot lineage is reconstructed.', NULL
            FROM production_cross_period
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY code, "amountBasis"
                ORDER BY materiality DESC, "sourceId"
            ) rn
            FROM finding_rows
        ), grouped AS (
            SELECT code, area, flow, "amountBasis", COUNT(*) count,
                SUM(amount) amount, SUM(materiality) materiality,
                MIN(reason) reason, MIN("evidenceLimit") "evidenceLimit",
                jsonb_agg(jsonb_build_object(
                    'sourceId', "sourceId", 'flow', flow, 'unit', unit,
                    'amount', amount::text, 'materiality', materiality::text,
                    'reason', reason
                ) ORDER BY materiality DESC, "sourceId")
                    FILTER (WHERE rn <= ${SAMPLE_LIMIT}) samples
            FROM ranked
            GROUP BY code, area, flow, "amountBasis"
        ), quantity_groups AS (
            SELECT "productVariantId", unit,
                SUM(quantity) FILTER (
                    WHERE "toLocationId" IS NOT NULL AND type <> 'TRANSFER'
                ) inbound,
                SUM(quantity) FILTER (
                    WHERE "fromLocationId" IS NOT NULL AND type <> 'TRANSFER'
                ) outbound,
                SUM(quantity) FILTER (WHERE type = 'TRANSFER') transfer
            FROM analyzed
            WHERE "activeEconomicFlow"
            GROUP BY "productVariantId", unit
        )
        SELECT jsonb_build_object(
            'metrics', jsonb_build_object(
                'movementCount', COUNT(*),
                'coveredCount', COUNT(*) FILTER (
                    WHERE NOT "noJournalExpected" AND "activeJournals" = 1
                        AND "postedAutoJournals" = 1 AND debit = credit
                        AND debit > 0 AND NOT "suppressedSource"
                        AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                ),
                'unvaluedCount', COUNT(*) FILTER (
                    WHERE NOT "noJournalExpected" AND NOT "suppressedSource"
                        AND COALESCE(reference, '') NOT LIKE 'VOID:%'
                        AND (cost IS NULL OR "movementValue" = 0)
                ),
                'withoutJournalCount', COUNT(*) FILTER (
                    WHERE "directJournalExpected" AND NOT "suppressedSource"
                        AND COALESCE(reference, '') NOT LIKE 'VOID:%' AND "movementValue" > 0
                        AND "activeJournals" = 0
                ),
                'invalidJournalCount', (
                    SELECT COALESCE(SUM(count), 0) FROM grouped
                    WHERE code IN ('INVENTORY_JOURNAL_VECTOR_INVALID',
                        'INVENTORY_COST_POSTED_OUTSIDE_ASSET')
                ),
                'valueMismatchCount', (
                    SELECT COALESCE(SUM(count), 0) FROM grouped
                    WHERE code = 'MOVEMENT_JOURNAL_VALUE_MISMATCH'
                ),
                'semanticRoleUnknownCount', (
                    SELECT COALESCE(SUM(count), 0) FROM grouped
                    WHERE code = 'STOCK_VALUE_BASIS_UNATTRIBUTED'
                ),
                'validReversalCount', COUNT(*) FILTER (
                    WHERE reference LIKE 'VOID:%' AND "pairedSourceId" IS NOT NULL
                        AND "inverseJournal" AND "sourceCreatedAt" >= ${start}
                        AND "sourceCreatedAt" <= ${end}
                ),
                'invalidReversalCount', COUNT(*) FILTER (
                    WHERE reference LIKE 'VOID:%' AND NOT "offBalance"
                        AND ("pairedSourceId" IS NULL OR NOT "inverseJournal")
                ),
                'crossPeriodReversalCount', COUNT(*) FILTER (
                    WHERE reference LIKE 'VOID:%' AND "pairedSourceId" IS NOT NULL
                        AND "inverseJournal" AND ("sourceCreatedAt" < ${start}
                            OR "sourceCreatedAt" > ${end})
                ),
                'receiptCount', COUNT(*) FILTER (
                    WHERE flow = 'receipt' AND "activeEconomicFlow"
                ),
                'shipmentCount', COUNT(*) FILTER (
                    WHERE flow = 'shipment' AND "activeEconomicFlow"
                ),
                'issueCount', COUNT(*) FILTER (
                    WHERE flow = 'production_issue' AND "activeEconomicFlow"
                ),
                'outputCount', COUNT(*) FILTER (
                    WHERE flow = 'production_output' AND "activeEconomicFlow"
                ),
                'goodReturnCount', COUNT(*) FILTER (
                    WHERE flow = 'sales_return_good' AND "activeEconomicFlow"
                ),
                'damagedReturnCount', (
                    SELECT COUNT(*)
                    FROM "SalesReturnReceiptLine" r
                    JOIN "SalesReturnItem" i ON i.id = r."returnItemId"
                    WHERE i.condition = 'DAMAGED'
                        AND r."receivedAt" >= ${start}
                        AND r."receivedAt" <= ${end}
                ),
                'purchaseReturnCount', COUNT(*) FILTER (
                    WHERE flow = 'purchase_return' AND "activeEconomicFlow"
                ),
                'adjustmentGainCount', COUNT(*) FILTER (
                    WHERE flow = 'adjustment_gain' AND "activeEconomicFlow"
                ),
                'adjustmentLossCount', COUNT(*) FILTER (
                    WHERE flow = 'adjustment_loss' AND "activeEconomicFlow"
                ),
                'internalTransferCount', COUNT(*) FILTER (
                    WHERE type = 'TRANSFER' AND "fromLocationType" = 'INTERNAL'
                        AND "toLocationType" = 'INTERNAL'
                ),
                'offBalanceCount', COUNT(*) FILTER (WHERE "offBalance"),
                'crossPeriodProductionCount', (
                    SELECT COUNT(*) FROM production_cross_period
                )
            ),
            'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code', code, 'area', area, 'flow', flow,
                'amountBasis', "amountBasis", 'count', count,
                'amount', amount::text, 'materiality', materiality::text,
                'reason', reason, 'evidenceLimit', "evidenceLimit",
                'samples', samples
            ) ORDER BY "amountBasis", materiality DESC, code) FROM grouped),
            '[]'::jsonb),
            'quantities', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'productVariantId', "productVariantId", 'unit', unit,
                'inbound', COALESCE(inbound, 0)::text,
                'outbound', COALESCE(outbound, 0)::text,
                'transfer', COALESCE(transfer, 0)::text
            ) ORDER BY unit, "productVariantId") FROM quantity_groups),
            '[]'::jsonb)
        ) payload
        FROM analyzed
    `);
}

export async function diagnoseInventoryEconomicCompleteness(
    tx: Prisma.TransactionClient,
    input: unknown,
) {
    const range = financeRange(input);
    // Sequential set-based snapshots keep pressure bounded inside the read-only transaction.
    const gl = await glSnapshot(tx, range.start, range.end);
    const movements = await movementSnapshot(tx, range.start, range.end);
    return assembleInventoryEconomicDiagnosis(range, { gl, movements });
}

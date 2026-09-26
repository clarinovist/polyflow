import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { getWibDayBounds } from '@/lib/utils/timezone';
import { executionScrapTotal } from '@/lib/production/execution-scrap';
import { processKeyFromCategory } from '@/lib/production/process-keys';
import {
    REPORT_PAGE_SIZE,
    UNASSIGNED,
    parseOutputReportFilter,
    type OutputOrderRow,
    type OutputReport,
    type OutputReportEntry,
    type OutputReportFilter,
    type OutputReportRow,
    type ReportOption,
} from '@/lib/production/output-report';

const SELECT = {
    id: true,
    startTime: true,
    endTime: true,
    quantityProduced: true,
    scrapQuantity: true,
    scrapProngkolQty: true,
    scrapDaunQty: true,
    enteredQuantity: true,
    enteredUnit: true,
    pieceMachineType: true,
    operator: { select: { id: true, name: true } },
    shift: { select: { operator: { select: { id: true, name: true } } } },
    machine: { select: { id: true, code: true, name: true } },
    productionOrder: {
        select: {
            id: true,
            orderNumber: true,
            status: true,
            plannedQuantity: true,
            plannedStartDate: true,
            bom: {
                select: {
                    category: true,
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                            product: {
                                select: { name: true, productType: true },
                            },
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.ProductionExecutionSelect;
export type OutputExecution = Prisma.ProductionExecutionGetPayload<{
    select: typeof SELECT;
}>;

function toEntry(exec: OutputExecution): OutputReportEntry {
    const order = exec.productionOrder;
    const variant = order.bom.productVariant;
    const operator = exec.operator ?? exec.shift?.operator;
    // Source columns have four decimal places; remove binary addition noise
    // from the shared max(generic, prongkol + daun) helper before accumulating.
    const scrap = new Prisma.Decimal(executionScrapTotal(exec))
        .toDecimalPlaces(4)
        .toString();
    return {
        id: exec.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        productVariantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.skuCode,
        productType: variant.product.productType,
        process: processKeyFromCategory(order.bom.category),
        category: order.bom.category,
        unit: variant.primaryUnit,
        startTime: exec.startTime.toISOString(),
        endTime: exec.endTime?.toISOString() ?? null,
        operatorId: operator?.id ?? UNASSIGNED,
        operatorName: operator?.name ?? 'Belum tercatat',
        operatorSource: exec.operator
            ? 'execution'
            : operator
              ? 'shift'
              : 'missing',
        machineId: exec.machine?.id ?? UNASSIGNED,
        machineName: exec.machine
            ? `${exec.machine.code} — ${exec.machine.name}`
            : exec.pieceMachineType
              ? `${exec.pieceMachineType} (tanpa mesin)`
              : 'Belum tercatat',
        produced: exec.quantityProduced.toString(),
        scrapRaw: String(scrap),
        // Affal has no unit snapshot. Desktop uses kg; kiosk uses primaryUnit.
        // Only KG is unambiguous across both paths. Never label non-KG affal as kg.
        scrapKg: variant.primaryUnit === 'KG' ? String(scrap) : null,
        enteredQuantity: exec.enteredQuantity?.toString() ?? null,
        enteredUnit: exec.enteredUnit,
    };
}
function options(
    entries: OutputReportEntry[],
    key: 'product' | 'operator' | 'machine',
): ReportOption[] {
    const found = new Map<string, string>();
    for (const entry of entries) {
        if (key === 'product')
            found.set(
                entry.productVariantId,
                `${entry.productName} · ${entry.variantName} (${entry.sku})`,
            );
        else if (key === 'operator')
            found.set(entry.operatorId, entry.operatorName);
        else
            found.set(
                entry.machineId,
                entry.machineId === UNASSIGNED
                    ? 'Belum tercatat'
                    : entry.machineName,
            );
    }
    return [...found]
        .map(([id, label]) => ({ id, label }))
        .sort(
            (a, b) =>
                a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
        );
}
function matches(
    entry: OutputReportEntry,
    filter: OutputReportFilter,
): boolean {
    const text =
        `${entry.productName} ${entry.variantName} ${entry.sku}`.toLocaleLowerCase(
            'id-ID',
        );
    return (
        (!filter.process || entry.process === filter.process) &&
        (!filter.productVariantId ||
            entry.productVariantId === filter.productVariantId) &&
        (!filter.operatorId || entry.operatorId === filter.operatorId) &&
        (!filter.machineId || entry.machineId === filter.machineId) &&
        (!filter.q || text.includes(filter.q.toLocaleLowerCase('id-ID')))
    );
}
interface Aggregate {
    row: OutputReportRow;
    produced: Prisma.Decimal;
    scrap: Prisma.Decimal;
    orders: Set<string>;
    operators: Map<string, string>;
}
function aggregate(
    entries: OutputReportEntry[],
    byOperator: boolean,
): OutputReportRow[] {
    const groups = new Map<string, Aggregate>();
    for (const entry of entries) {
        const key = JSON.stringify([
            entry.productVariantId,
            entry.process,
            entry.unit,
            byOperator ? entry.operatorId : null,
        ]);
        let group = groups.get(key);
        if (!group) {
            group = {
                row: {
                    key,
                    productVariantId: entry.productVariantId,
                    productName: entry.productName,
                    variantName: entry.variantName,
                    sku: entry.sku,
                    productType: entry.productType,
                    process: entry.process,
                    unit: entry.unit,
                    operatorId: byOperator ? entry.operatorId : null,
                    operators: [],
                    produced: '0',
                    scrapKg: entry.scrapKg === null ? null : '0',
                    entries: 0,
                    orders: 0,
                },
                produced: new Prisma.Decimal(0),
                scrap: new Prisma.Decimal(0),
                orders: new Set(),
                operators: new Map(),
            };
            groups.set(key, group);
        }
        group.produced = group.produced.plus(entry.produced);
        group.scrap = group.scrap.plus(entry.scrapKg ?? 0);
        group.orders.add(entry.orderId);
        group.operators.set(entry.operatorId, entry.operatorName);
        group.row.entries++;
    }
    return [...groups.values()]
        .map(({ row, produced, scrap, orders, operators }) => ({
            ...row,
            produced: produced.toString(),
            scrapKg: row.scrapKg === null ? null : scrap.toString(),
            orders: orders.size,
            operators: [...operators]
                .map(([id, label]) => ({ id, label }))
                .sort(
                    (a, b) =>
                        a.label.localeCompare(b.label) ||
                        a.id.localeCompare(b.id),
                ),
        }))
        .sort(
            (a, b) =>
                (byOperator
                    ? a.operators[0].label.localeCompare(b.operators[0].label)
                    : 0) ||
                a.productName.localeCompare(b.productName) ||
                a.variantName.localeCompare(b.variantName) ||
                a.key.localeCompare(b.key),
        );
}

interface OrderMeta {
    status: string;
    plannedQuantity: Prisma.Decimal;
    plannedStartDate: Date;
}
function orderMetas(executions: OutputExecution[]): Map<string, OrderMeta> {
    // SPK-level target is stored once on the order; dedupe before aggregating.
    const metas = new Map<string, OrderMeta>();
    for (const exec of executions) {
        const order = exec.productionOrder;
        if (!metas.has(order.id)) {
            metas.set(order.id, {
                status: order.status,
                plannedQuantity: new Prisma.Decimal(order.plannedQuantity),
                plannedStartDate: order.plannedStartDate,
            });
        }
    }
    return metas;
}
function aggregateOrders(
    entries: OutputReportEntry[],
    metas: Map<string, OrderMeta>,
    cumulative: Map<string, Prisma.Decimal>,
): OutputOrderRow[] {
    const groups = new Map<
        string,
        { row: OutputOrderRow; period: Prisma.Decimal }
    >();
    for (const entry of entries) {
        const meta = metas.get(entry.orderId);
        if (!meta) continue;
        let group = groups.get(entry.orderId);
        if (!group) {
            group = {
                row: {
                    orderId: entry.orderId,
                    orderNumber: entry.orderNumber,
                    status: meta.status,
                    plannedStartDate: meta.plannedStartDate.toISOString(),
                    productVariantId: entry.productVariantId,
                    productName: entry.productName,
                    variantName: entry.variantName,
                    sku: entry.sku,
                    productType: entry.productType,
                    unit: entry.unit,
                    hasTarget: meta.plannedQuantity.gt(0),
                    target: meta.plannedQuantity.toString(),
                    producedInPeriod: '0',
                    producedCumulative: '0',
                    difference: null,
                    achievement: null,
                },
                period: new Prisma.Decimal(0),
            };
            groups.set(entry.orderId, group);
        }
        group.period = group.period.plus(entry.produced);
    }
    return [...groups.values()]
        .map(({ row, period }) => {
            const target = new Prisma.Decimal(row.target);
            const producedCumulative =
                cumulative.get(row.orderId) ?? new Prisma.Decimal(0);
            return {
                ...row,
                producedInPeriod: period.toString(),
                producedCumulative: producedCumulative.toString(),
                difference: row.hasTarget
                    ? producedCumulative.minus(target).toString()
                    : null,
                // Target 0/absent is reported as "tanpa target", never infinity.
                achievement: row.hasTarget
                    ? producedCumulative
                          .div(target)
                          .times(100)
                          .toDecimalPlaces(1)
                          .toString()
                    : null,
            };
        })
        .sort(
            (a, b) =>
                b.plannedStartDate.localeCompare(a.plannedStartDate) ||
                a.orderNumber.localeCompare(b.orderNumber),
        );
}
async function orderReportRows(
    entries: OutputReportEntry[],
    metas: Map<string, OrderMeta>,
): Promise<OutputOrderRow[]> {
    const orderIds = [...new Set(entries.map((entry) => entry.orderId))];
    if (orderIds.length === 0) return [];
    // Cumulative SPK progress is read once per order so a shared target is
    // never multiplied by the number of executions that reference it.
    const sums = await prisma.productionExecution.groupBy({
        by: ['productionOrderId'],
        where: {
            status: { not: 'VOIDED' },
            productionOrderId: { in: orderIds },
        },
        _sum: { quantityProduced: true },
    });
    const cumulative = new Map<string, Prisma.Decimal>(
        sums.map((row) => [
            row.productionOrderId,
            row._sum.quantityProduced ?? new Prisma.Decimal(0),
        ]),
    );
    return aggregateOrders(entries, metas, cumulative);
}

export class ProductionOutputReportService {
    /** Caller must authorize and enter tenant context. No cache, mutations, or truncated period totals. */
    static async getReport(input: OutputReportFilter): Promise<OutputReport> {
        const filter = parseOutputReportFilter({
            ...input,
            page: String(input.page),
        });
        // One statement gives options, summary and detail the same database snapshot.
        // Bounds cap the period; display pagination happens only AFTER matching/aggregation.
        const executions = await prisma.productionExecution.findMany({
            where: {
                status: { not: 'VOIDED' },
                startTime: {
                    gte: getWibDayBounds(filter.from).startOfDay,
                    lte: getWibDayBounds(filter.to).endOfDay,
                },
            },
            select: SELECT,
            orderBy: [{ startTime: 'desc' }, { id: 'asc' }],
        });
        const periodEntries = executions
            .filter(
                (exec) =>
                    exec.endTime !== null ||
                    !exec.quantityProduced.isZero() ||
                    executionScrapTotal(exec) !== 0,
            )
            .map(toEntry);
        const entries = periodEntries.filter((entry) => matches(entry, filter));
        const totals = new Map<
            string,
            {
                process: OutputReportEntry['process'];
                unit: string;
                produced: Prisma.Decimal;
            }
        >();
        for (const entry of entries) {
            const key = `${entry.process}:${entry.unit}`;
            const total = totals.get(key) ?? {
                process: entry.process,
                unit: entry.unit,
                produced: new Prisma.Decimal(0),
            };
            total.produced = total.produced.plus(entry.produced);
            totals.set(key, total);
        }
        const rows =
            filter.mode === 'entries' || filter.mode === 'order'
                ? []
                : aggregate(entries, filter.mode === 'operator');
        const orderRows =
            filter.mode === 'order'
                ? await orderReportRows(entries, orderMetas(executions))
                : [];
        const totalRows =
            filter.mode === 'entries'
                ? entries.length
                : filter.mode === 'order'
                  ? orderRows.length
                  : rows.length;
        const pageCount = Math.max(1, Math.ceil(totalRows / REPORT_PAGE_SIZE));
        const page = Math.min(filter.page, pageCount);
        const start = (page - 1) * REPORT_PAGE_SIZE;
        return {
            filter: { ...filter, page },
            options: {
                products: options(periodEntries, 'product'),
                operators: options(periodEntries, 'operator'),
                machines: options(periodEntries, 'machine'),
            },
            summary: {
                products: new Set(entries.map((e) => e.productVariantId)).size,
                entries: entries.length,
                orders: new Set(entries.map((e) => e.orderId)).size,
                totals: [...totals.values()]
                    .map((t) => ({ ...t, produced: t.produced.toString() }))
                    .sort(
                        (a, b) =>
                            a.process.localeCompare(b.process) ||
                            a.unit.localeCompare(b.unit),
                    ),
            },
            rows: rows.slice(start, start + REPORT_PAGE_SIZE),
            orders:
                filter.mode === 'order'
                    ? orderRows.slice(start, start + REPORT_PAGE_SIZE)
                    : [],
            entries:
                filter.mode === 'entries'
                    ? entries.slice(start, start + REPORT_PAGE_SIZE)
                    : [],
            totalRows,
            pageCount,
        };
    }
}

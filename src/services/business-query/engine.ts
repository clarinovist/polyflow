import type { Prisma } from '@prisma/client';
import {
    financeLedgerQuerySchema,
    queryFinanceLedger,
    type FinanceLedgerQueryInput,
    type FinanceLedgerQueryResult,
} from './finance-ledger-query';

export interface BusinessDatasetDefinition {
    id: string;
    domain: 'finance';
    requestDataset: 'ledger_lines' | 'ledger_expenses';
    requiredResource: string;
    metric: 'debit_credit' | 'net_expense';
    searchableFields: readonly string[];
    statusPolicy: 'POSTED';
    maxRangeDays: number;
}

/**
 * Semantic catalog for model-facing business queries. Add a dataset here only
 * after its metric, permission, status and evidence semantics are deterministic.
 */
export const BUSINESS_DATASET_CATALOG: readonly BusinessDatasetDefinition[] = [
    {
        id: 'finance.ledger_lines',
        domain: 'finance',
        requestDataset: 'ledger_lines',
        requiredResource: '/finance/reports/general-ledger',
        metric: 'debit_credit',
        searchableFields: [
            'account.code',
            'account.name',
            'journalLine.description',
            'journalEntry.entryNumber',
            'journalEntry.description',
            'journalEntry.reference',
            'journalEntry.details',
        ],
        statusPolicy: 'POSTED',
        maxRangeDays: 366,
    },
    {
        id: 'finance.ledger_expenses',
        domain: 'finance',
        requestDataset: 'ledger_expenses',
        requiredResource: '/finance/reports/general-ledger',
        metric: 'net_expense',
        searchableFields: [
            'account.code',
            'account.name',
            'journalLine.description',
            'journalEntry.entryNumber',
            'journalEntry.description',
            'journalEntry.reference',
            'journalEntry.details',
        ],
        statusPolicy: 'POSTED',
        maxRangeDays: 366,
    },
] as const;

const catalogByRequestDataset = new Map(
    BUSINESS_DATASET_CATALOG.map((definition) => [
        definition.requestDataset,
        definition,
    ]),
);

export type BusinessQueryExecutionOptions = {
    db?: Pick<Prisma.TransactionClient, 'journalLine'>;
    now?: Date;
};

/**
 * Stable executor boundary shared by UI/actions and Pi Durable tools. Models
 * choose only catalogued dataset/filter values; dataset executors own the SQL
 * shape and financial formula.
 */
export async function executeBusinessQuery(
    rawInput: FinanceLedgerQueryInput,
    options: BusinessQueryExecutionOptions = {},
): Promise<FinanceLedgerQueryResult> {
    const input = financeLedgerQuerySchema.parse(rawInput);
    const definition = catalogByRequestDataset.get(input.dataset);
    // The strict schema currently guarantees this lookup. Keep the registry
    // assertion explicit so a future enum/catalog drift fails before dispatch.
    if (!definition) {
        throw new TypeError('BUSINESS_QUERY_DATASET_NOT_REGISTERED');
    }
    return queryFinanceLedger(input, options);
}

export function getBusinessDataset(
    requestDataset: FinanceLedgerQueryInput['dataset'],
): BusinessDatasetDefinition | undefined {
    return requestDataset
        ? catalogByRequestDataset.get(requestDataset)
        : undefined;
}

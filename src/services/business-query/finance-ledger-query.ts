import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import {
    getWibDayBounds,
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import { nonClosingJournalFilter } from '@/services/accounting/closing-reference-filter';

export const FINANCE_LEDGER_DATASETS = [
    'ledger_lines',
    'ledger_expenses',
] as const;
export type FinanceLedgerDataset = (typeof FINANCE_LEDGER_DATASETS)[number];
export const FINANCE_DATE_PRESETS = [
    'CURRENT_MONTH',
    'LAST_90_DAYS',
    'CURRENT_YEAR',
] as const;
export type FinanceDatePreset = (typeof FINANCE_DATE_PRESETS)[number];

const keywordSchema = z.string().trim().min(2).max(240);
const dateOnlySchema = z.string().refine((value) => {
    try {
        parseBusinessDate(value);
        return true;
    } catch {
        return false;
    }
}, 'Tanggal harus berupa kalender valid YYYY-MM-DD');

export const financeLedgerQuerySchema = z
    .object({
        dataset: z.enum(FINANCE_LEDGER_DATASETS).default('ledger_lines'),
        keywords: z
            .array(keywordSchema)
            .min(1)
            .max(8)
            .describe(
                'Kata kunci spesifik. Semua kata harus ditemukan, tetapi boleh tersebar pada akun, keterangan, nomor jurnal, referensi, atau detail jurnal.',
            ),
        startDate: dateOnlySchema
            .optional()
            .describe(
                'Tanggal awal YYYY-MM-DD inklusif WIB. Isi bersama endDate; bila kosong gunakan datePreset.',
            ),
        endDate: dateOnlySchema
            .optional()
            .describe(
                'Tanggal akhir YYYY-MM-DD inklusif WIB. Isi bersama startDate; bila kosong gunakan datePreset.',
            ),
        datePreset: z.enum(FINANCE_DATE_PRESETS).default('CURRENT_MONTH'),
        limit: z.number().int().min(1).max(50).default(20),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (value.keywords.join(' ').length > 240) {
            ctx.addIssue({
                code: 'custom',
                path: ['keywords'],
                message: 'Gabungan kata kunci maksimal 240 karakter',
            });
        }
        if (Boolean(value.startDate) !== Boolean(value.endDate)) {
            ctx.addIssue({
                code: 'custom',
                message: 'startDate dan endDate harus diisi bersama',
            });
            return;
        }
        if (!value.startDate || !value.endDate) return;
        const start = Date.parse(value.startDate);
        const end = Date.parse(value.endDate);
        if (end < start || end - start > 365 * 86_400_000) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Rentang tanggal harus berurutan dan maksimal 366 hari inklusif',
            });
        }
    });

export type FinanceLedgerQueryInput = z.input<typeof financeLedgerQuerySchema>;
export type ParsedFinanceLedgerQuery = z.output<
    typeof financeLedgerQuerySchema
>;

const QUERY_STOPWORDS = new Set([
    'ada',
    'berapa',
    'cari',
    'cek',
    'dalam',
    'dari',
    'di',
    'ke',
    'untuk',
    'yang',
    'total',
    'transaksi',
    'jurnal',
    'buku',
    'besar',
    'terkait',
    'biaya',
    'muatan',
]);

/** Convert natural search text into bounded AND-keywords for the query engine. */
export function extractFinanceKeywords(
    input: string | readonly string[],
): string[] {
    const parts = Array.isArray(input) ? input : [input];
    const raw = parts
        .flatMap((part) => part.normalize('NFKC').split(/[^\p{L}\p{N}./-]+/u))
        .map((part) => part.trim().toLocaleLowerCase('id-ID'))
        .filter((part) => part.length >= 2 && part.length <= 60);
    const unique = [...new Set(raw)].slice(0, 8);
    const meaningful = unique.filter((part) => !QUERY_STOPWORDS.has(part));
    return (meaningful.length > 0 ? meaningful : unique).slice(0, 8);
}

export interface FinanceLedgerQueryRow {
    id: string;
    journalEntryId: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    entryNumber: string;
    entryDate: Date;
    description: string;
    journalDescription: string;
    reference: string | null;
    referenceType: string | null;
    debit: number;
    credit: number;
    netAmount: number;
    matchingDetails: Array<{ description: string; amount: number }>;
    matchedOn: string[];
}

export interface FinanceLedgerQueryResult {
    dataset: FinanceLedgerDataset;
    keywords: string[];
    period: {
        startDate: string;
        endDate: string;
        preset: FinanceDatePreset | null;
    };
    basis: string;
    totalCount: number;
    totalDebit: number;
    totalCredit: number;
    netAmount: number;
    rows: FinanceLedgerQueryRow[];
    truncated: boolean;
}

type LedgerQueryDb = Pick<Prisma.TransactionClient, 'journalLine'>;

function subtractCalendarDays(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - days))
        .toISOString()
        .slice(0, 10);
}

function resolvePeriod(
    input: ParsedFinanceLedgerQuery,
    now: Date,
): FinanceLedgerQueryResult['period'] & { start: Date; end: Date } {
    if (input.startDate && input.endDate) {
        return {
            startDate: input.startDate,
            endDate: input.endDate,
            preset: null,
            start: getWibDayBounds(input.startDate).startOfDay,
            end: getWibDayBounds(input.endDate).endOfDay,
        };
    }
    const endDate = toBusinessDateString(now);
    const year = endDate.slice(0, 4);
    const startDate =
        input.datePreset === 'CURRENT_MONTH'
            ? year + '-' + endDate.slice(5, 7) + '-01'
            : input.datePreset === 'CURRENT_YEAR'
              ? year + '-01-01'
              : subtractCalendarDays(endDate, 89);
    return {
        startDate,
        endDate,
        preset: input.datePreset,
        start: getWibDayBounds(startDate).startOfDay,
        end: getWibDayBounds(endDate).endOfDay,
    };
}

function contains(value: string): Prisma.StringFilter {
    return { contains: value, mode: 'insensitive' };
}

function keywordWhere(keyword: string): Prisma.JournalLineWhereInput {
    return {
        OR: [
            { description: contains(keyword) },
            {
                account: {
                    is: {
                        OR: [
                            { code: contains(keyword) },
                            { name: contains(keyword) },
                            { description: contains(keyword) },
                        ],
                    },
                },
            },
            {
                journalEntry: {
                    is: {
                        OR: [
                            { entryNumber: contains(keyword) },
                            { description: contains(keyword) },
                            { reference: contains(keyword) },
                            { referenceId: contains(keyword) },
                            {
                                details: {
                                    some: {
                                        OR: [
                                            { type: contains(keyword) },
                                            { description: contains(keyword) },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        ],
    };
}

/** The first expense keyword is the cost subject/category. It must match the
 * expense line/account (or structured journal detail), while later keywords may
 * be context such as customer, destination, vehicle or reference. This avoids
 * attributing every expense line in a multi-expense journal to a header-only
 * keyword such as "solar". */
function expenseSubjectWhere(keyword: string): Prisma.JournalLineWhereInput {
    return {
        OR: [
            { description: contains(keyword) },
            {
                account: {
                    is: {
                        OR: [
                            { code: contains(keyword) },
                            { name: contains(keyword) },
                            { description: contains(keyword) },
                        ],
                    },
                },
            },
            {
                journalEntry: {
                    is: {
                        details: {
                            some: {
                                OR: [
                                    { type: contains(keyword) },
                                    { description: contains(keyword) },
                                ],
                            },
                        },
                    },
                },
            },
        ],
    };
}

function matchingDetailWhere(
    keywords: string[],
): Prisma.JournalEntryDetailWhereInput {
    return {
        OR: keywords.flatMap((keyword) => [
            { type: contains(keyword) },
            { description: contains(keyword) },
        ]),
    };
}

function matchedFields(
    row: {
        description: string | null;
        account: { code: string; name: string; description: string | null };
        journalEntry: {
            entryNumber: string;
            description: string;
            reference: string | null;
            referenceId: string | null;
            details: Array<{ type: string; description: string }>;
        };
    },
    keywords: string[],
): string[] {
    const fields = [
        [
            'akun',
            row.account.code +
                ' ' +
                row.account.name +
                ' ' +
                (row.account.description ?? ''),
        ],
        ['keterangan baris', row.description ?? ''],
        ['nomor jurnal', row.journalEntry.entryNumber],
        ['keterangan jurnal', row.journalEntry.description],
        [
            'referensi',
            (row.journalEntry.reference ?? '') +
                ' ' +
                (row.journalEntry.referenceId ?? ''),
        ],
        [
            'detail jurnal',
            row.journalEntry.details
                .map((detail) => detail.type + ' ' + detail.description)
                .join(' '),
        ],
    ] as const;
    return fields
        .filter(([, value]) =>
            keywords.some((keyword) =>
                value.toLocaleLowerCase('id-ID').includes(keyword),
            ),
        )
        .map(([label]) => label);
}

/** Execute one allowlisted finance dataset query; callers cannot supply SQL or columns. */
export async function queryFinanceLedger(
    rawInput: FinanceLedgerQueryInput,
    options: { db?: LedgerQueryDb; now?: Date } = {},
): Promise<FinanceLedgerQueryResult> {
    const parsed = financeLedgerQuerySchema.parse(rawInput);
    const keywords = extractFinanceKeywords(parsed.keywords);
    if (keywords.length === 0) {
        throw new z.ZodError([
            {
                code: 'custom',
                path: ['keywords'],
                message: 'Minimal satu kata kunci bermakna diperlukan',
            },
        ]);
    }
    const period = resolvePeriod(parsed, options.now ?? new Date());
    const expenseOnly = parsed.dataset === 'ledger_expenses';
    const journalWhere: Prisma.JournalEntryWhereInput = {
        status: 'POSTED',
        entryDate: { gte: period.start, lte: period.end },
        ...(expenseOnly ? nonClosingJournalFilter() : {}),
    };
    const where: Prisma.JournalLineWhereInput = {
        ...(expenseOnly ? { account: { is: { type: 'EXPENSE' } } } : {}),
        AND: [
            { journalEntry: { is: journalWhere } },
            ...(expenseOnly ? [expenseSubjectWhere(keywords[0])] : []),
            ...keywords.map(keywordWhere),
        ],
    };
    const db = options.db ?? (prisma as unknown as LedgerQueryDb);
    const [totalCount, aggregate, records] = await Promise.all([
        db.journalLine.count({ where }),
        db.journalLine.aggregate({
            where,
            _sum: { debit: true, credit: true },
        }),
        db.journalLine.findMany({
            where,
            select: {
                id: true,
                journalEntryId: true,
                accountId: true,
                description: true,
                debit: true,
                credit: true,
                account: {
                    select: {
                        code: true,
                        name: true,
                        description: true,
                        type: true,
                    },
                },
                journalEntry: {
                    select: {
                        entryNumber: true,
                        entryDate: true,
                        description: true,
                        reference: true,
                        referenceId: true,
                        referenceType: true,
                        details: {
                            where: matchingDetailWhere(keywords),
                            select: {
                                type: true,
                                description: true,
                                amount: true,
                            },
                            orderBy: { sortOrder: 'asc' },
                            take: 5,
                        },
                    },
                },
            },
            orderBy: [
                { journalEntry: { entryDate: 'desc' } },
                { journalEntry: { entryNumber: 'desc' } },
                { id: 'asc' },
            ],
            take: parsed.limit,
        }),
    ]);
    const totalDebit = Number(aggregate._sum.debit ?? 0);
    const totalCredit = Number(aggregate._sum.credit ?? 0);
    return {
        dataset: parsed.dataset,
        keywords,
        period: {
            startDate: period.startDate,
            endDate: period.endDate,
            preset: period.preset,
        },
        basis: expenseOnly
            ? 'Pencocokan teks pada Journal POSTED dan akun EXPENSE; keyword pertama wajib cocok pada baris/akun/detail biaya; closing dikecualikan; neto = debit - kredit.'
            : 'Pencocokan teks pada Journal POSTED; total debit dan kredit berasal dari baris Buku Besar yang cocok.',
        totalCount,
        totalDebit,
        totalCredit,
        netAmount: totalDebit - totalCredit,
        rows: records.map((record) => {
            const debit = Number(record.debit);
            const credit = Number(record.credit);
            return {
                id: record.id,
                journalEntryId: record.journalEntryId,
                accountId: record.accountId,
                accountCode: record.account.code,
                accountName: record.account.name,
                accountType: record.account.type,
                entryNumber: record.journalEntry.entryNumber,
                entryDate: record.journalEntry.entryDate,
                description:
                    record.description || record.journalEntry.description,
                journalDescription: record.journalEntry.description,
                reference: record.journalEntry.reference,
                referenceType: record.journalEntry.referenceType,
                debit,
                credit,
                netAmount: debit - credit,
                matchingDetails: record.journalEntry.details.map((detail) => ({
                    description: detail.description,
                    amount: Number(detail.amount),
                })),
                matchedOn: matchedFields(record, keywords),
            };
        }),
        truncated: totalCount > records.length,
    };
}

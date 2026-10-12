import type { FinanceLedgerQueryResult } from '@/services/business-query/finance-ledger-query';
import { buildGeneralLedgerSearchHref } from '@/components/finance/reports/general-ledger-query';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { createEvidence } from './evidence';

const money = (value: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
    }).format(value);

export function financeLedgerQueryEvidence(result: FinanceLedgerQueryResult) {
    const expense = result.dataset === 'ledger_expenses';
    const searchHref = buildGeneralLedgerSearchHref({
        query: result.keywords.join(' '),
        startDate: result.period.startDate,
        endDate: result.period.endDate,
        mode: expense ? 'expenses' : 'lines',
    });
    const scope = `${result.period.startDate} s.d. ${result.period.endDate} WIB`;
    const summary =
        result.totalCount === 0
            ? `Tidak ditemukan baris Buku Besar POSTED yang cocok dengan "${result.keywords.join(' ')}" pada ${scope}.`
            : expense
              ? `Ditemukan ${result.totalCount} baris beban POSTED yang cocok pada ${scope}; neto ${money(result.netAmount)}.`
              : `Ditemukan ${result.totalCount} baris Buku Besar POSTED yang cocok pada ${scope}.`;

    return createEvidence({
        summary,
        source: 'tenant-data',
        completeness: result.truncated ? 'partial' : 'complete',
        facts: [
            { label: 'Kata kunci', value: result.keywords.join(', ') },
            {
                label: 'Periode',
                value:
                    scope +
                    (result.period.preset
                        ? ` (default ${result.period.preset})`
                        : ''),
            },
            { label: 'Basis pencarian', value: result.basis },
            {
                label: 'Batas interpretasi',
                value: 'Kecocokan berasal dari teks pencatatan jurnal/akun; bukan relasi terstruktur ke customer, trip, kendaraan, atau tujuan kecuali informasi itu tertulis pada jurnal.',
            },
            { label: 'Jumlah baris cocok', value: String(result.totalCount) },
            ...(expense
                ? [
                      {
                          label: 'Total debit beban',
                          value: money(result.totalDebit),
                      },
                      {
                          label: 'Total kredit/koreksi beban',
                          value: money(result.totalCredit),
                      },
                      { label: 'Beban neto', value: money(result.netAmount) },
                  ]
                : [
                      { label: 'Total debit', value: money(result.totalDebit) },
                      {
                          label: 'Total kredit',
                          value: money(result.totalCredit),
                      },
                  ]),
            {
                label: 'Cakupan hasil',
                value: result.truncated
                    ? `Sampel ${result.rows.length} dari ${result.totalCount} baris; total/count tetap seluruh cohort.`
                    : 'Semua baris cocok ditampilkan.',
            },
            ...result.rows.map((row) => ({
                label: `Jurnal ${row.entryNumber} · ${row.accountCode} ${row.accountName}`,
                value: `${toBusinessDateString(row.entryDate)} WIB; ${row.description}; referensi ${row.reference ?? '-'}; debit ${money(row.debit)}, kredit ${money(row.credit)}, neto ${money(row.netAmount)}; cocok pada ${row.matchedOn.join(', ') || 'data jurnal'}${row.matchingDetails.length ? `; detail ${row.matchingDetails.map((detail) => `${detail.description} ${money(detail.amount)}`).join(' | ')}` : ''}.`,
            })),
        ],
        entities: [
            {
                type: 'GeneralLedgerSearch',
                id: result.keywords.join(' '),
                label: 'Buka hasil di Buku Besar',
                href: searchHref,
            },
            ...result.rows.slice(0, 10).map((row) => ({
                type: 'JournalEntry',
                id: row.journalEntryId,
                label: row.entryNumber,
                href: `/finance/journals/${encodeURIComponent(row.journalEntryId)}`,
            })),
        ],
    });
}

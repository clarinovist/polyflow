'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import { Printer } from 'lucide-react';

interface ReconciliationReportProps {
    reconciliation: {
        id: string;
        account: { id: string; code: string; name: string };
        periodStart: string | Date;
        periodEnd: string | Date;
        bankBalance: number;
        bookBalance: number;
        adjustedBankBalance?: number | null;
        adjustedBookBalance?: number | null;
        status: string;
        adjustments: Array<{
            id: string;
            side: 'BANK' | 'BOOK';
            type: string;
            description: string;
            amount: number;
        }>;
    };
}

/** Group adjustments by side */
function groupAdjustments(
    adjustments: ReconciliationReportProps['reconciliation']['adjustments'],
) {
    const bankAdjustments = adjustments.filter((a) => a.side === 'BANK');
    const bookAdjustments = adjustments.filter((a) => a.side === 'BOOK');

    // Calculate net effect for each side
    const bankNet = bankAdjustments.reduce((sum, a) => {
        const sign =
            a.type === 'DEPOSIT_IN_TRANSIT' ? 1 : a.type === 'OUTSTANDING_CHECK' ? -1 : 0;
        return sum + sign * Number(a.amount);
    }, 0);

    const bookNet = bookAdjustments.reduce((sum, a) => {
        const sign =
            a.type === 'INTEREST_INCOME' ||
            a.type === 'COLLECTION' ||
            a.type === 'CORRECTION_ADD'
                ? 1
                : a.type === 'BANK_FEE' ||
                    a.type === 'NSF_CHECK' ||
                    a.type === 'CORRECTION_SUBTRACT'
                    ? -1
                    : 0;
        return sum + sign * Number(a.amount);
    }, 0);

    return { bankAdjustments, bookAdjustments, bankNet, bookNet };
}

/** Format date for display */
function formatDate(d: string | Date): string {
    return new Date(d).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export function ReconciliationReport({ reconciliation }: ReconciliationReportProps) {
    const { account, periodEnd, bankBalance, bookBalance, adjustments } = reconciliation;

    const { bankNet, bookNet } = groupAdjustments(adjustments);

    const adjustedBank = Number(bankBalance) + bankNet;
    const adjustedBook = Number(bookBalance) + bookNet;

    const handlePrint = () => {
        window.print();
    };

    return (
        <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-bold">
                            LAPORAN REKONSILIASI BANK
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{account.name}</p>
                        <p className="text-sm text-muted-foreground">
                            per {formatDate(periodEnd)}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrint}
                        className="print:hidden"
                    >
                        <Printer className="h-4 w-4 mr-2" />
                        Cetak
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    {/* === LEFT: Bank Statement Side === */}
                    <div className="border rounded-md p-4 print:border print:rounded-none">
                        <h3 className="font-semibold text-sm mb-4 text-center border-b pb-2">
                            SALDO REKENING KORAN BANK
                        </h3>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Saldo rekening koran</span>
                                <span className="font-mono tabular-nums">
                                    {formatRupiah(Number(bankBalance))}
                                </span>
                            </div>

                            {/* Bank adjustments */}
                            {adjustments
                                .filter((a) => a.side === 'BANK')
                                .map((adj) => {
                                    const isAdd = adj.type === 'DEPOSIT_IN_TRANSIT';
                                    return (
                                        <div key={adj.id} className="flex justify-between text-sm">
                                            <span className="flex items-center gap-1">
                                                <span className="text-muted-foreground">
                                                    ({isAdd ? '+' : '-'})
                                                </span>
                                                <span>{adj.description}</span>
                                            </span>
                                            <span className="font-mono tabular-nums">
                                                {formatRupiah(Number(adj.amount))}
                                            </span>
                                        </div>
                                    );
                                })}

                            {bankNet !== 0 && (
                                <>
                                    <div className="border-t my-2" />
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Total penyesuaian bank ({bankNet >= 0 ? '+' : '-'})
                                        </span>
                                        <span className="font-mono tabular-nums">
                                            {formatRupiah(Math.abs(bankNet))}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="border-t mt-2 pt-2">
                                <div className="flex justify-between font-semibold">
                                    <span>= SALDO YANG BENAR</span>
                                    <span className="font-mono tabular-nums">
                                        {formatRupiah(adjustedBank)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* === RIGHT: Book (Company) Side === */}
                    <div className="border rounded-md p-4 print:border print:rounded-none">
                        <h3 className="font-semibold text-sm mb-4 text-center border-b pb-2">
                            SALDO MENURUT PERUSAHAAN
                        </h3>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Saldo buku besar</span>
                                <span className="font-mono tabular-nums">
                                    {formatRupiah(Number(bookBalance))}
                                </span>
                            </div>

                            {/* Book adjustments */}
                            {adjustments
                                .filter((a) => a.side === 'BOOK')
                                .map((adj) => {
                                    const isAdd =
                                        adj.type === 'INTEREST_INCOME' ||
                                        adj.type === 'COLLECTION' ||
                                        adj.type === 'CORRECTION_ADD';
                                    return (
                                        <div key={adj.id} className="flex justify-between text-sm">
                                            <span className="flex items-center gap-1">
                                                <span className="text-muted-foreground">
                                                    ({isAdd ? '+' : '-'})
                                                </span>
                                                <span>{adj.description}</span>
                                            </span>
                                            <span className="font-mono tabular-nums">
                                                {formatRupiah(Number(adj.amount))}
                                            </span>
                                        </div>
                                    );
                                })}

                            {bookNet !== 0 && (
                                <>
                                    <div className="border-t my-2" />
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Total penyesuaian buku ({bookNet >= 0 ? '+' : '-'})
                                        </span>
                                        <span className="font-mono tabular-nums">
                                            {formatRupiah(Math.abs(bookNet))}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="border-t mt-2 pt-2">
                                <div className="flex justify-between font-semibold">
                                    <span>= SALDO YANG BENAR</span>
                                    <span className="font-mono tabular-nums">
                                        {formatRupiah(adjustedBook)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Reconciliation Status */}
                <div className="mt-4 text-center text-sm">
                    {adjustedBank === adjustedBook ? (
                        <p className="text-emerald-600 font-semibold">
                            ✓ Rekonsiliasi seimbang — Saldo bank dan buku besar cocok.
                        </p>
                    ) : (
                        <p className="text-amber-600 font-semibold">
                            ⚠ Selisih:{' '}
                            {formatRupiah(Math.abs(adjustedBank - adjustedBook))}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

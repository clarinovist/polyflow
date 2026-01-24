'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, FileUp } from 'lucide-react';
import { parseJournalCSV, ImportJournalRow } from '@/lib/journal-csv-parser';
import { createBulkJournals } from '@/actions/journal';
import { formatRupiah } from '@/lib/utils';

interface Account {
    id: string;
    code: string;
    name: string;
}

interface ValidationError {
    row: number | string;
    error: string;
}

interface ImportJournalFormProps {
    accounts: Account[];
}

export default function ImportJournalForm({ accounts }: ImportJournalFormProps) {
    const router = useRouter();
    const [parsedData, setParsedData] = useState<ImportJournalRow[]>([]);
    const [errors, setErrors] = useState<ValidationError[]>([]);
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setValidating(true);
        setErrors([]);
        setParsedData([]);

        try {
            const { data, errors: parseErrors } = await parseJournalCSV(selectedFile);

            if (parseErrors.length > 0) {
                setErrors(parseErrors.map(e => ({
                    row: e.row,
                    error: e.error.map(issue => issue.message).join(', ')
                })));
            } else {
                // Additional Validation: Check Account Codes and Balance
                const validationErrors: ValidationError[] = [];
                const groupedByRef: Record<string, { debit: number, credit: number }> = {};

                // Map to check existence easily
                const accountMap = new Map(accounts.map(a => [a.code, a.id]));

                data.forEach((row, index) => {
                    const rowNum = index + 2;

                    // 1. Check Account
                    if (!accountMap.has(row.AccountCode)) {
                        validationErrors.push({ row: rowNum, error: `Account Code ${row.AccountCode} not found` });
                    }

                    // 2. Group for Balance Check
                    if (!groupedByRef[row.Reference]) {
                        groupedByRef[row.Reference] = { debit: 0, credit: 0 };
                    }
                    groupedByRef[row.Reference].debit += row.Debit;
                    groupedByRef[row.Reference].credit += row.Credit;
                });

                Object.entries(groupedByRef).forEach(([ref, totals]) => {
                    if (Math.abs(totals.debit - totals.credit) > 0.01) {
                        validationErrors.push({ row: "Ref: " + ref, error: `Unbalanced: Dr ${formatRupiah(totals.debit)} vs Cr ${formatRupiah(totals.credit)}` });
                    }
                });

                if (validationErrors.length > 0) {
                    setErrors(validationErrors);
                } else {
                    setParsedData(data);
                }
            }
        } catch (_err) {
            toast.error("Failed to parse CSV file");
        } finally {
            setValidating(false);
        }
    };

    const handleImport = async () => {
        if (parsedData.length === 0) return;

        setLoading(true);
        try {
            // Transform data for server action
            // Ensure account matching is robust (we verified it above)
            const accountMap = new Map(accounts.map(a => [a.code, a.id]));

            // Group by reference to create journal entries
            const entriesMap = new Map<string, {
                entryDate: Date,
                description: string,
                reference: string,
                lines: {
                    accountId: string,
                    debit: number,
                    credit: number,
                    description: string
                }[]
            }>();

            parsedData.forEach(row => {
                if (!entriesMap.has(row.Reference)) {
                    entriesMap.set(row.Reference, {
                        entryDate: new Date(row.Date),
                        description: row.Description,
                        reference: row.Reference,
                        lines: []
                    });
                }
                entriesMap.get(row.Reference)?.lines.push({
                    accountId: accountMap.get(row.AccountCode)!,
                    debit: row.Debit,
                    credit: row.Credit,
                    description: row.Description
                });
            });

            const entries = Array.from(entriesMap.values());

            const result = await createBulkJournals(entries);

            if (result.success) {
                toast.success(`Successfully imported ${result.count} journal entries`);
                router.push('/dashboard/accounting/reports/trial-balance');
                router.refresh();
            } else {
                toast.error(result.error);
            }

        } catch (_error) {
            toast.error("Import failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Upload CSV File</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Input id="csv" type="file" accept=".csv" onChange={handleFileChange} disabled={loading} />
                        <p className="text-xs text-muted-foreground mt-2">
                            Format: Date (YYYY-MM-DD), Reference, Description, AccountCode, Debit, Credit
                        </p>
                    </div>
                </CardContent>
            </Card>

            {validating && (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-3">Validating file...</span>
                </div>
            )}

            {errors.length > 0 && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Validation Errors</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-5 max-h-[200px] overflow-y-auto">
                            {errors.map((e, i) => (
                                <li key={i}>
                                    {typeof e.row === 'number' ? `Row ${e.row}: ` : `${e.row}: `}
                                    {JSON.stringify(e.error)}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {parsedData.length > 0 && errors.length === 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Preview ({parsedData.length} lines)</CardTitle>
                        <Button onClick={handleImport} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileUp className="h-4 w-4 mr-2" />}
                            Import Journals
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border max-h-[400px] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Ref</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Desc</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.slice(0, 50).map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.Date}</TableCell>
                                            <TableCell>{row.Reference}</TableCell>
                                            <TableCell>{row.AccountCode}</TableCell>
                                            <TableCell>{row.Description}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.Debit)}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.Credit)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {parsedData.length > 50 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                                                ... and {parsedData.length - 50} more rows
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

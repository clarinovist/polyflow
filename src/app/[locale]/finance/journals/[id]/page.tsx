
import { getJournalById } from '@/actions/journal';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JournalActions } from './journal-actions';

interface JournalLine {
    id: string;
    description: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debit: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credit: any;
    account: {
        code: string;
        name: string;
    };
}

export default async function JournalDetailPage({ params }: { params: { id: string } }) {
    const journal = await getJournalById(params.id);

    if (!journal) {
        notFound();
    }

    const totalDebit = journal.lines.reduce((sum: number, line: JournalLine) => sum + Number(line.debit), 0);
    const totalCredit = journal.lines.reduce((sum: number, line: JournalLine) => sum + Number(line.credit), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/finance/journals">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{journal.entryNumber}</h1>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{format(new Date(journal.entryDate), 'dd MMMM yyyy')}</span>
                        <span>•</span>
                        <Badge variant="outline">{journal.status}</Badge>
                    </div>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline">
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                    <JournalActions id={journal.id} status={journal.status} />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Description</span>
                            <span className="font-medium text-right">{journal.description}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Reference</span>
                            <span className="font-medium">{journal.reference || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-medium">{journal.referenceType}</span>
                        </div>
                        <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Created By</span>
                            <span className="font-medium">{journal.createdBy?.name || 'System'}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Total Debit</span>
                            <span className="font-medium">{formatRupiah(totalDebit)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Total Credit</span>
                            <span className="font-medium">{formatRupiah(totalCredit)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Status</span>
                            <span className={totalDebit === totalCredit ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                {totalDebit === totalCredit ? "Balanced" : "Unbalanced"}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Journal Lines</CardTitle>
                    <CardDescription>Ledger impact details</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {journal.lines.map((line: JournalLine) => (
                                <TableRow key={line.id}>
                                    <TableCell className="font-mono">{line.account.code}</TableCell>
                                    <TableCell>{line.account.name}</TableCell>
                                    <TableCell>{line.description || '-'}</TableCell>
                                    <TableCell className="text-right">{Number(line.debit) > 0 ? formatRupiah(line.debit) : '-'}</TableCell>
                                    <TableCell className="text-right">{Number(line.credit) > 0 ? formatRupiah(line.credit) : '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

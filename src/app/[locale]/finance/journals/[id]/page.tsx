import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';

import { JournalActions } from './journal-actions';

interface JournalDetailPageProps {
    params: Promise<{ id: string }>;
}

export default async function JournalDetailPage({ params }: JournalDetailPageProps) {
    const { id } = await params;

    const journal = await prisma.journalEntry.findUnique({
        where: { id },
        include: {
            createdBy: { select: { name: true, email: true } },
            lines: {
                include: {
                    account: true
                },
                orderBy: { debit: 'desc' } // Debits first usually
            }
        }
    });

    if (!journal) {
        notFound();
    }

    const totalDebit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/finance/journals">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Journal Entry #{journal.entryNumber}</h1>
                        <p className="text-muted-foreground">
                            {format(journal.entryDate, 'dd MMMM yyyy, HH:mm')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={journal.status === 'POSTED' ? 'default' : 'secondary'}>
                        {journal.status}
                    </Badge>
                    <JournalActions id={journal.id} status={journal.status as any} />
                    <Button variant="outline">
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Transaction Details</CardTitle>
                        <CardDescription>{journal.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {journal.lines.map((line) => (
                                        <TableRow key={line.id}>
                                            <TableCell>
                                                <div className="font-medium">{line.account.code}</div>
                                                <div className="text-xs text-muted-foreground">{line.account.name}</div>
                                            </TableCell>
                                            <TableCell>{line.description || '-'}</TableCell>
                                            <TableCell className="text-right font-mono">
                                                {Number(line.debit) > 0 ? formatRupiah(Number(line.debit)) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {Number(line.credit) > 0 ? formatRupiah(Number(line.credit)) : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50 font-bold">
                                        <TableCell colSpan={2} className="text-right">Total</TableCell>
                                        <TableCell className="text-right">{formatRupiah(totalDebit)}</TableCell>
                                        <TableCell className="text-right">{formatRupiah(totalCredit)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-muted-foreground">Reference Type</div>
                            <div className="font-medium text-right">{journal.referenceType || '-'}</div>

                            <div className="text-muted-foreground">Reference ID</div>
                            <div className="font-medium text-right truncate" title={journal.reference || ''}>{journal.reference || '-'}</div>

                            <div className="text-muted-foreground">Created By</div>
                            <div className="font-medium text-right">{journal.createdBy?.name || 'System'}</div>

                            <div className="text-muted-foreground">Auto-Generated</div>
                            <div className="font-medium text-right">{journal.isAutoGenerated ? 'Yes' : 'No'}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

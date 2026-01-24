
import { getJournals } from '@/actions/journal';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Journal {
    id: string;
    entryDate: string | Date;
    entryNumber: string;
    reference: string | null;
    referenceType: string | null;
    description: string;
    status: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: { debit: any; credit: any }[];
}

export default async function JournalExplorerPage({
    searchParams
}: {
    searchParams: Promise<{ ref?: string }>
}) {
    const params = await searchParams;
    const journals = await getJournals({ reference: params.ref });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Journal Explorer</h1>
                    <p className="text-muted-foreground">
                        View and manage general ledger entries.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/accounting/journals/import">
                            <FileText className="mr-2 h-4 w-4" />
                            Import CSV
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/dashboard/accounting/journals/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Journal
                        </Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>All Journals</CardTitle>
                        <form className="flex gap-2">
                            <Input
                                name="ref"
                                placeholder="Search Reference..."
                                className="w-[200px]"
                                defaultValue={params.ref}
                            />
                            <Button type="submit" variant="ghost" size="icon">
                                <Search className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Number</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="w-[100px]">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {journals.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                        No journals found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                journals.map((journal: Journal) => {
                                    const totalAmount = journal.lines.reduce((sum: number, line: { debit: number }) => sum + Number(line.debit), 0);

                                    return (
                                        <TableRow key={journal.id}>
                                            <TableCell>{format(new Date(journal.entryDate), 'dd MMM yyyy')}</TableCell>
                                            <TableCell className="font-medium font-mono">{journal.entryNumber}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{journal.reference || '-'}</span>
                                                    <span className="text-xs text-muted-foreground">{journal.referenceType}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-[300px] truncate">{journal.description}</TableCell>
                                            <TableCell>
                                                <Badge variant={journal.status === 'POSTED' ? 'default' : 'secondary'}>
                                                    {journal.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatRupiah(totalAmount)}
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/dashboard/accounting/journals/${journal.id}`}>
                                                        View
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

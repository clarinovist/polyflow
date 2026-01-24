
import { getChartOfAccounts } from '@/actions/accounting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AccountFormDialog } from './account-form-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';

import { AccountType, AccountCategory } from '@prisma/client';

interface Account {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    description: string | null;
    category: AccountCategory;
}

export default async function ChartOfAccountsPage() {
    const accounts = await getChartOfAccounts();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
                    <p className="text-muted-foreground">
                        Manage your company&apos;s accounts and financial structure.
                    </p>
                </div>
                <AccountFormDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Accounts List</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No accounts found. Add your first account to get started.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                accounts.map((account: Account) => (
                                    <TableRow key={account.id}>
                                        <TableCell className="font-mono font-bold">{account.code}</TableCell>
                                        <TableCell className="font-medium">{account.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={getTypeColor(account.type)}>
                                                {account.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                                            {account.description || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <AccountFormDialog account={account} mode="edit" />
                                                <DeleteAccountDialog id={account.id} name={account.name} code={account.code} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function getTypeColor(type: string) {
    switch (type) {
        case 'ASSET': return 'text-blue-600 border-blue-200 bg-blue-50';
        case 'LIABILITY': return 'text-orange-600 border-orange-200 bg-orange-50';
        case 'EQUITY': return 'text-purple-600 border-purple-200 bg-purple-50';
        case 'REVENUE': return 'text-green-600 border-green-200 bg-green-50';
        case 'EXPENSE': return 'text-red-600 border-red-200 bg-red-50';
        default: return '';
    }
}

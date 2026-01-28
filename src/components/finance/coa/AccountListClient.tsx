'use client';

import { useState, useTransition } from 'react';
import { Account } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Trash2, Edit } from 'lucide-react';
import { AccountForm } from './AccountForm';
import { deleteAccount } from '@/actions/finance/account-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AccountWithParent extends Account {
    parent?: { code: string; name: string } | null;
}

interface AccountListClientProps {
    initialAccounts: AccountWithParent[];
}

export function AccountListClient({ initialAccounts }: AccountListClientProps) {
    const [search, setSearch] = useState('');
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const filteredAccounts = initialAccounts.filter(acc =>
        acc.code.toLowerCase().includes(search.toLowerCase()) ||
        acc.name.toLowerCase().includes(search.toLowerCase()) ||
        acc.category.toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = (id: string, code: string) => {
        if (!confirm(`Are you sure you want to delete account ${code}? This cannot be undone.`)) return;

        startTransition(async () => {
            try {
                await deleteAccount(id);
                toast.success(`Account ${code} deleted.`);
                router.refresh();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                toast.error(error.message || "Failed to delete account");
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Chart of Accounts</h2>
                    <p className="text-muted-foreground">Manage your general ledger accounts.</p>
                </div>
                <AccountForm parentOptions={initialAccounts} />
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Accounts Directory</CardTitle>
                        <div className="relative w-[300px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search code, name, or category..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Parent</TableHead>
                                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAccounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No accounts found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredAccounts.map((account) => (
                                        <TableRow key={account.id}>
                                            <TableCell className="font-mono font-medium">{account.code}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{account.name}</div>
                                                {account.description && <div className="text-xs text-muted-foreground">{account.description}</div>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{account.type}</Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{account.category.replace(/_/g, ' ')}</TableCell>
                                            <TableCell className="text-xs">
                                                {account.parent ? `${account.parent.code}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                <AccountForm
                                                    account={account}
                                                    parentOptions={initialAccounts.filter(a => a.id !== account.id)} // Prevent self-parenting
                                                    trigger={
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    }
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(account.id, account.code)}
                                                    disabled={isPending}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="text-xs text-muted-foreground mt-4 text-center">
                        Showing {filteredAccounts.length} accounts
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

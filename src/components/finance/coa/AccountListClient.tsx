'use client';

import { useState, useTransition } from 'react';
import { Account } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCaption,
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

    const filteredAccounts = (initialAccounts || []).filter((acc) => {
        if (!acc) return false;
        const code = acc.code || '';
        const name = acc.name || '';
        const category = acc.category || '';
        return (
            code.toLowerCase().includes(search.toLowerCase()) ||
            name.toLowerCase().includes(search.toLowerCase()) ||
            category.toLowerCase().includes(search.toLowerCase())
        );
    });

    const handleDelete = (id: string, code: string) => {
        if (
            !confirm(
                `Yakin ingin menghapus akun ${code}? Tindakan ini tidak dapat dibatalkan.`,
            )
        )
            return;

        startTransition(async () => {
            try {
                await deleteAccount(id);
                toast.success(`Akun ${code} berhasil dihapus.`);
                router.refresh();
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'Gagal menghapus akun',
                );
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                        Daftar Akun
                    </h2>
                    <p className="text-muted-foreground">
                        Kelola akun buku besar.
                    </p>
                </div>
                <AccountForm
                    parentOptions={(initialAccounts || []).filter((a) => !!a)}
                />
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            Direktori Akun
                        </CardTitle>
                        <div className="relative w-[300px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                aria-label="Cari akun"
                                placeholder="Cari kode, nama, atau kategori akun..."
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
                            <TableCaption className="sr-only">
                                Daftar akun buku besar
                            </TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">
                                        Kode
                                    </TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Jenis</TableHead>
                                    <TableHead>Kategori</TableHead>
                                    <TableHead>Induk</TableHead>
                                    <TableHead className="w-[100px] text-right">
                                        Tindakan
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAccounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="h-24 text-center"
                                        >
                                            Tidak ada akun ditemukan.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredAccounts.map((account) => {
                                        if (!account) return null;
                                        return (
                                            <TableRow
                                                key={account.id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() =>
                                                    router.push(
                                                        `/finance/coa/${account.id}`,
                                                    )
                                                }
                                            >
                                                <TableCell className="font-mono font-medium">
                                                    {account.code || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium">
                                                        {account.name ||
                                                            'Tidak diketahui'}
                                                    </div>
                                                    {account.description && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {
                                                                account.description
                                                            }
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {account.type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {(
                                                        account.category || ''
                                                    ).replace(/_/g, ' ')}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {account.parent
                                                        ? `${account.parent.code}`
                                                        : '-'}
                                                </TableCell>
                                                <TableCell
                                                    className="text-right"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <div className="flex items-center justify-end gap-2">
                                                        <AccountForm
                                                            account={account}
                                                            parentOptions={(
                                                                initialAccounts ||
                                                                []
                                                            ).filter(
                                                                (a) =>
                                                                    a &&
                                                                    a.id !==
                                                                        account.id,
                                                            )} // Prevent self-parenting
                                                            trigger={
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                >
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                            }
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={() =>
                                                                handleDelete(
                                                                    account.id,
                                                                    account.code,
                                                                )
                                                            }
                                                            disabled={isPending}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="text-xs text-muted-foreground mt-4 text-center">
                        Menampilkan {filteredAccounts.length} akun
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

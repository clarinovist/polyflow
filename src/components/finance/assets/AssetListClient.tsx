'use client';

import { useState, useMemo } from 'react';
import { FixedAsset, Account } from '@prisma/client';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { deleteAsset } from '@/actions/finance/asset-actions';
import { toast } from 'sonner';
import { AssetForm } from './AssetForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type AssetWithAccounts = FixedAsset & {
    assetAccount: Account;
};

interface AssetListClientProps {
    initialAssets: AssetWithAccounts[];
    accounts: Account[];
}

export function AssetListClient({ initialAssets, accounts }: AssetListClientProps) {
    const [data, setData] = useState(initialAssets);
    const [search, setSearch] = useState('');

    const filteredData = useMemo(() => {
        return data.filter(item =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.assetCode.toLowerCase().includes(search.toLowerCase())
        );
    }, [data, search]);

    const handleDelete = async (id: string) => {
        try {
            await deleteAsset(id);
            setData(prev => prev.filter(a => a.id !== id));
            toast.success("Asset deleted");
        } catch (error) {
            console.error("Delete failed", error);
            toast.error("Failed to delete asset");
        }
    };

    const columns: ColumnDef<AssetWithAccounts>[] = [
        {
            accessorKey: "assetCode",
            header: "Code",
        },
        {
            accessorKey: "name",
            header: "Name",
        },
        {
            accessorKey: "purchaseDate",
            header: "Purchase Date",
            cell: ({ row }) => format(new Date(row.getValue("purchaseDate")), "PP"),
        },
        {
            accessorKey: "purchaseValue",
            header: "Value",
            cell: ({ row }) => Number(row.getValue("purchaseValue")).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }),
        },
        {
            accessorKey: "usefulLifeMonths",
            header: "Life (Mo)",
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <Badge variant="outline">{row.getValue("status")}</Badge>,
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const asset = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        <AssetForm existingAsset={asset} accounts={accounts} />
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the asset.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(asset.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                );
            },
        },
    ];

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Fixed Assets</h2>
                    <p className="text-muted-foreground">Manage assets and track depreciation.</p>
                </div>
                <div className="flex items-center gap-2">
                    <AssetForm accounts={accounts} />
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Asset Registry</CardTitle>
                        <Input
                            placeholder="Search assets..."
                            className="w-[250px]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => {
                                            return (
                                                <TableHead key={header.id}>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                </TableHead>
                                            )
                                        })}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && "selected"}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center">
                                            No results.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

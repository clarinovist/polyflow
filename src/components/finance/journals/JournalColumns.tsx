'use client';

import { ColumnDef } from '@tanstack/react-table';
import { JournalEntry, JournalStatus } from '@prisma/client';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

// Type extension if needed
export type JournalEntryWithDetails = JournalEntry & {
    createdBy?: { name: string | null } | null;
};

export const columns: ColumnDef<JournalEntryWithDetails>[] = [
    {
        id: 'select',
        size: 40,
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: 'entryNumber',
        header: 'Entry #',
        size: 110,
        cell: ({ row }) => (
            <Link href={`/finance/journals/${row.original.id}`} className="font-medium text-blue-600 hover:underline">
                {row.getValue('entryNumber')}
            </Link>
        ),
    },
    {
        accessorKey: 'entryDate',
        header: 'Date',
        size: 120,
        cell: ({ row }) => format(new Date(row.getValue('entryDate')), 'dd MMM yyyy'),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        size: 250,
        cell: ({ row }) => <div className="truncate" title={row.getValue('description')}>{row.getValue('description')}</div>,
    },
    {
        accessorKey: 'reference',
        header: 'Reference',
        size: 130,
        cell: ({ row }) => (
            <div className="flex flex-col truncate">
                <span className="text-sm font-medium truncate">{row.original.reference || '-'}</span>
                <span className="text-[10px] text-muted-foreground truncate">{row.original.referenceType}</span>
            </div>
        ),
    },
    {
        accessorKey: 'status',
        header: 'Status',
        size: 100,
        cell: ({ row }) => {
            const status = row.getValue('status') as JournalStatus;
            const variant =
                status === 'POSTED' ? 'default' :
                    status === 'DRAFT' ? 'secondary' :
                        'destructive';

            return <Badge variant={variant}>{status}</Badge>;
        },
    },
    {
        accessorKey: 'createdBy',
        header: 'Created By',
        size: 120,
        cell: ({ row }) => row.original.createdBy?.name || 'System',
    },
    {
        id: 'actions',
        size: 50,
        cell: ({ row }) => {
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <Link href={`/finance/journals/${row.original.id}`}>
                            <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                        </Link>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        },
    },
];

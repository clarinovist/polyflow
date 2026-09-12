'use client';

import { useState, useEffect } from 'react';

import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table';

import { Input } from '@/components/ui/input';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    /** Controls search input visibility. Actual filtering is handled externally. */
    searchKey?: string;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    enablePagination?: boolean;
    enableRowSelection?: boolean;
    onRowSelectionChange?: (rows: TData[]) => void;
    getRowId?: (row: TData) => string;
    pageSize?: number;
    children?: React.ReactNode;
    emptyMessage?: string;
    minWidth?: number;
    renderMobileView?: (data: TData[]) => React.ReactNode;
    caption?: React.ReactNode;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    searchKey,
    searchPlaceholder = 'Cari...',
    searchValue: externalSearchValue,
    onSearchChange,
    enablePagination = false,
    enableRowSelection = false,
    onRowSelectionChange,
    getRowId,
    pageSize = 20,
    children,
    emptyMessage = 'Tidak ada data.',
    minWidth = 800,
    renderMobileView,
    caption,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [rowSelection, setRowSelection] = useState({});
    const [internalSearch, setInternalSearch] = useState('');

    const searchValue = externalSearchValue ?? internalSearch;
    const handleSearchChange = onSearchChange ?? setInternalSearch;

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            ...(enableRowSelection ? { rowSelection } : {}),
        },
        onSortingChange: setSorting,
        ...(enableRowSelection
            ? { onRowSelectionChange: setRowSelection }
            : {}),
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        ...(enablePagination
            ? { getPaginationRowModel: getPaginationRowModel() }
            : {}),
        ...(enableRowSelection ? { enableRowSelection: true } : {}),
        ...(getRowId ? { getRowId } : {}),
        initialState: enablePagination
            ? { pagination: { pageSize } }
            : undefined,
    });

    // Bridge internal rowSelection state to external callback
    useEffect(() => {
        if (onRowSelectionChange && enableRowSelection) {
            const selectedRows = table
                .getFilteredSelectedRowModel()
                .rows.map((r) => r.original);
            onRowSelectionChange(selectedRows);
        }
    }, [rowSelection, onRowSelectionChange, enableRowSelection, table]);

    return (
        <div className="space-y-4">
            {(searchKey || children) && (
                <div className="flex items-center justify-between gap-4">
                    {searchKey && (
                        <Input
                            placeholder={searchPlaceholder}
                            value={searchValue}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="max-w-sm"
                        />
                    )}
                    {children}
                </div>
            )}

            <div className="rounded-md border hidden md:block">
                <ResponsiveTable minWidth={minWidth}>
                    <Table>
                        {caption && (
                            <TableCaption className="sr-only">
                                {caption}
                            </TableCaption>
                        )}
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <SortableTableHead
                                            key={header.id}
                                            sortable={header.column.getCanSort()}
                                            direction={header.column.getIsSorted()}
                                            onSort={header.column.getToggleSortingHandler()}
                                            className={
                                                header.column.getCanSort()
                                                    ? 'hover:bg-muted/50'
                                                    : undefined
                                            }
                                            style={
                                                header.column.columnDef.size
                                                    ? {
                                                          width: header.column
                                                              .columnDef.size,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </SortableTableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={
                                            enableRowSelection &&
                                            row.getIsSelected()
                                                ? 'selected'
                                                : undefined
                                        }
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                style={
                                                    cell.column.columnDef.size
                                                        ? {
                                                              width: cell.column
                                                                  .columnDef
                                                                  .size,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-24 text-center"
                                    >
                                        {emptyMessage}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>

            {renderMobileView && (
                <div className="md:hidden space-y-3">
                    {renderMobileView(
                        enablePagination
                            ? table
                                  .getRowModel()
                                  .rows.map((row) => row.original)
                            : data,
                    )}
                </div>
            )}

            {enablePagination && (
                <DataTablePagination
                    pageIndex={table.getState().pagination.pageIndex}
                    pageCount={table.getPageCount()}
                    canPreviousPage={table.getCanPreviousPage()}
                    canNextPage={table.getCanNextPage()}
                    onFirstPage={() => table.setPageIndex(0)}
                    onPreviousPage={() => table.previousPage()}
                    onNextPage={() => table.nextPage()}
                    onLastPage={() =>
                        table.setPageIndex(Math.max(table.getPageCount() - 1, 0))
                    }
                    selectedRowCount={
                        enableRowSelection
                            ? table.getFilteredSelectedRowModel().rows.length
                            : undefined
                    }
                    totalRowCount={
                        enableRowSelection
                            ? table.getFilteredRowModel().rows.length
                            : undefined
                    }
                />
            )}
        </div>
    );
}

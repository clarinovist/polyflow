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
    /** Opt-in controlled/server sorting. Data is rendered in the supplied order. */
    manualSorting?: boolean;
    sorting?: SortingState;
    onSortingChange?: (sorting: SortingState) => void;
    /** Opt-in controlled/server pagination metadata and callbacks. */
    serverPagination?: {
        pageIndex: number;
        pageCount: number;
        totalCount: number;
        pageSize: number;
        onPageChange: (pageIndex: number) => void;
        onPageSizeChange?: (pageSize: number) => void;
        pageSizeOptions?: readonly number[];
    };
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
    manualSorting = false,
    sorting: controlledSorting,
    onSortingChange,
    serverPagination,
}: DataTableProps<TData, TValue>) {
    const [internalSorting, setInternalSorting] = useState<SortingState>([]);
    const sorting = controlledSorting ?? internalSorting;
    const handleSortingChange = onSortingChange ?? setInternalSorting;
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
        onSortingChange: (updater) =>
            handleSortingChange(
                typeof updater === 'function' ? updater(sorting) : updater,
            ),
        manualSorting,
        ...(enableRowSelection
            ? { onRowSelectionChange: setRowSelection }
            : {}),
        getCoreRowModel: getCoreRowModel(),
        ...(!manualSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
        ...(enablePagination && !serverPagination
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

            {(enablePagination || serverPagination) && (
                <DataTablePagination
                    pageIndex={
                        serverPagination?.pageIndex ??
                        table.getState().pagination.pageIndex
                    }
                    pageCount={
                        serverPagination?.pageCount ?? table.getPageCount()
                    }
                    canPreviousPage={
                        serverPagination
                            ? serverPagination.pageIndex > 0
                            : table.getCanPreviousPage()
                    }
                    canNextPage={
                        serverPagination
                            ? serverPagination.pageIndex + 1 <
                              serverPagination.pageCount
                            : table.getCanNextPage()
                    }
                    onFirstPage={() =>
                        serverPagination
                            ? serverPagination.onPageChange(0)
                            : table.setPageIndex(0)
                    }
                    onPreviousPage={() =>
                        serverPagination
                            ? serverPagination.onPageChange(
                                  Math.max(serverPagination.pageIndex - 1, 0),
                              )
                            : table.previousPage()
                    }
                    onNextPage={() =>
                        serverPagination
                            ? serverPagination.onPageChange(
                                  serverPagination.pageIndex + 1,
                              )
                            : table.nextPage()
                    }
                    onLastPage={() =>
                        serverPagination
                            ? serverPagination.onPageChange(
                                  Math.max(serverPagination.pageCount - 1, 0),
                              )
                            : table.setPageIndex(
                                  Math.max(table.getPageCount() - 1, 0),
                              )
                    }
                    rangeStart={
                        serverPagination
                            ? serverPagination.totalCount === 0
                                ? 0
                                : serverPagination.pageIndex *
                                      serverPagination.pageSize +
                                  1
                            : undefined
                    }
                    rangeEnd={
                        serverPagination
                            ? Math.min(
                                  (serverPagination.pageIndex + 1) *
                                      serverPagination.pageSize,
                                  serverPagination.totalCount,
                              )
                            : undefined
                    }
                    totalCount={serverPagination?.totalCount}
                    pageSize={serverPagination?.pageSize}
                    pageSizeOptions={serverPagination?.pageSizeOptions}
                    onPageSizeChange={serverPagination?.onPageSizeChange}
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

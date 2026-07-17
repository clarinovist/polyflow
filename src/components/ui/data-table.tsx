"use client";

import { useState, useEffect } from "react";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSortIcon } from "@/components/ui/data-table-sort-icon";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils/utils";

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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Cari...",
  searchValue: externalSearchValue,
  onSearchChange,
  enablePagination = false,
  enableRowSelection = false,
  onRowSelectionChange,
  getRowId,
  pageSize = 20,
  children,
  emptyMessage = "Tidak ada data.",
  minWidth = 800,
  renderMobileView,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [internalSearch, setInternalSearch] = useState("");

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
    ...(enableRowSelection ? { onRowSelectionChange: setRowSelection } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(enablePagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    ...(enableRowSelection ? { enableRowSelection: true } : {}),
    ...(getRowId ? { getRowId } : {}),
    initialState: enablePagination ? { pagination: { pageSize } } : undefined,
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
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:bg-muted/50",
                      )}
                      style={
                        header.column.columnDef.size
                          ? { width: header.column.columnDef.size }
                          : undefined
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-2">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <DataTableSortIcon
                              direction={header.column.getIsSorted()}
                            />
                          )}
                        </div>
                      )}
                    </TableHead>
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
                      enableRowSelection && row.getIsSelected()
                        ? "selected"
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={
                          cell.column.columnDef.size
                            ? { width: cell.column.columnDef.size }
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
        <div className="md:hidden space-y-3">{renderMobileView(data)}</div>
      )}

      {enablePagination && (
        <div className="flex items-center justify-between px-2">
          {enableRowSelection && (
            <div className="text-muted-foreground text-sm">
              {table.getFilteredSelectedRowModel().rows.length} dari{" "}
              {table.getFilteredRowModel().rows.length} baris dipilih
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              Halaman {table.getState().pagination.pageIndex + 1} dari{" "}
              {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

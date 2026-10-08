'use client';

import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DataTablePaginationProps {
    pageIndex: number;
    pageCount: number;
    canPreviousPage: boolean;
    canNextPage: boolean;
    onFirstPage: () => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onLastPage: () => void;
    selectedRowCount?: number;
    totalRowCount?: number;
    /** Optional result range, independent from selection context. */
    rangeStart?: number;
    rangeEnd?: number;
    totalCount?: number;
    pageSize?: number;
    pageSizeOptions?: readonly number[];
    onPageSizeChange?: (pageSize: number) => void;
}

export function DataTablePagination({
    pageIndex,
    pageCount,
    canPreviousPage,
    canNextPage,
    onFirstPage,
    onPreviousPage,
    onNextPage,
    onLastPage,
    selectedRowCount,
    totalRowCount,
    rangeStart,
    rangeEnd,
    totalCount,
    pageSize,
    pageSizeOptions = [25, 50, 100],
    onPageSizeChange,
}: DataTablePaginationProps) {
    const showSelection =
        selectedRowCount !== undefined && totalRowCount !== undefined;
    const pageStatus =
        pageCount > 0
            ? `Halaman ${pageIndex + 1} dari ${pageCount}`
            : 'Tidak ada halaman';
    const showRange =
        rangeStart !== undefined &&
        rangeEnd !== undefined &&
        totalCount !== undefined;
    const safeRangeStart = totalCount === 0 ? 0 : Math.max(rangeStart ?? 0, 1);
    const safeRangeEnd = Math.min(Math.max(rangeEnd ?? 0, 0), totalCount ?? 0);
    const showPageSize =
        pageSize !== undefined && onPageSizeChange !== undefined;

    return (
        <nav
            aria-label="Paginasi tabel"
            className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="flex flex-wrap items-center gap-4">
                {showSelection && (
                    <div className="text-muted-foreground text-sm">
                        {selectedRowCount} dari {totalRowCount} baris dipilih
                    </div>
                )}
                {showRange && (
                    <p className="text-sm text-muted-foreground" role="status">
                        Menampilkan {safeRangeStart}–{safeRangeEnd} dari{' '}
                        {totalCount}
                    </p>
                )}
                {showPageSize && (
                    <div className="flex items-center gap-2">
                        <Label
                            htmlFor="data-table-page-size"
                            className="text-sm text-muted-foreground"
                        >
                            Baris per halaman
                        </Label>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(value) =>
                                onPageSizeChange(Number(value))
                            }
                        >
                            <SelectTrigger
                                id="data-table-page-size"
                                className="h-9 w-[82px]"
                                aria-label="Jumlah baris per halaman"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {pageSizeOptions.map((option) => (
                                    <SelectItem
                                        key={option}
                                        value={String(option)}
                                    >
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-muted-foreground text-sm">
                    {pageStatus}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-8 sm:w-8"
                    aria-label="Halaman pertama"
                    onClick={onFirstPage}
                    disabled={!canPreviousPage}
                >
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-8 sm:w-8"
                    aria-label="Halaman sebelumnya"
                    onClick={onPreviousPage}
                    disabled={!canPreviousPage}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-8 sm:w-8"
                    aria-label="Halaman berikutnya"
                    onClick={onNextPage}
                    disabled={!canNextPage}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-8 sm:w-8"
                    aria-label="Halaman terakhir"
                    onClick={onLastPage}
                    disabled={!canNextPage}
                >
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </nav>
    );
}

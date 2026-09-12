'use client';

import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

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
}: DataTablePaginationProps) {
    const showSelection =
        selectedRowCount !== undefined && totalRowCount !== undefined;
    const pageStatus =
        pageCount > 0
            ? `Halaman ${pageIndex + 1} dari ${pageCount}`
            : 'Tidak ada halaman';

    return (
        <nav
            aria-label="Paginasi tabel"
            className="flex items-center justify-between px-2"
        >
            {showSelection && (
                <div className="text-muted-foreground text-sm">
                    {selectedRowCount} dari {totalRowCount} baris dipilih
                </div>
            )}
            <div
                className={`flex items-center gap-2 ${showSelection ? '' : 'ml-auto'}`}
            >
                <span className="text-muted-foreground text-sm">
                    {pageStatus}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
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
                    className="h-8 w-8"
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
                    className="h-8 w-8"
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
                    className="h-8 w-8"
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

'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ValidationResult } from "@/lib/stock-import-validator";
import { cn } from "@/lib/utils";

interface ImportStockPreviewTableProps {
    results: ValidationResult[];
}

export function ImportStockPreviewTable({ results }: ImportStockPreviewTableProps) {
    // Only show up to 100 rows for performance in preview
    const displayResults = results.slice(0, 100);
    const hasMore = results.length > 100;

    return (
        <div className="rounded-md border">
            <div className="max-h-[400px] overflow-auto">
                <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-[50px]">Row</TableHead>
                            <TableHead>SKU Code</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayResults.map((result) => (
                            <TableRow key={result.row} className={cn(!result.isValid && "bg-destructive/5")}>
                                <TableCell className="font-mono text-xs text-muted-foreground">{result.row}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">{result.data.sku_code || '-'}</span>
                                        {getErrorForField(result, 'sku_code') && (
                                            <span className="text-[10px] text-destructive">{getErrorForField(result, 'sku_code')}</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="text-sm">{result.data.location || '-'}</span>
                                        {getErrorForField(result, 'location') && (
                                            <span className="text-[10px] text-destructive">{getErrorForField(result, 'location')}</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="text-sm">{result.data.quantity}</span>
                                        {getErrorForField(result, 'quantity') && (
                                            <span className="text-[10px] text-destructive">{getErrorForField(result, 'quantity')}</span>
                                        )}
                                        {getWarningForField(result, 'quantity') && (
                                            <span className="text-[10px] text-yellow-600">{getWarningForField(result, 'quantity')}</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <StatusBadge result={result} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {hasMore && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-muted/20 border-t">
                    Showing first 100 of {results.length} rows
                </div>
            )}
        </div>
    );
}

function StatusBadge({ result }: { result: ValidationResult }) {
    if (!result.isValid) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant="destructive" className="gap-1 cursor-help">
                            <AlertCircle className="h-3 w-3" />
                            Error
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        <ul className="list-disc pl-4 text-xs">
                            {result.errors.map((e, i) => (
                                <li key={i}>{e.message}</li>
                            ))}
                        </ul>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    if (result.warnings.length > 0) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant="secondary" className="gap-1 text-yellow-700 bg-yellow-100 hover:bg-yellow-200 border-yellow-200 cursor-help">
                            <AlertTriangle className="h-3 w-3" />
                            Warning
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        <ul className="list-disc pl-4 text-xs">
                            {result.warnings.map((e, i) => (
                                <li key={i}>{e.message}</li>
                            ))}
                        </ul>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <Badge variant="outline" className="gap-1 text-green-600 bg-green-50 border-green-200">
            <CheckCircle2 className="h-3 w-3" />
            Valid
        </Badge>
    );
}

function getErrorForField(result: ValidationResult, field: string): string | undefined {
    return result.errors.find(e => e.field === field)?.message;
}

function getWarningForField(result: ValidationResult, field: string): string | undefined {
    return result.warnings.find(e => e.field === field)?.message;
}

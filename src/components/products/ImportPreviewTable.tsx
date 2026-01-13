'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { ValidationResult } from '@/lib/import-validator';

interface ImportPreviewTableProps {
    results: ValidationResult[];
}

export function ImportPreviewTable({ results }: ImportPreviewTableProps) {
    return (
        <div className="border rounded-lg max-h-[500px] overflow-y-auto">
            <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                    <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Issues</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {results.map((result) => {
                        const hasErrors = result.errors.length > 0;
                        const hasWarnings = result.warnings.length > 0;

                        return (
                            <TableRow
                                key={result.row}
                                className={
                                    hasErrors
                                        ? 'bg-red-50/50'
                                        : hasWarnings
                                            ? 'bg-yellow-50/50'
                                            : 'bg-green-50/50'
                                }
                            >
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                    {result.row}
                                </TableCell>
                                <TableCell>
                                    {result.isValid ? (
                                        <Badge variant="outline" className="gap-1 bg-card border-green-500/20">
                                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                                            Valid
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="gap-1 bg-card border-destructive/20">
                                            <AlertCircle className="h-3 w-3 text-red-600" />
                                            Error
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {result.data.product_name || (
                                        <span className="text-red-600 italic">Missing</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {result.data.variant_name || (
                                        <span className="text-red-600 italic">Missing</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs">
                                        {result.data.sku_code || (
                                            <span className="text-red-600">Missing</span>
                                        )}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <span className="text-xs">{result.data.product_type || '—'}</span>
                                </TableCell>
                                <TableCell>
                                    <span className="text-xs">{result.data.primary_unit || '—'}</span>
                                </TableCell>
                                <TableCell>
                                    {(hasErrors || hasWarnings) && (
                                        <div className="space-y-1 max-w-xs">
                                            {result.errors.map((error, i) => (
                                                <div key={i} className="flex items-start gap-1 text-xs">
                                                    <AlertCircle className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                                                    <span className="text-red-700">{error.message}</span>
                                                </div>
                                            ))}
                                            {result.warnings.map((warning, i) => (
                                                <div key={i} className="flex items-start gap-1 text-xs">
                                                    <AlertTriangle className="h-3 w-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                                                    <span className="text-yellow-700">{warning.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

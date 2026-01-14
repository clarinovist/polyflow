'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Upload,
    Download,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Loader2,
    FileDown
} from 'lucide-react';
import { parseImportFile, downloadCSVTemplate, downloadExcelTemplate, downloadErrorReport, rowsToProducts } from '@/lib/csv-parser';
import { validateImportRows, ValidationResult, getValidationSummary } from '@/lib/import-validator';
import { importProducts, getExistingSKUs } from '@/actions/import';
import { ImportPreviewTable } from './ImportPreviewTable';

type ImportStep = 'upload' | 'preview' | 'result';

export function ImportDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<ImportStep>('upload');
    const [_file, setFile] = useState<File | null>(null);
    const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    interface ImportResult {
        success: boolean;
        products: number;
        variants: number;
        errors?: string[];
    }
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');

    const handleFileSelect = async (selectedFile: File) => {
        setIsProcessing(true);
        setFile(selectedFile);
        setProgress(0);
        setStatusMessage('Parsing file...');

        try {
            // Parse file (CSV or Excel)
            setProgress(20);
            const rows = await parseImportFile(selectedFile);

            // Get existing SKUs
            setProgress(40);
            setStatusMessage('Checking for duplicates...');
            const existingSKUs = await getExistingSKUs();

            // Validate rows
            setProgress(70);
            setStatusMessage('Validating data...');
            const results = await validateImportRows(rows, existingSKUs);
            setValidationResults(results);

            // Move to preview step
            setProgress(100);
            setStatusMessage('');
            setStep('preview');
        } catch (error) {
            alert(`Error parsing file: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        setIsProcessing(true);

        try {
            // Get only valid rows
            const validResults = validationResults.filter(r => r.isValid);
            const validRows = validResults.map(r => r.data);

            // Convert to product structure
            const products = rowsToProducts(validRows);

            // Import via server action
            const result = await importProducts(products);
            setImportResult(result);

            // Move to result step
            setStep('result');
        } catch (error) {
            alert(`Error importing products: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setOpen(false);
        // Reset state after dialog closes
        setTimeout(() => {
            setStep('upload');
            setFile(null);
            setValidationResults([]);
            setImportResult(null);
        }, 300);
    };

    const summary = getValidationSummary(validationResults);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Products
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                        Import Products
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'upload' && 'Upload a CSV file with your product data'}
                        {step === 'preview' && 'Review and validate your import data'}
                        {step === 'result' && 'Import completed'}
                    </DialogDescription>
                </DialogHeader>

                {/* Upload Step */}
                {step === 'upload' && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-semibold mb-2">Step 1: Download Template</h3>
                            <p className="text-sm text-muted-foreground mb-3">
                                First time? Download our template with example data
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadCSVTemplate}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    CSV Template
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadExcelTemplate}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Excel Template
                                </Button>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Step 2: Upload Filled File</h3>
                            <div
                                className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:bg-muted/10 transition-colors cursor-pointer"
                                onClick={() => document.getElementById('file-upload')?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const droppedFile = e.dataTransfer.files[0];
                                    const fileName = droppedFile.name.toLowerCase();
                                    if (droppedFile && (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
                                        handleFileSelect(droppedFile);
                                    } else {
                                        alert('Please upload a CSV or Excel file');
                                    }
                                }}
                            >
                                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                <p className="text-lg font-medium mb-2 text-foreground">
                                    Drag & drop your file here
                                </p>
                                <p className="text-sm text-muted-foreground mb-4">
                                    or click to browse
                                </p>
                                <p className="text-xs text-muted-foreground/70">
                                    Supported: .csv, .xlsx, .xls | Max: 5MB
                                </p>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={(e) => {
                                        const selectedFile = e.target.files?.[0];
                                        if (selectedFile) {
                                            handleFileSelect(selectedFile);
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {isProcessing && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>{statusMessage || 'Processing file...'}</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        )}
                    </div>
                )}

                {/* Preview Step */}
                {step === 'preview' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Badge variant="outline" className="gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    {summary.valid} valid
                                </Badge>
                                {summary.warnings > 0 && (
                                    <Badge variant="outline" className="gap-1">
                                        <AlertTriangle className="h-3 w-3 text-yellow-600" />
                                        {summary.warnings} warnings
                                    </Badge>
                                )}
                                {summary.errors > 0 && (
                                    <Badge variant="outline" className="gap-1">
                                        <AlertCircle className="h-3 w-3 text-red-600" />
                                        {summary.errors} errors
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <ImportPreviewTable results={validationResults} />

                        {summary.errors > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadErrorReport(validationResults)}
                            >
                                <FileDown className="h-4 w-4 mr-2" />
                                Download Error Report
                            </Button>
                        )}

                        <div className="flex justify-between pt-4">
                            <Button variant="outline" onClick={() => setStep('upload')}>
                                ← Back
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={summary.valid === 0 || isProcessing}
                            >
                                {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Import {summary.valid} Valid Row{summary.valid !== 1 ? 's' : ''}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Result Step */}
                {step === 'result' && importResult && (
                    <div className="space-y-6 py-8">
                        <div className="text-center">
                            {importResult.success ? (
                                <>
                                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-600" />
                                    <h3 className="text-2xl font-bold mb-2">Import Successful!</h3>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-600" />
                                    <h3 className="text-2xl font-bold mb-2">Import Failed</h3>
                                </>
                            )}
                        </div>

                        <div className="bg-muted/30 rounded-lg p-6 space-y-2 border">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Products imported:</span>
                                <span className="font-semibold">{importResult.products}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Variants created:</span>
                                <span className="font-semibold">{importResult.variants}</span>
                            </div>
                            {summary.errors > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Rows skipped (errors):</span>
                                    <span className="font-semibold text-destructive">{summary.errors}</span>
                                </div>
                            )}
                        </div>

                        {importResult.errors && importResult.errors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="font-semibold text-red-900 mb-2">Errors:</p>
                                <ul className="space-y-1">
                                    {importResult.errors.map((error: string, i: number) => (
                                        <li key={i} className="text-sm text-red-700">• {error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button onClick={handleClose}>Done</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

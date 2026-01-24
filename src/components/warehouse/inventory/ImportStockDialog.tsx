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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Upload,
    Download,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Loader2,
    FileDown,
    ArrowRight
} from 'lucide-react';
import { parseStockCSVFile, downloadStockCSVTemplate, downloadStockErrorReport } from '@/lib/stock-csv-parser';
import { validateStockImportRows, ValidationResult, getStockValidationSummary } from '@/lib/stock-import-validator';
import { getStockImportLookups, importInitialStock, ImportStockResult } from '@/actions/stock-import';
import { ImportStockPreviewTable } from './ImportStockPreviewTable';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'preview' | 'result';

export function ImportStockDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<ImportStep>('upload');
    const [_file, setFile] = useState<File | null>(null);
    const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [importResult, setImportResult] = useState<ImportStockResult | null>(null);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [importReason, setImportReason] = useState('Initial Stock Import');

    const handleFileSelect = async (selectedFile: File) => {
        setIsProcessing(true);
        setFile(selectedFile);
        setProgress(0);
        setStatusMessage('Parsing file...');

        try {
            // 1. Parse file
            setProgress(20);
            const rows = await parseStockCSVFile(selectedFile);

            if (rows.length === 0) {
                toast.error("File is empty or contains no valid data");
                setIsProcessing(false);
                return;
            }

            // 2. Fetch Lookups
            setProgress(40);
            setStatusMessage('Fetching system data...');
            const lookups = await getStockImportLookups();

            // Map converting for validator
            const skuMap = new Map<string, string>();
            lookups.products.forEach(p => skuMap.set(p.sku, p.id));

            const locationMap = new Map<string, string>();
            lookups.locations.forEach(l => locationMap.set(l.name, l.id));

            // 3. Validate rows
            setProgress(70);
            setStatusMessage('Validating data...');
            const results = validateStockImportRows(rows, skuMap, locationMap);
            setValidationResults(results);

            // Move to preview step
            setProgress(100);
            setStatusMessage('');
            setStep('preview');
        } catch (error) {
            toast.error(`Error processing file: ${error instanceof Error ? error.message : "Unknown error"}`);
            setFile(null); // Reset
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        setIsProcessing(true);
        setStatusMessage('Importing stock data...');

        try {
            // Get only valid rows and map to server action expected format
            const validResults = validationResults.filter(r => r.isValid && r.productVariantId && r.locationId);
            const importItems = validResults.map(r => ({
                productVariantId: r.productVariantId!,
                locationId: r.locationId!,
                quantity: Number(r.data.quantity)
            }));

            if (importItems.length === 0) {
                toast.error("No valid items to import");
                setIsProcessing(false);
                return;
            }

            // Import via server action
            const result = await importInitialStock(importItems, importReason);
            setImportResult(result);

            if (result.success) {
                toast.success(`Successfully imported ${result.imported} items`);
            } else {
                toast.error("Import failed with errors");
            }

            // Move to result step
            setStep('result');
        } catch (error) {
            toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setOpen(false);
        // Reset state after delay
        setTimeout(() => {
            setStep('upload');
            setFile(null);
            setValidationResults([]);
            setImportResult(null);
            setImportReason('Initial Stock Import');
        }, 300);
    };

    const summary = getStockValidationSummary(validationResults);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import Stock (CSV)
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                        Import Stock Data
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'upload' && 'Upload a CSV file with your stock inventory data'}
                        {step === 'preview' && 'Review and validate your stock data before importing'}
                        {step === 'result' && 'Import process completed'}
                    </DialogDescription>
                </DialogHeader>

                {/* Upload Step */}
                {step === 'upload' && (
                    <div className="space-y-6 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-semibold text-sm mb-2">1. Download Template</h3>
                                    <p className="text-xs text-muted-foreground mb-3">
                                        Use our CSV template to ensure your data is formatted correctly.
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadStockCSVTemplate}
                                        className="w-full justify-start"
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download CSV Template
                                    </Button>
                                    <div className="mt-4 p-3 bg-muted/30 rounded text-xs space-y-1 text-muted-foreground">
                                        <p className="font-semibold text-foreground">Required Columns:</p>
                                        <ul className="list-disc pl-4 space-y-0.5">
                                            <li><span className="font-mono text-foreground">sku_code</span> (Must exist in system)</li>
                                            <li><span className="font-mono text-foreground">location</span> (Must exist in system)</li>
                                            <li><span className="font-mono text-foreground">quantity</span> (Positive number)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm mb-2">2. Upload File</h3>
                                <div
                                    className={`border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/10 transition-colors cursor-pointer flex flex-col items-center justify-center h-[200px] ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
                                    onClick={() => document.getElementById('stock-file-upload')?.click()}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const droppedFile = e.dataTransfer.files[0];
                                        if (droppedFile?.name.toLowerCase().endsWith('.csv')) {
                                            handleFileSelect(droppedFile);
                                        } else {
                                            toast.error('Please upload a .csv file');
                                        }
                                    }}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                                            <p className="text-sm font-medium">{statusMessage}</p>
                                            <Progress value={progress} className="w-[60%] h-2 mt-4" />
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                                            <p className="text-sm font-medium mb-1">Click to upload or drag & drop</p>
                                            <p className="text-xs text-muted-foreground">Supported format: .csv</p>
                                        </>
                                    )}
                                    <input
                                        id="stock-file-upload"
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={(e) => {
                                            const selectedFile = e.target.files?.[0];
                                            if (selectedFile) handleFileSelect(selectedFile);
                                        }}
                                        disabled={isProcessing}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Preview Step */}
                {step === 'preview' && (
                    <div className="space-y-4 pt-2">
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-muted/20 p-4 rounded-lg border">
                            <div className="space-y-1">
                                <Label htmlFor="reason" className="text-xs font-semibold">Adjustment Reason</Label>
                                <Input
                                    id="reason"
                                    value={importReason}
                                    onChange={(e) => setImportReason(e.target.value)}
                                    className="h-8 text-sm w-[300px]"
                                    placeholder="Enter reason..."
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant="outline" className="h-7 gap-1.5 bg-background">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                    <span className="font-mono font-bold">{summary.valid}</span> valid
                                </Badge>
                                {(summary.warnings > 0 || summary.errors > 0) && (
                                    <div className="flex gap-2">
                                        {summary.warnings > 0 && (
                                            <Badge variant="outline" className="h-7 gap-1.5 bg-yellow-50 text-yellow-700 border-yellow-200">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                <span className="font-mono font-bold">{summary.warnings}</span> warnings
                                            </Badge>
                                        )}
                                        {summary.errors > 0 && (
                                            <Badge variant="outline" className="h-7 gap-1.5 bg-red-50 text-red-700 border-red-200">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                <span className="font-mono font-bold">{summary.errors}</span> errors
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <ImportStockPreviewTable results={validationResults} />

                        {summary.errors > 0 && (
                            <div className="flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => downloadStockErrorReport(validationResults)}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <FileDown className="h-3.5 w-3.5 mr-2" />
                                    Download Error Report
                                </Button>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-4 border-t mt-4">
                            <Button variant="ghost" onClick={() => setStep('upload')}>
                                Back to Upload
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={summary.valid === 0 || isProcessing || !importReason.trim()}
                                className="min-w-[150px]"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        Import {summary.valid} Items
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Result Step */}
                {step === 'result' && importResult && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-6">
                        {importResult.success ? (
                            <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>
                        ) : (
                            <div className="h-20 w-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-2">
                                <AlertCircle className="h-10 w-10" />
                            </div>
                        )}

                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-bold">
                                {importResult.success ? 'Import Complete' : 'Import Failed'}
                            </h3>
                            <p className="text-muted-foreground max-w-[400px]">
                                {importResult.success
                                    ? `Successfully processed stock adjustments for ${importResult.imported} items.`
                                    : 'There was a problem processing your import request.'}
                            </p>
                        </div>

                        {importResult.errors && importResult.errors.length > 0 && (
                            <div className="w-full max-w-lg bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive">
                                <p className="font-semibold mb-2">System Errors:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    {importResult.errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <Button onClick={handleClose} size="lg" className="min-w-[150px]">
                            Done
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

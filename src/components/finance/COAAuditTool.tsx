'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { auditRequiredAccounts, fixMissingAccounts, RequiredAccount } from '@/actions/finance/coa-audit';
import { toast } from 'sonner';

export function COAAuditTool() {
    const [audit, setAudit] = useState<{
        total: number;
        existing: number;
        missing: RequiredAccount[];
        isPerfect: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFixing, setIsFixing] = useState(false);

    const runAudit = async () => {
        setIsLoading(true);
        try {
            const result = await auditRequiredAccounts();
            setAudit(result);
        } catch (error) {
            toast.error('Failed to run COA audit');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFix = async () => {
        setIsFixing(true);
        try {
            const result = await fixMissingAccounts();
            if (result.success) {
                toast.success(`Successfully initialized ${result.count} accounts`);
                await runAudit();
            }
        } catch (error) {
            toast.error('Failed to fix accounts');
            console.error(error);
        } finally {
            setIsFixing(false);
        }
    };

    useEffect(() => {
        runAudit();
    }, []);

    if (isLoading && !audit) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Auditing Accounts...
                    </CardTitle>
                </CardHeader>
            </Card>
        );
    }

    if (!audit) return null;

    return (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/50">
            <CardHeader>
                <CardTitle className="text-amber-900 dark:text-amber-400 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    Accounting Integrity Check
                </CardTitle>
                <CardDescription>
                    Verify if all required accounts for automated transactions exist in your Chart of Accounts.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {audit.isPerfect ? (
                    <Alert className="bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" stroke="currentColor" />
                        <AlertTitle>All Good!</AlertTitle>
                        <AlertDescription>
                            All {audit.total} required accounts are present and configured correctly.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-4">
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Action Required</AlertTitle>
                            <AlertDescription>
                                {audit.missing.length} required accounts are missing from your system. Automated workflows (Sales, Production, Inventory) may fail.
                            </AlertDescription>
                        </Alert>

                        <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Code</th>
                                        <th className="px-4 py-2 text-left font-medium">Name</th>
                                        <th className="px-4 py-2 text-left font-medium">Usage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {audit.missing.map((acc) => (
                                        <tr key={acc.code} className="border-b last:border-0">
                                            <td className="px-4 py-2 font-mono text-amber-600 dark:text-amber-400">{acc.code}</td>
                                            <td className="px-4 py-2 font-medium">{acc.name}</td>
                                            <td className="px-4 py-2 text-xs text-muted-foreground">{acc.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
                <Button variant="ghost" size="sm" onClick={runAudit} disabled={isLoading || isFixing}>
                    <RefreshCcw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    Re-scan
                </Button>
                {!audit.isPerfect && (
                    <Button
                        variant="default"
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={handleFix}
                        disabled={isFixing}
                    >
                        {isFixing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Initialize Missing Accounts
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}

// Helper for cn in this file if needed, or import from lib/utils
import { cn } from '@/lib/utils';

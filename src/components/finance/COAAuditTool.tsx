'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    CheckCircle2,
    AlertCircle,
    Loader2,
    RefreshCcw,
    ShieldCheck,
    ArrowRight,
} from 'lucide-react';
import {
    auditRequiredAccounts,
    fixMissingAccounts,
} from '@/actions/finance/coa-audit';
import type { RequiredRoleAuditItem } from '@/actions/finance/coa-audit';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/utils';

interface AuditData {
    total: number;
    ok: number;
    items: RequiredRoleAuditItem[];
    isPerfect: boolean;
}

const STATUS_STYLES: Record<RequiredRoleAuditItem['status'], string> = {
    OK: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
    MISSING:
        'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
    ORPHAN: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
    INACTIVE:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function COAAuditTool() {
    const [audit, setAudit] = useState<AuditData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFixing, setIsFixing] = useState(false);

    const runAudit = async () => {
        setIsLoading(true);
        try {
            const result = await auditRequiredAccounts();
            if (!result.success) {
                toast.error(result.error || 'Gagal menjalankan audit COA');
                return;
            }
            if (result.data) {
                setAudit(result.data);
            }
        } catch (error) {
            toast.error('Gagal menjalankan audit COA');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFix = async () => {
        setIsFixing(true);
        try {
            const result = await fixMissingAccounts();
            if (!result.success) {
                toast.error(result.error || 'Gagal memperbaiki mapping akun');
                return;
            }
            if (result.data?.unresolved?.length) {
                toast.success(
                    `${result.data.count} mapping dibuat. ${result.data.unresolved.length} role belum terselesaikan — cek Role Mapping.`,
                );
            } else {
                toast.success(
                    `${result.data?.count ?? 0} mapping akun berhasil dibuat.`,
                );
            }
            await runAudit();
        } catch (error) {
            toast.error('Gagal memperbaiki mapping akun');
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
                    Verifies semantic role → account mappings required for
                    automated transactions. Mappings are tenant-independent, not
                    tied to fixed account codes.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {audit.isPerfect ? (
                    <Alert className="bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
                        <CheckCircle2
                            className="h-4 w-4"
                            stroke="currentColor"
                        />
                        <AlertTitle>All Good!</AlertTitle>
                        <AlertDescription>
                            All {audit.total} required role mappings are present
                            and point to active accounts.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-4">
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Action Required</AlertTitle>
                            <AlertDescription>
                                {audit.items.filter((i) => i.status !== 'OK')
                                    .length}{' '}
                                required role mappings are missing, orphaned, or
                                inactive. Automated workflows (Sales, Production,
                                Inventory) may fail.
                            </AlertDescription>
                        </Alert>

                        <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">
                                            Role
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium">
                                            Mapping
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium">
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {audit.items.map((item) => (
                                        <tr
                                            key={item.role}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-4 py-2 font-mono">
                                                {item.role}
                                            </td>
                                            <td className="px-4 py-2">
                                                {item.status === 'OK' ? (
                                                    <span>
                                                        <span className="font-mono">
                                                            {item.liveCode}
                                                        </span>{' '}
                                                        {item.liveName}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        {item.mappedCode
                                                            ? `${item.mappedCode} ${item.mappedName ?? ''}`
                                                            : 'Belum dipetakan'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    className={cn(
                                                        'inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                                                        STATUS_STYLES[item.status],
                                                    )}
                                                >
                                                    {item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <Link
                                href="/finance/coa/roles"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                                Kelola di Role Mapping
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={runAudit}
                    disabled={isLoading || isFixing}
                >
                    <RefreshCcw
                        className={cn(
                            'mr-2 h-4 w-4',
                            isLoading && 'animate-spin',
                        )}
                    />
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
                        Seed Missing Role Mappings
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    getRoleMappings,
    updateRoleMapping,
    seedMissingMappings,
    resetAllMappings,
} from '@/actions/finance/role-mapping';
import { getChartOfAccounts } from '@/actions/finance/accounting';
import { filterAccountsForRole } from '@/lib/config/account-filter';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RoleMapping {
    role: string;
    accountId: string | null;
    accountCode: string | null;
    accountName: string | null;
    liveCode: string | null;
    liveName: string | null;
    status: 'OK' | 'ORPHAN' | 'INACTIVE' | 'MISSING';
}

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    isActive: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    OK: 'bg-green-100 text-green-800',
    ORPHAN: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-yellow-100 text-yellow-800',
    MISSING: 'bg-gray-100 text-gray-800',
};

function formatRole(role: string): string {
    return role
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export function RoleMappingClient() {
    const [mappings, setMappings] = useState<RoleMapping[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);
    const [resetDialogOpen, setResetDialogOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [mappingsRes, accountsRes] = await Promise.all([
                getRoleMappings(),
                getChartOfAccounts(),
            ]);
            if (mappingsRes.success && mappingsRes.data) {
                setMappings(mappingsRes.data);
            }
            if (accountsRes.success && accountsRes.data) {
                setAccounts(accountsRes.data.filter((a: Account) => a.isActive));
            }
        } catch {
            toast.error('Failed to load role mappings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    async function handleUpdate(role: string, accountId: string) {
        setSaving(role);
        try {
            const result = await updateRoleMapping(role, accountId);
            if (result.success) {
                toast.success(`Updated ${formatRole(role)}`);
                await loadData();
            } else {
                toast.error(result.error || 'Failed to update');
            }
        } catch {
            toast.error('Failed to update mapping');
        } finally {
            setSaving(null);
        }
    }

    async function handleSeedMissing() {
        setSeeding(true);
        try {
            const result = await seedMissingMappings();
            if (result.success && result.data) {
                const data = result.data;
                toast.success(`Created ${data.created} mappings, skipped ${data.skipped}`);
                await loadData();
            }
        } catch {
            toast.error('Failed to seed mappings');
        } finally {
            setSeeding(false);
        }
    }

    async function handleResetAll() {
        setResetDialogOpen(false);
        setSeeding(true);
        try {
            const result = await resetAllMappings();
            if (result.success && result.data) {
                const data = result.data;
                toast.success(`Reset: ${data.updated} updated, ${data.created} created`);
                await loadData();
            }
        } catch {
            toast.error('Failed to reset mappings');
        } finally {
            setSeeding(false);
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    const missingCount = mappings.filter(m => m.status === 'MISSING').length;
    const orphanCount = mappings.filter(m => m.status === 'ORPHAN').length;

    return (
        <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center gap-3">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeedMissing}
                    disabled={seeding || missingCount === 0}
                >
                    {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Seed Missing ({missingCount})
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                    disabled={seeding}
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset All to Defaults
                </Button>
                {orphanCount > 0 && (
                    <Badge variant="destructive">{orphanCount} orphan mapping{orphanCount > 1 ? 's' : ''}</Badge>
                )}
            </div>

            {/* Mappings table */}
            <Card>
                <CardHeader>
                    <CardTitle>Role Mappings</CardTitle>
                    <CardDescription>
                        {mappings.length} roles configured. Green = mapped, Red = orphan (account deleted), Gray = missing.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {mappings.map((m) => (
                            <div
                                key={m.role}
                                className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                            >
                                <div className="w-48 font-medium text-sm">
                                    {formatRole(m.role)}
                                </div>

                                <div className="flex-1">
                                    <Select
                                        value={m.accountId ?? '__none__'}
                                        onValueChange={(val) => {
                                            if (val !== '__none__') handleUpdate(m.role, val);
                                        }}
                                        disabled={saving === m.role}
                                    >
                                        <SelectTrigger className="w-full max-w-md">
                                            <SelectValue placeholder="Select account..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filterAccountsForRole(m.role, accounts).map((acc) => (
                                                <SelectItem key={acc.id} value={acc.id}>
                                                    {acc.code} — {acc.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Badge className={STATUS_COLORS[m.status]}>
                                    {m.status}
                                </Badge>

                                {saving === m.role && (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Reset confirmation dialog */}
            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset All Mappings?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will overwrite all existing role mappings with pattern-resolved defaults.
                            Manual remaps will be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetAll}>
                            Reset All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

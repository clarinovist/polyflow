'use client';

import { useState } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Power, PowerOff, Calendar } from 'lucide-react';
import { updateTenantModule } from '@/actions/admin/admin-actions';
import { MODULE_DEFINITIONS } from '@/lib/modules/module-registry';
import { format } from 'date-fns';

export interface EntitlementRow {
    moduleKey: string;
    status: string;
    enabledAt: string | null;
    expiresAt: string | null;
}

export function EntitlementPanel({
    tenantId,
    tenantName,
    entitlements,
}: {
    tenantId: string;
    tenantName: string;
    entitlements: EntitlementRow[];
}) {
    const [rows, setRows] = useState<EntitlementRow[]>(entitlements);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [expiryEditKey, setExpiryEditKey] = useState<string | null>(null);
    const [expiryValue, setExpiryValue] = useState('');

    const entitlementMap = new Map(rows.map((r) => [r.moduleKey, r]));

    async function toggle(
        moduleKey: string,
        currentStatus: string | undefined,
    ) {
        setLoadingKey(moduleKey);
        try {
            const action =
                currentStatus === 'ACTIVE' ? 'SUSPEND' : 'ACTIVATE';
            await updateTenantModule(tenantId, moduleKey, action);
            // Refresh local state
            setRows((prev) => {
                const map = new Map(prev.map((r) => [r.moduleKey, r]));
                const existing = map.get(moduleKey);
                if (existing) {
                    map.set(moduleKey, {
                        ...existing,
                        status: action === 'ACTIVATE' ? 'ACTIVE' : 'SUSPENDED',
                    });
                } else {
                    map.set(moduleKey, {
                        moduleKey,
                        status: 'ACTIVE',
                        enabledAt: new Date().toISOString(),
                        expiresAt: null,
                    });
                }
                return Array.from(map.values());
            });
            toast.success(
                `Module "${moduleKey}" ${action === 'ACTIVATE' ? 'diaktifkan' : 'disuspend'} untuk ${tenantName}.`,
            );
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal mengubah status module.',
            );
        } finally {
            setLoadingKey(null);
        }
    }

    async function saveExpiry(moduleKey: string) {
        setLoadingKey(moduleKey);
        try {
            await updateTenantModule(
                tenantId,
                moduleKey,
                'SET_EXPIRY',
                expiryValue || null,
            );
            setRows((prev) =>
                prev.map((r) =>
                    r.moduleKey === moduleKey
                        ? {
                              ...r,
                              expiresAt: expiryValue
                                  ? new Date(expiryValue).toISOString()
                                  : null,
                          }
                        : r,
                ),
            );
            toast.success(`Expiry "${moduleKey}" diperbarui.`);
            setExpiryEditKey(null);
            setExpiryValue('');
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal menyimpan expiry.',
            );
        } finally {
            setLoadingKey(null);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    Module Entitlements
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {MODULE_DEFINITIONS.filter(
                        (m) => m.key !== 'CORE',
                    ).map((mod) => {
                        const ent = entitlementMap.get(mod.key);
                        const isActive = ent?.status === 'ACTIVE';
                        const isLoading = loadingKey === mod.key;
                        const isEditingExpiry = expiryEditKey === mod.key;

                        return (
                            <div
                                key={mod.key}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                            >
                                <div className="flex items-center gap-3">
                                    <div>
                                        <div className="font-medium text-sm">
                                            {mod.label}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {mod.key}
                                        </div>
                                    </div>
                                    <Badge
                                        className={
                                            isActive
                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                : 'bg-muted text-muted-foreground'
                                        }
                                    >
                                        {ent
                                            ? ent.status
                                            : 'NOT_ENTITLED'}
                                    </Badge>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isEditingExpiry ? (
                                        <>
                                            <Input
                                                type="date"
                                                value={expiryValue}
                                                onChange={(e) =>
                                                    setExpiryValue(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-40 h-8 text-xs"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8"
                                                onClick={() =>
                                                    saveExpiry(mod.key)
                                                }
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    'Save'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8"
                                                onClick={() => {
                                                    setExpiryEditKey(null);
                                                    setExpiryValue('');
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            {ent?.expiresAt && (
                                                <span className="text-xs text-muted-foreground">
                                                    Exp:{' '}
                                                    {format(
                                                        new Date(
                                                            ent.expiresAt,
                                                        ),
                                                        'dd MMM yyyy',
                                                    )}
                                                </span>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8"
                                                onClick={() => {
                                                    setExpiryEditKey(mod.key);
                                                    setExpiryValue(
                                                        ent?.expiresAt
                                                            ? format(
                                                                  new Date(
                                                                      ent.expiresAt,
                                                                  ),
                                                                  'yyyy-MM-dd',
                                                              )
                                                            : '',
                                                    );
                                                }}
                                                disabled={!ent || isLoading}
                                                title="Set expiry date"
                                            >
                                                <Calendar className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={
                                                    isActive
                                                        ? 'outline'
                                                        : 'default'
                                                }
                                                className="h-8"
                                                onClick={() =>
                                                    toggle(
                                                        mod.key,
                                                        ent?.status,
                                                    )
                                                }
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : isActive ? (
                                                    <PowerOff className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Power className="h-3.5 w-3.5" />
                                                )}
                                                {isActive
                                                    ? 'Suspend'
                                                    : 'Activate'}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

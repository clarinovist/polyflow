'use client';

import { useState, useEffect } from 'react';
import { Role } from '@prisma/client';
import {
    getRolePermissions,
    updatePermission,
    updatePermissionsBulk,
} from '@/actions/admin/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { settingsLabels } from '@/lib/labels';
import {
    PERMISSION_CATALOG,
    flattenCatalog,
    getFeatureCatalog,
    type PermissionNode,
} from '@/lib/auth/permission-catalog';

const FEATURE_PERMISSIONS = getFeatureCatalog().map((f) => ({
    key: f.key,
    label: f.label,
}));

const ROLES: Role[] = ['WAREHOUSE', 'PLANNING', 'PRODUCTION', 'SALES', 'FINANCE', 'PROCUREMENT']; // Admin is excluded as they have full access

// All module + nested resource keys, flattened once for state init/lookup.
const ALL_CATALOG_KEYS = flattenCatalog().map((n) => n.key);

interface PermissionState {
    [role: string]: {
        [resource: string]: boolean;
    };
}

function descendantKeys(node: PermissionNode): string[] {
    return node.children ? flattenCatalog(node.children).map((n) => n.key) : [];
}

export function AccessControlTab() {
    const [permissions, setPermissions] = useState<PermissionState>({});
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        const fetchPermissions = async () => {
            setLoading(true);
            const newState: PermissionState = {};

            ROLES.forEach(role => {
                newState[role] = {};
                ALL_CATALOG_KEYS.forEach(key => {
                    newState[role][key] = false;
                });
                FEATURE_PERMISSIONS.forEach(feat => {
                    newState[role][feat.key] = false;
                });
            });

            const results = await Promise.all(ROLES.map(role => getRolePermissions(role)));
            results.forEach((result, i) => {
                const role = ROLES[i];
                if (result.success && result.data) {
                    result.data.forEach(p => {
                        if (p.resource in (newState[role] || {})) {
                            newState[role][p.resource] = p.canAccess;
                        }
                    });
                }
            });

            setPermissions(newState);
            setLoading(false);
        };

        fetchPermissions();
    }, []);

    const applyLocal = (role: Role, updates: Record<string, boolean>) => {
        setPermissions(prev => ({
            ...prev,
            [role]: { ...prev[role], ...updates },
        }));
    };

    const handleToggle = async (role: Role, node: PermissionNode, currentVal: boolean) => {
        const newVal = !currentVal;
        const opKey = `${role}-${node.key}`;
        setUpdating(opKey);

        const descendants = descendantKeys(node);
        const previous: Record<string, boolean> = { [node.key]: currentVal };
        descendants.forEach((d) => { previous[d] = permissions[role]?.[d] ?? false; });

        // Optimistic update: checking a parent grants it + all descendants;
        // unchecking cascades false locally too (server cascades in DB).
        const optimistic: Record<string, boolean> = { [node.key]: newVal };
        descendants.forEach((d) => { optimistic[d] = newVal; });
        applyLocal(role, optimistic);

        const result =
            newVal && descendants.length > 0
                ? await updatePermissionsBulk(role, [node.key, ...descendants], true)
                : await updatePermission(role, node.key, newVal);

        if (!result.success) {
            applyLocal(role, previous);
            toast.error(settingsLabels.permissionSaveFailed);
        } else {
            toast.success(settingsLabels.permissionSaved, {
                description: settingsLabels.permissionReloginHint,
                duration: 5000,
            });
        }

        setUpdating(null);
    };

    const handleFeatureToggle = async (role: Role, resource: string, currentVal: boolean) => {
        const newVal = !currentVal;
        setUpdating(`${role}-${resource}`);
        applyLocal(role, { [resource]: newVal });

        const result = await updatePermission(role, resource, newVal);

        if (!result.success) {
            applyLocal(role, { [resource]: currentVal });
            toast.error(settingsLabels.permissionSaveFailed);
        } else {
            toast.success(settingsLabels.permissionSaved, {
                description: settingsLabels.permissionReloginHint,
                duration: 5000,
            });
        }

        setUpdating(null);
    };

    if (loading) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Flatten the tree into rows with a depth level, for indentation.
    const rows: { node: PermissionNode; depth: number }[] = [];
    const walk = (nodes: PermissionNode[], depth: number) => {
        nodes.forEach((node) => {
            rows.push({ node, depth });
            if (node.children) walk(node.children, depth + 1);
        });
    };
    walk(PERMISSION_CATALOG, 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{settingsLabels.accessControl}</CardTitle>
                <CardDescription>
                    {settingsLabels.accessControlDesc}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm space-y-1">
                        <p>{settingsLabels.permissionAutoSaveHint}</p>
                        <p className="text-muted-foreground">{settingsLabels.permissionReloginHint}</p>
                    </AlertDescription>
                </Alert>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[240px]">{settingsLabels.module}</TableHead>
                            {ROLES.map(role => (
                                <TableHead key={role} className="text-center">{role}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(({ node, depth }) => {
                            const descendants = descendantKeys(node);
                            return (
                                <TableRow key={node.key}>
                                    <TableCell className="font-medium" style={{ paddingLeft: `${16 + depth * 24}px` }}>
                                        <div className="flex flex-col">
                                            <span>{node.label}</span>
                                            <span className="text-xs text-muted-foreground">{node.key}</span>
                                        </div>
                                    </TableCell>
                                    {ROLES.map(role => {
                                        const checked = permissions[role]?.[node.key] || false;
                                        const isIndeterminate =
                                            !checked &&
                                            descendants.length > 0 &&
                                            descendants.some((d) => permissions[role]?.[d]);
                                        const opKey = `${role}-${node.key}`;
                                        return (
                                            <TableCell key={opKey} className="text-center">
                                                <div className="flex justify-center">
                                                    <Checkbox
                                                        checked={isIndeterminate ? 'indeterminate' : checked}
                                                        onCheckedChange={() => handleToggle(role, node, checked)}
                                                        disabled={updating === opKey}
                                                        aria-label={`${role} ${node.label}`}
                                                    />
                                                    {updating === opKey && (
                                                        <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                                    )}
                                                </div>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>

                <div className="mt-8 mb-4">
                    <h3 className="text-lg font-medium">{settingsLabels.featurePermissions}</h3>
                    <p className="text-sm text-muted-foreground">{settingsLabels.featurePermissionsDesc}</p>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">{settingsLabels.feature}</TableHead>
                            {ROLES.map(role => (
                                <TableHead key={role} className="text-center">{role}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {FEATURE_PERMISSIONS.map((feat) => (
                            <TableRow key={feat.key}>
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{feat.label}</span>
                                        <span className="text-xs text-muted-foreground">{feat.key}</span>
                                    </div>
                                </TableCell>
                                {ROLES.map(role => (
                                    <TableCell key={`${role}-${feat.key}`} className="text-center">
                                        <div className="flex justify-center">
                                            <Checkbox
                                                checked={permissions[role]?.[feat.key] || false}
                                                onCheckedChange={() => handleFeatureToggle(role, feat.key, permissions[role]?.[feat.key])}
                                                disabled={updating === `${role}-${feat.key}`}
                                                aria-label={`${role} ${feat.label}`}
                                            />
                                            {updating === `${role}-${feat.key}` && (
                                                <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                            )}
                                        </div>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

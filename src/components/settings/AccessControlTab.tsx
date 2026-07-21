'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { Loader2, Info, ChevronRight, ChevronDown } from 'lucide-react';
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

const ROLES: Role[] = ['WAREHOUSE', 'PLANNING', 'PRODUCTION', 'SALES', 'FINANCE', 'PROCUREMENT'];

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

function collectParentKeys(nodes: PermissionNode[]): string[] {
    const out: string[] = [];
    const visit = (list: PermissionNode[]) => {
        for (const n of list) {
            if (n.children?.length) {
                out.push(n.key);
                visit(n.children);
            }
        }
    };
    visit(nodes);
    return out;
}

const ALL_PARENT_KEYS = collectParentKeys(PERMISSION_CATALOG);

function isIndeterminateForRole(
    node: PermissionNode,
    rolePerms: Record<string, boolean> | undefined,
): boolean {
    if (!node.children?.length) return false;
    const checked = rolePerms?.[node.key] || false;
    if (checked) return false;
    const descs = descendantKeys(node);
    return descs.length > 0 && descs.some((d) => rolePerms?.[d]);
}

function getDefaultExpandedKeys(
    catalog: PermissionNode[],
    perms: PermissionState,
): Set<string> {
    const expanded = new Set<string>();
    const walk = (nodes: PermissionNode[]) => {
        for (const node of nodes) {
            if (!node.children?.length) continue;
            const hasIndeterminate = ROLES.some((role) =>
                isIndeterminateForRole(node, perms[role]),
            );
            if (hasIndeterminate) {
                expanded.add(node.key);
            }
            walk(node.children);
        }
    };
    walk(catalog);
    return expanded;
}

export function AccessControlTab() {
    const [permissions, setPermissions] = useState<PermissionState>({});
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [didAutoExpand, setDidAutoExpand] = useState(false);

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

    // Auto-expand parents that are indeterminate in any role once after load
    useEffect(() => {
        if (didAutoExpand || loading) return;
        if (Object.keys(permissions).length === 0) return;
        const auto = getDefaultExpandedKeys(PERMISSION_CATALOG, permissions);
        if (auto.size > 0) {
            setExpandedKeys(auto);
        }
        setDidAutoExpand(true);
    }, [permissions, loading, didAutoExpand]);

    const toggleExpand = useCallback((key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        setExpandedKeys(new Set(ALL_PARENT_KEYS));
    }, []);

    const collapseAll = useCallback(() => {
        setExpandedKeys(new Set());
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

    const rows = useMemo(() => {
        const out: { node: PermissionNode; depth: number }[] = [];
        const walk = (nodes: PermissionNode[], depth: number) => {
            nodes.forEach((node) => {
                out.push({ node, depth });
                if (node.children?.length && expandedKeys.has(node.key)) {
                    walk(node.children, depth + 1);
                }
            });
        };
        walk(PERMISSION_CATALOG, 0);
        return out;
    }, [expandedKeys]);

    if (loading) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

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
                        <p className="text-muted-foreground">{settingsLabels.permissionTreeHint}</p>
                        <p className="text-muted-foreground">{settingsLabels.permissionReloginHint}</p>
                    </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={expandAll}>
                        {settingsLabels.expandAll}
                    </Button>
                    <Button variant="outline" size="sm" onClick={collapseAll}>
                        {settingsLabels.collapseAll}
                    </Button>
                </div>

                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                            <TableRow>
                                <TableHead className="w-[260px] min-w-[220px]">{settingsLabels.module}</TableHead>
                                {ROLES.map(role => (
                                    <TableHead key={role} className="text-center min-w-[72px]">{role}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(({ node, depth }) => {
                                const descendants = descendantKeys(node);
                                const hasChildren = !!node.children?.length;
                                const isExpanded = expandedKeys.has(node.key);
                                return (
                                    <TableRow key={node.key}>
                                        <TableCell className="font-medium" style={{ paddingLeft: `${12 + depth * 20}px` }}>
                                            <div className="flex items-start gap-1">
                                                {hasChildren ? (
                                                    <button
                                                        type="button"
                                                        aria-expanded={isExpanded}
                                                        aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
                                                        onClick={() => toggleExpand(node.key)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                toggleExpand(node.key);
                                                            }
                                                        }}
                                                        className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="w-5 shrink-0" aria-hidden />
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => hasChildren && toggleExpand(node.key)}
                                                        className={hasChildren ? "text-left hover:underline underline-offset-2" : "text-left cursor-default"}
                                                    >
                                                        {node.label}
                                                    </button>
                                                    <span className="text-xs text-muted-foreground truncate">{node.key}</span>
                                                </div>
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
                </div>

                <div className="mt-8 mb-4">
                    <h3 className="text-lg font-medium">{settingsLabels.featurePermissions}</h3>
                    <p className="text-sm text-muted-foreground">{settingsLabels.featurePermissionsDesc}</p>
                </div>

                <div className="rounded-md border overflow-x-auto">
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
                </div>
            </CardContent>
        </Card>
    );
}

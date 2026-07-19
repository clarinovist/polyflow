'use client';

import { useState, useEffect } from 'react';
import { Role } from '@prisma/client';
import { getRolePermissions, updatePermission } from '@/actions/admin/permissions';
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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sidebarLinks } from '@/components/layout/sidebar-nav';
import { settingsLabels } from '@/lib/labels';

// Extract resources from sidebar links
const RESOURCES = sidebarLinks.map(item => ({
    key: item.href,
    label: item.title,
    group: settingsLabels.menu
}));

const FEATURE_PERMISSIONS = [
    {
        key: 'feature:view-prices',
        label: settingsLabels.viewPrices,
        description: settingsLabels.viewPricesDesc
    }
];

const ROLES: Role[] = ['WAREHOUSE', 'PLANNING', 'PRODUCTION', 'SALES', 'FINANCE', 'PROCUREMENT']; // Admin is excluded as they have full access

interface PermissionState {
    [role: string]: {
        [resource: string]: boolean;
    }
}

export function AccessControlTab() {
    const [permissions, setPermissions] = useState<PermissionState>({});
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        const fetchPermissions = async () => {
            setLoading(true);
            const newState: PermissionState = {};

            // Initialize with all false
            ROLES.forEach(role => {
                newState[role] = {};
                RESOURCES.forEach(res => {
                    newState[role][res.key] = false;
                });
                FEATURE_PERMISSIONS.forEach(feat => {
                    newState[role][feat.key] = false;
                });
            });

            // Fetch all roles in parallel instead of sequentially.
            const results = await Promise.all(ROLES.map(role => getRolePermissions(role)));
            results.forEach((result, i) => {
                const role = ROLES[i];
                if (result.success && result.data) {
                    result.data.forEach(p => {
                        newState[role][p.resource] = p.canAccess;
                    });
                }
            });

            setPermissions(newState);
            setLoading(false);
        };

        fetchPermissions();
    }, []);

    const handleToggle = async (role: Role, resource: string, currentVal: boolean) => {
        const newVal = !currentVal;
        setUpdating(`${role}-${resource}`);

        // Optimistic update
        setPermissions(prev => ({
            ...prev,
            [role]: {
                ...prev[role],
                [resource]: newVal
            }
        }));

        const result = await updatePermission(role, resource, newVal);

        if (!result.success) {
            // Revert on failure
            setPermissions(prev => ({
                ...prev,
                [role]: {
                    ...prev[role],
                    [resource]: currentVal
                }
            }));
            toast.error('Gagal memperbarui izin');
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

    return (
        <Card>
            <CardHeader>
                <CardTitle>{settingsLabels.accessControl}</CardTitle>
                <CardDescription>
                    {settingsLabels.accessControlDesc}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">{settingsLabels.module}</TableHead>
                            {ROLES.map(role => (
                                <TableHead key={role} className="text-center">{role}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {RESOURCES.map((res) => (
                            <TableRow key={res.key}>
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{res.label}</span>
                                        <span className="text-xs text-muted-foreground">{res.group}</span>
                                    </div>
                                </TableCell>
                                {ROLES.map(role => (
                                    <TableCell key={`${role}-${res.key}`} className="text-center">
                                        <div className="flex justify-center">
                                            <Checkbox
                                                checked={permissions[role]?.[res.key] || false}
                                                onCheckedChange={() => handleToggle(role, res.key, permissions[role]?.[res.key])}
                                                disabled={updating === `${role}-${res.key}`}
                                            />
                                        </div>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
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
                                        <span className="text-xs text-muted-foreground">{feat.description}</span>
                                    </div>
                                </TableCell>
                                {ROLES.map(role => (
                                    <TableCell key={`${role}-${feat.key}`} className="text-center">
                                        <div className="flex justify-center">
                                            <Checkbox
                                                checked={permissions[role]?.[feat.key] || false}
                                                onCheckedChange={() => handleToggle(role, feat.key, permissions[role]?.[feat.key])}
                                                disabled={updating === `${role}-${feat.key}`}
                                            />
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

'use client';

import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/utils';
import type { CentralWorkspaceOption } from '@/lib/auth/central-workspaces';

export function TenantSwitcher({
    currentTenantId,
    currentTenantName,
    workspaces,
    collapsed = false,
}: {
    currentTenantId?: string;
    currentTenantName?: string;
    workspaces: CentralWorkspaceOption[];
    collapsed?: boolean;
}) {
    if (!currentTenantName) return null;

    if (workspaces.length <= 1) {
        return (
            <div
                className={cn(
                    'flex min-h-11 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-sm',
                    collapsed && 'justify-center px-2',
                )}
                aria-label={`Perusahaan aktif: ${currentTenantName}`}
                title={currentTenantName}
            >
                <Building2 className="h-4 w-4 shrink-0" />
                {!collapsed && (
                    <span className="truncate font-medium">
                        {currentTenantName}
                    </span>
                )}
            </div>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'flex min-h-11 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        collapsed && 'justify-center px-2',
                    )}
                    aria-label={`Ganti perusahaan. Perusahaan aktif: ${currentTenantName}`}
                    title={currentTenantName}
                >
                    <Building2 className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                        <>
                            <span className="min-w-0 flex-1 truncate font-medium">
                                {currentTenantName}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                collisionPadding={16}
                className="w-64 max-w-[calc(100vw-2rem)]"
            >
                <DropdownMenuLabel>Ganti perusahaan</DropdownMenuLabel>
                {workspaces.map((workspace) => (
                    <DropdownMenuItem key={workspace.tenantId} asChild>
                        <a
                            href={workspace.href}
                            onClick={(event) => {
                                if (
                                    document.querySelector(
                                        'form[data-unsaved="true"]',
                                    ) &&
                                    !window.confirm(
                                        'Ada perubahan yang belum disimpan. Tetap ganti perusahaan?',
                                    )
                                ) {
                                    event.preventDefault();
                                }
                            }}
                            aria-current={
                                workspace.tenantId === currentTenantId
                                    ? 'true'
                                    : undefined
                            }
                            className="min-h-11"
                        >
                            <Building2 className="h-4 w-4" />
                            <span className="min-w-0 flex-1 truncate">
                                {workspace.name}
                            </span>
                            {workspace.tenantId === currentTenantId && (
                                <Check
                                    className="h-4 w-4 text-primary"
                                    aria-label="Perusahaan aktif"
                                />
                            )}
                        </a>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

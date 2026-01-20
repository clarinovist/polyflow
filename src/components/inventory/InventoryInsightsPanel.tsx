'use client';

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ClipboardCheck, History, PackagePlus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface InventoryInsightsPanelProps {
    activeLocationId?: string;
    className?: string;
}

export function InventoryInsightsPanel({ activeLocationId: _activeLocationId, className }: InventoryInsightsPanelProps) {
    const actions = [
        {
            label: "Transfer Stock",
            href: "/dashboard/inventory/transfer",
            icon: ArrowLeftRight,
            variant: "outline" as const,
            colorClass: "bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20"
        },
        {
            label: "Adjust Stock",
            href: "/dashboard/inventory/adjust",
            icon: PackagePlus,
            variant: "outline" as const,
            colorClass: "bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/20"
        },
        {
            label: "Stock Opname",
            href: "/dashboard/inventory/opname",
            icon: ClipboardCheck,
            variant: "outline" as const,
            colorClass: "bg-purple-500/10 text-purple-600 group-hover:bg-purple-500/20"
        },

        {
            label: "History Logs",
            href: "/dashboard/inventory/history",
            icon: History,
            variant: "outline" as const,
            colorClass: "bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/20"
        }
    ];

    return (
        <Card className={cn("overflow-hidden", className)}>
            <div className="p-3 space-y-3">
                <div>
                    <h3 className="text-base font-semibold mb-0.5">Inventory Actions</h3>
                    <p className="text-[11px] text-muted-foreground">Quick access to stock management</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {actions.map((action) => (
                        <Link key={action.href} href={action.href} className="contents">
                            <Button
                                variant={action.variant}
                                className="h-auto py-2.5 flex flex-col gap-1.5 items-center justify-center bg-card hover:bg-primary/5 hover:border-primary/50 hover:text-primary transition-all border-border shadow-sm group whitespace-normal text-center"
                            >
                                <div className={cn("p-1.5 rounded-full transition-colors", action.colorClass)}>
                                    <action.icon className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-medium leading-tight">{action.label}</span>
                            </Button>
                        </Link>
                    ))}
                </div>
            </div>
        </Card>
    );
}

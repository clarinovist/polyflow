'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Package,
    ArrowRightLeft,
    History,
    ScanLine
} from 'lucide-react';
import Link from 'next/link';

interface InventoryInsightsPanelProps {
    activeLocationId?: string;
}

export function InventoryInsightsPanel({ activeLocationId: _activeLocationId }: InventoryInsightsPanelProps) {
    return (
        <div className="space-y-6">
            <Card className="h-full border-none shadow-none bg-transparent">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Inventory Actions</h3>
                        <p className="text-sm text-muted-foreground">Quick access to stock management</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Link href="/dashboard/inventory/transfer" className="contents">
                            <Button variant="outline" className="h-auto py-4 flex flex-col gap-3 items-center justify-center bg-card hover:bg-primary/5 hover:border-primary/50 hover:text-primary transition-all border-border shadow-sm">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20 transition-colors">
                                    <ArrowRightLeft className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium">Transfer</span>
                            </Button>
                        </Link>
                        <Link href="/dashboard/inventory/adjustment" className="contents">
                            <Button variant="outline" className="h-auto py-4 flex flex-col gap-3 items-center justify-center bg-card hover:bg-primary/5 hover:border-primary/50 hover:text-primary transition-all border-border shadow-sm">
                                <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/20 transition-colors">
                                    <Package className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium">Adjustment</span>
                            </Button>
                        </Link>
                        <Link href="/dashboard/inventory/opname" className="contents">
                            <Button variant="outline" className="h-auto py-4 flex flex-col gap-3 items-center justify-center bg-card hover:bg-primary/5 hover:border-primary/50 hover:text-primary transition-all border-border shadow-sm">
                                <div className="p-2 rounded-full bg-purple-500/10 text-purple-600 group-hover:bg-purple-500/20 transition-colors">
                                    <ScanLine className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium">Stock Opname</span>
                            </Button>
                        </Link>
                        <Link href="/dashboard/inventory/history" className="contents">
                            <Button variant="outline" className="h-auto py-4 flex flex-col gap-3 items-center justify-center bg-card hover:bg-primary/5 hover:border-primary/50 hover:text-primary transition-all border-border shadow-sm">
                                <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/20 transition-colors">
                                    <History className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium">History Logs</span>
                            </Button>
                        </Link>
                    </div>
                </div>
            </Card>
        </div>
    );
}

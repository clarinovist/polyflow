'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertTriangle, Calculator } from 'lucide-react';
import { OpnameCounter } from './OpnameCounter';
import { OpnameVariance } from './OpnameVariance';
import { toast } from 'sonner';
import { finalizeOpname } from '@/actions/opname';

interface OpnameItem {
    id: string;
    systemQuantity: number;
    countedQuantity: number | null;
    notes: string | null;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: {
            name: string;
        };
    };
}

interface OpnameSession {
    id: string;
    status: string;
    remarks: string | null;
    location: { name: string };
    createdBy?: { name: string | null } | null;
    items: OpnameItem[];
}

interface OpnameDetailClientProps {
    session: OpnameSession;
}

export function OpnameDetailClient({ session }: OpnameDetailClientProps) {
    const [activeTab, setActiveTab] = useState('count');
    const [isFinalizing, setIsFinalizing] = useState(false);
    const router = useRouter();

    const handleFinalize = async () => {
        if (!confirm("Are you sure you want to finalize this session? This will create stock adjustments for all variances.")) {
            return;
        }

        setIsFinalizing(true);
        try {
            const result = await finalizeOpname(session.id);
            if (result.success) {
                toast.success("Session finalized and inventory updated");
                router.refresh();
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch {
            toast.error("Failed to finalize session");
        } finally {
            setIsFinalizing(false);
        }
    };

    const isOpen = session.status === 'OPEN';

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            {session.location.name}
                        </h2>
                        <Badge
                            variant="outline"
                            className={isOpen
                                ? "bg-blue-500/10 text-blue-700 border-blue-200"
                                : "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                            }
                        >
                            {session.status}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">
                        {session.remarks} • Created by {session.createdBy?.name || 'System'}
                    </p>
                </div>

                {isOpen && (
                    <div className="flex gap-2">
                        <Button
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={handleFinalize}
                            disabled={isFinalizing}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Finalize & Reconcile
                        </Button>
                    </div>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                    <TabsTrigger value="count">
                        <Calculator className="mr-2 h-4 w-4" />
                        Count Sheet
                    </TabsTrigger>
                    <TabsTrigger value="variance">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Variance Report
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="count" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Physical Count</CardTitle>
                            <CardDescription>
                                Enter the actual quantities found in the warehouse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OpnameCounter session={session} isReadOnly={!isOpen} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="variance" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Variance Analysis</CardTitle>
                            <CardDescription>
                                Review discrepancies between system record and physical count.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OpnameVariance items={session.items} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

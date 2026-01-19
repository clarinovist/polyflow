'use client';

import { useState } from 'react';
// import { useSession } from 'next-auth/react'; 
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertTriangle, Calculator, ArrowLeft } from 'lucide-react';
import { OpnameCounter } from './OpnameCounter';
import { OpnameVariance } from './OpnameVariance';
import { toast } from 'sonner';
import { completeOpname } from '@/actions/opname';
import Link from 'next/link';

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
    currentUserId: string;
}

export function OpnameDetailClient({ session, currentUserId }: OpnameDetailClientProps) {
    // const { data: sessionData } = useSession(); // Removed
    const [activeTab, setActiveTab] = useState('count');
    const [isFinalizing, setIsFinalizing] = useState(false);
    const router = useRouter();

    const handleFinalize = async () => {
        if (!currentUserId) {
            toast.error("Authentication error: User ID not found.");
            return;
        }

        if (!confirm("Are you sure you want to finalize this session? This will create stock adjustments for all variances.")) {
            return;
        }

        setIsFinalizing(true);
        try {
            const result = await completeOpname(session.id);
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
        <div className="space-y-6 pt-2 pb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Link href="/dashboard/inventory/opname" className="hover:text-foreground transition-colors flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Opname List
                </Link>
                <span>/</span>
                <span className="text-foreground font-medium">Session {session.location.name}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            {session.location.name}
                        </h2>
                        <Badge
                            variant={isOpen ? "secondary" : "outline"}
                            className={isOpen
                                ? "bg-primary/10 text-primary border-transparent"
                                : "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                            }
                        >
                            {session.status}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-2">
                        {session.remarks || "No Remarks"}
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        Created by {session.createdBy?.name || 'System'}
                    </p>
                </div>

                {isOpen && (
                    <div className="flex gap-2">
                        <Button
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-900/10"
                            onClick={handleFinalize}
                            disabled={isFinalizing}
                        >
                            {isFinalizing ? (
                                <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
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
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle>Physical Count</CardTitle>
                            <CardDescription>
                                Enter the actual quantities found in the warehouse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6">
                            <OpnameCounter session={session} isReadOnly={!isOpen} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="variance" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
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

'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Factory, ShoppingCart, AlertCircle, CheckCircle } from 'lucide-react';
import { simulateMrp, createProductionFromSalesOrder } from '@/actions/production';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface ProductionPlanningDialogProps {
    salesOrderId: string;
    salesOrderNumber: string;
    isOpen: boolean;
    onClose: () => void;
    onOrderCreated?: () => void;
}

export function ProductionPlanningDialog({
    salesOrderId,
    salesOrderNumber,
    isOpen,
    onClose,
    onOrderCreated
}: ProductionPlanningDialogProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [hasSimulated, setHasSimulated] = useState(false);

    const [simulationResult, setSimulationResult] = useState<{
        requirements: {
            materialName: string;
            productVariantId: string;
            neededQty: number;
            availableQty: number;
            shortageQty: number;
            unit: string;
            productType: string;
            hasBom: boolean;
        }[];
        canProduce: boolean;
        missingBoms: {
            productName: string;
            productVariantId: string;
        }[];
    } | null>(null);

    const handleSimulate = async () => {
        setIsLoading(true);
        try {
            const result = await simulateMrp(salesOrderId);
            if (result.success && result.data) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setSimulationResult(result.data as any);
                setHasSimulated(true);
            } else {
                toast.error(result.error || "Failed to run simulation");
            }
        } catch (_error) {
            toast.error("An error occurred during simulation");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGeneratePO = async () => {
        setIsLoading(true);
        try {
            const result = await createProductionFromSalesOrder(salesOrderId);
            if (result.success) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = result as any;

                if (data.orderCount > 0) {
                    toast.success(`${data.orderCount} Work Order(s) created! Status: ${data.status}`);
                } else if (data.prCreated) {
                    toast.success("Purchase Request(s) created for shortages. No Work Order needed.");
                } else {
                    toast.info("Stock allocated from inventory. No Work Order needed.");
                }

                if (data.prCreated && data.orderCount > 0) {
                    toast.info("Purchase Request(s) created for shortages.", { duration: 5000 });
                }

                if (onOrderCreated) {
                    onOrderCreated();
                } else {
                    router.push('/production');
                    router.refresh();
                }
                onClose();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                toast.error((result as any).error || "Failed to generate Work Order");
            }
        } catch (_error) {
            toast.error("Failed to generate Work Order");
        } finally {
            setIsLoading(false);
        }
    };

    // Reset state when dialog opens/closes
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setHasSimulated(false);
            setSimulationResult(null);
        }
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Production Planning: Order {salesOrderNumber}</DialogTitle>
                    <DialogDescription>
                        Simulate material requirements and generate work orders.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!hasSimulated ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p className="mb-4">Click &quot;Run Simulation&quot; to check material availability and BOM readiness.</p>
                            <Button onClick={handleSimulate} disabled={isLoading}>
                                {isLoading ? "Simulating..." : "Run Simulation"}
                            </Button>
                        </div>
                    ) : (
                        simulationResult && (
                            <div className="space-y-4">
                                {simulationResult.missingBoms && simulationResult.missingBoms.length > 0 && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Missing Bill of Materials (BOM)</AlertTitle>
                                        <AlertDescription>
                                            The following products do not have a default BOM. Please create a BOM first:
                                            <ul className="list-disc pl-5 mt-2">
                                                {simulationResult.missingBoms.map(item => (
                                                    <li key={item.productVariantId}>{item.productName}</li>
                                                ))}
                                            </ul>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {simulationResult.missingBoms && simulationResult.missingBoms.length === 0 && !simulationResult.canProduce && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Material Shortage Detected</AlertTitle>
                                        <AlertDescription>
                                            Insufficient raw materials. Work Order will be created as <strong>WAITING_MATERIAL</strong>
                                            and a <strong>Purchase Request</strong> will be automatically generated for the shortages.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {simulationResult.missingBoms && simulationResult.missingBoms.length === 0 && simulationResult.canProduce && (
                                    <Alert className="bg-success/10 text-success border-success/20">
                                        <CheckCircle className="h-4 w-4 text-success" />
                                        <AlertTitle>Materials Available</AlertTitle>
                                        <AlertDescription>
                                            All materials are in stock. Work Order will be created as <strong>DRAFT</strong>.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted sticky top-0 z-10">
                                            <tr>
                                                <th className="p-2 text-left">Item</th>
                                                <th className="p-2 text-center">Replenishment</th>
                                                <th className="p-2 text-right">Required</th>
                                                <th className="p-2 text-right">Available</th>
                                                <th className="p-2 text-right">Shortage</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y relative">
                                            {simulationResult.requirements.map((req, idx) => (
                                                <tr key={idx} className={req.shortageQty > 0 ? "bg-destructive/5" : ""}>
                                                    <td className="p-2 font-medium">
                                                        <div className="flex flex-col">
                                                            <span>{req.materialName}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">{req.productType.replace('_', ' ')}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        <div className="flex justify-center">
                                                            {req.hasBom ? (
                                                                <Badge variant="outline" className="bg-info/10 text-info border-info/20 gap-1 text-[10px] py-0 h-5 px-1.5 flex items-center">
                                                                    <Factory className="h-3 w-3" />
                                                                    PRODUCE
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1 text-[10px] py-0 h-5 px-1.5 flex items-center">
                                                                    <ShoppingCart className="h-3 w-3" />
                                                                    BUY
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        {Number(req.neededQty).toFixed(2)} {req.unit}
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        {Number(req.availableQty).toFixed(2)} {req.unit}
                                                    </td>
                                                    <td className={`p-2 text-right font-bold ${req.shortageQty > 0 ? "text-destructive" : "text-success"}`}>
                                                        {req.shortageQty > 0 ? `-${Number(req.shortageQty).toFixed(2)}` : "OK"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Close</Button>
                    {hasSimulated && (
                        <Button
                            onClick={handleGeneratePO}
                            disabled={isLoading || (simulationResult?.missingBoms?.length ?? 0) > 0}
                            variant={simulationResult?.canProduce ? "default" : "destructive"}
                        >
                            {isLoading ? "Generating..." : "Generate Work Order"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

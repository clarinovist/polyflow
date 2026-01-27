'use client';

import { HelpCircle, Info, Factory, FlaskConical, Package2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ProductionGlossary() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Field Guide
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                <Tabs defaultValue="overview" className="flex flex-col h-full min-h-0">
                    <div className="flex-none bg-background border-b px-6 pt-6">
                        <DialogHeader className="pb-3 pr-10">
                            <DialogTitle className="flex items-center gap-2">
                                <Info className="h-5 w-5 text-blue-600" />
                                Work Order Guide
                            </DialogTitle>
                            <DialogDescription>
                                Complete reference for work order workflows and terminology
                            </DialogDescription>
                        </DialogHeader>

                        <TabsList className="grid w-full grid-cols-4 rounded-none border-t border-x-0">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="status">Status Flow</TabsTrigger>
                            <TabsTrigger value="processes">Processes</TabsTrigger>
                            <TabsTrigger value="quality">Quality</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="overflow-y-auto flex-1 px-6">
                        {/* Overview Tab Content */}
                        <TabsContent value="overview" className="space-y-6 mt-6 pb-6">
                            <GlossarySection
                                icon={Factory}
                                title="Work Order"
                                description="Manufacturing job that tracks production from planning to completion"
                            >
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="Order Number"
                                        description="Unique identifier for each manufacturing job (auto-generated or manual)"
                                        example="WO-20260105-001"
                                    />
                                    <GlossaryItem
                                        term="BOM (Bill of Materials)"
                                        description="Production recipe that defines what to produce and what materials are needed"
                                        example="Standard Red Mix 98:2 → Red Mixed Granules"
                                    />
                                    <GlossaryItem
                                        term="Planned Quantity"
                                        description="Target production amount in primary unit"
                                        example="500 KG Red Mixed Granules"
                                    />
                                    <GlossaryItem
                                        term="Actual Quantity"
                                        description="Real production output (may differ from planned due to scrap/efficiency)"
                                        example="495 KG (500 planned - 5 scrap)"
                                    />
                                </div>
                            </GlossarySection>

                            <GlossarySection
                                icon={FlaskConical}
                                title="Bill of Materials (BOM)"
                                description="Recipe defining inputs and outputs for production"
                            >
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="Output Product"
                                        description="What will be manufactured (result of the production)"
                                        example="Red Mixed Granules (INTERMEDIATE)"
                                    />
                                    <GlossaryItem
                                        term="Output Quantity"
                                        description="Basis quantity for recipe calculation (typically 100 for percentage-based calculations)"
                                        example="100 KG"
                                    />
                                    <GlossaryItem
                                        term="BOM Items"
                                        description="List of ingredients/materials required with their quantities"
                                        example="98 KG Pure PP + 2 KG Red Colorant"
                                    />
                                    <GlossaryItem
                                        term="Scrap Percentage"
                                        description="Expected waste for each ingredient (optional)"
                                        example="1.0% = 1 KG scrap per 100 KG"
                                    />
                                    <GlossaryItem
                                        term="Is Default"
                                        description="Mark as the primary recipe for this product (multiple BOMs can exist)"
                                    />
                                </div>
                            </GlossarySection>

                            <GlossarySection
                                icon={Package2}
                                title="Resources"
                                description="Equipment and personnel involved in production"
                            >
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="Machine"
                                        description="Equipment used for production (must match location)"
                                        example="Mixer Turbo 01 (MIX-01) at Mixing Area"
                                    />
                                    <GlossaryItem
                                        term="Operator"
                                        description="Primary worker assigned to the production order"
                                        example="User with PRODUCTION role"
                                    />
                                    <GlossaryItem
                                        term="Helpers"
                                        description="Additional workers assisting in production (can select multiple)"
                                    />
                                    <GlossaryItem
                                        term="Location"
                                        description="Where production occurs (e.g., Mixing Area, Extrusion Area)"
                                    />
                                </div>
                            </GlossarySection>
                        </TabsContent>

                        {/* Status Flow Tab */}
                        <TabsContent value="status" className="space-y-6 mt-6">
                            <div className="bg-slate-50 p-6 rounded-lg border">
                                <h3 className="font-semibold text-lg mb-4">Work Order Lifecycle</h3>
                                <div className="space-y-3">
                                    <StatusFlowItem
                                        status="DRAFT"
                                        color="slate"
                                        description="Order created but not yet approved"
                                        actions="Review details → Release for production"
                                    />
                                    <div className="flex items-center justify-center">
                                        <div className="h-8 w-0.5 bg-slate-300"></div>
                                    </div>
                                    <StatusFlowItem
                                        status="RELEASED"
                                        color="blue"
                                        description="Approved and ready to start"
                                        actions="Assign machine/operator → Start production"
                                    />
                                    <div className="flex items-center justify-center">
                                        <div className="h-8 w-0.5 bg-slate-300"></div>
                                    </div>
                                    <StatusFlowItem
                                        status="IN_PROGRESS"
                                        color="amber"
                                        description="Currently being produced"
                                        actions="Issue materials → Record scrap → Inspect → Complete"
                                    />
                                    <div className="flex items-center justify-center">
                                        <div className="h-8 w-0.5 bg-slate-300"></div>
                                    </div>
                                    <StatusFlowItem
                                        status="COMPLETED"
                                        color="emerald"
                                        description="Production finished successfully"
                                        actions="Archive and report"
                                    />
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-200">
                                    <StatusFlowItem
                                        status="CANCELLED"
                                        color="red"
                                        description="Order cancelled or aborted"
                                        actions="Document cancellation reason"
                                    />
                                    <p className="text-xs text-slate-500 mt-2 italic">
                                        * Can be cancelled from DRAFT, RELEASED, or IN_PROGRESS status
                                    </p>
                                </div>
                            </div>

                            <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                <div className="flex items-start gap-2">
                                    <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-semibold text-foreground mb-2">Important Notes</h4>
                                        <ul className="text-sm text-foreground/80 space-y-1 list-disc list-inside">
                                            <li>Material issues can only be recorded in IN_PROGRESS status</li>
                                            <li>Always verify material availability before releasing an order</li>
                                            <li>Record actual quantity accurately when completing</li>
                                            <li>Document all scrap and quality issues</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Processes Tab */}
                        <TabsContent value="processes" className="space-y-6 mt-6">
                            <GlossarySection
                                icon={Package2}
                                title="Material Issue"
                                description="Recording raw material consumption during production"
                            >
                                <div className="bg-slate-50 p-4 rounded-lg border mb-4">
                                    <h4 className="font-semibold text-sm mb-2">What Happens:</h4>
                                    <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
                                        <li>Material consumption is recorded</li>
                                        <li>Inventory stock is automatically reduced</li>
                                        <li>Stock movement (OUT) is created for audit trail</li>
                                        <li>Linked to work order for tracking</li>
                                    </ol>
                                </div>
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="When to Record"
                                        description="As materials are consumed during production (order must be IN_PROGRESS)"
                                    />
                                    <GlossaryItem
                                        term="Stock Validation"
                                        description="System checks if sufficient stock exists before allowing issue"
                                    />
                                    <GlossaryItem
                                        term="BOM vs Actual"
                                        description="Compare actual consumption against BOM requirements to track variance"
                                    />
                                </div>
                            </GlossarySection>

                            <GlossarySection
                                icon={AlertTriangle}
                                title="Scrap Recording"
                                description="Tracking waste and defective materials"
                            >
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="Why Track Scrap?"
                                        description="Calculate yield, identify inefficiencies, determine rework opportunities, analyze costs"
                                    />
                                    <GlossaryItem
                                        term="Types of Scrap"
                                        description="Off-spec material, trim/edge waste, defective products, startup waste, machine purging"
                                    />
                                    <GlossaryItem
                                        term="Scrap Rate"
                                        description="(Total Scrap / Planned Quantity) × 100%"
                                        example="16 KG scrap from 500 KG planned = 3.2%"
                                    />
                                </div>
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 mt-4">
                                    <div className="flex items-start gap-2">
                                        <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-amber-800">
                                            <span className="font-semibold">Best Practice:</span> Record scrap immediately
                                            as it occurs, with specific reasons for analysis
                                        </div>
                                    </div>
                                </div>
                            </GlossarySection>

                            <div className="bg-slate-50 p-4 rounded-lg border">
                                <h4 className="font-semibold mb-3">Example: Raffia Production Flow</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Badge className="bg-blue-100 text-blue-700 border-0">Stage 1</Badge>
                                        <span className="font-semibold">Mixing:</span>
                                        <span className="text-slate-600">Raw Materials → Mixed Granules (INTERMEDIATE)</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Badge className="bg-purple-100 text-purple-700 border-0">Stage 2</Badge>
                                        <span className="font-semibold">Extrusion:</span>
                                        <span className="text-slate-600">Mixed Granules → Raffia Roll (WIP)</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Badge className="bg-green-100 text-green-700 border-0">Stage 3</Badge>
                                        <span className="font-semibold">Converting:</span>
                                        <span className="text-slate-600">Raffia Roll → Raffia Bales (FINISHED_GOOD)</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-600 italic mt-3">
                                    * Each stage requires its own work order and BOM<br />
                                    * Transfer material between locations as needed
                                </p>
                            </div>
                        </TabsContent>

                        {/* Quality Tab */}
                        <TabsContent value="quality" className="space-y-6 mt-6">
                            <GlossarySection
                                icon={CheckCircle2}
                                title="Quality Inspection"
                                description="Ensuring products meet specifications"
                            >
                                <div className="space-y-4">
                                    <GlossaryItem
                                        term="Purpose"
                                        description="Verify product quality, identify defective batches early, track metrics, ensure compliance"
                                    />
                                    <GlossaryItem
                                        term="When to Inspect"
                                        description="In-process (during production), final (before completion), re-inspection (after rework)"
                                    />
                                </div>
                            </GlossarySection>

                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">Inspection Results</h3>

                                <InspectionResultCard
                                    result="PASS"
                                    icon={CheckCircle2}
                                    color="green"
                                    description="Product meets all specifications and quality requirements"
                                    action="Proceed to completion and delivery"
                                />

                                <InspectionResultCard
                                    result="FAIL"
                                    icon={XCircle}
                                    color="red"
                                    description="Product does not meet requirements and cannot be used"
                                    action="Scrap or attempt rework if possible"
                                />

                                <InspectionResultCard
                                    result="QUARANTINE"
                                    icon={AlertTriangle}
                                    color="amber"
                                    description="Uncertain quality, requires further review or additional testing"
                                    action="Hold for management decision or re-testing"
                                />
                            </div>

                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                <div className="flex items-start gap-2">
                                    <Info className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-semibold text-green-900 mb-2">Quality Best Practices</h4>
                                        <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                                            <li>Inspect at critical process points, not just at the end</li>
                                            <li>Document specific measurements and findings in notes</li>
                                            <li>Use QUARANTINE when uncertain rather than passing questionable product</li>
                                            <li>Follow up on all FAIL results with corrective actions</li>
                                            <li>Track patterns of repeat failures by product or machine</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <div className="text-sm text-blue-800">
                                    <span className="font-semibold">Note:</span> Multiple inspections can be recorded
                                    for a single work order. Include inspector name and timestamp for accountability.
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

interface GlossarySectionProps {
    icon: React.ElementType;
    title: string;
    description: string;
    children: React.ReactNode;
}

function GlossarySection({ icon: Icon, title, description, children }: GlossarySectionProps) {
    return (
        <div className="border-l-4 border-slate-300 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-slate-600" />
                <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">{description}</p>
            {children}
        </div>
    );
}

interface GlossaryItemProps {
    term: string;
    description: string;
    example?: string;
}

function GlossaryItem({ term, description, example }: GlossaryItemProps) {
    return (
        <div className="bg-card p-3 rounded-lg border border-border">
            <div className="font-semibold text-foreground mb-1">{term}</div>
            <p className="text-sm text-muted-foreground">{description}</p>
            {example && (
                <p className="text-xs text-muted-foreground/70 mt-2 italic">
                    Example: {example}
                </p>
            )}
        </div>
    );
}

interface StatusFlowItemProps {
    status: string;
    color: string;
    description: string;
    actions: string;
}

function StatusFlowItem({ status, color, description, actions }: StatusFlowItemProps) {
    // Map colors to semantic variants if possible, or just use neutral
    // We'll stick to a clean, single-style card for all flow items with a small colored indicator
    const indicatorColors: Record<string, string> = {
        slate: 'bg-zinc-200',
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
        emerald: 'bg-emerald-500',
        red: 'bg-destructive',
    };

    return (
        <div className="p-4 rounded-lg border bg-card relative overflow-hidden">
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", indicatorColors[color] || 'bg-zinc-200')} />
            <div className="pl-2">
                <div className="font-bold text-base mb-1 text-foreground">{status}</div>
                <div className="text-sm mb-2 text-muted-foreground">{description}</div>
                <div className="text-xs text-muted-foreground">→ {actions}</div>
            </div>
        </div>
    );
}

interface InspectionResultCardProps {
    result: string;
    icon: React.ElementType;
    color: string;
    description: string;
    action: string;
}

function InspectionResultCard({ result, icon: Icon, color, description, action }: InspectionResultCardProps) {
    const indicatorColors: Record<string, string> = {
        green: 'text-emerald-600',
        red: 'text-destructive',
        amber: 'text-amber-500',
    };

    const textColor = indicatorColors[color] || 'text-muted-foreground';

    return (
        <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-start gap-3">
                <Icon className={cn("h-6 w-6 flex-shrink-0 mt-0.5", textColor)} />
                <div className="flex-1">
                    <div className={cn("font-bold text-base mb-1", textColor)}>{result}</div>
                    <div className="text-sm mb-2 text-muted-foreground">{description}</div>
                    <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Action:</span> {action}
                    </div>
                </div>
            </div>
        </div>
    );
}

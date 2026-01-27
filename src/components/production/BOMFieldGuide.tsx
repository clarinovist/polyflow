'use client';

import { HelpCircle, Info, FlaskConical, ListChecks, Calculator, TrendingUp } from 'lucide-react';
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

export function BOMFieldGuide() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    BOM Guide
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col p-0">
                <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6">
                    <DialogHeader className="pb-4 pr-10">
                        <DialogTitle className="flex items-center gap-2">
                            <FlaskConical className="h-5 w-5 text-muted-foreground" />
                            Bill of Materials (BOM) - Quick Guide
                        </DialogTitle>
                        <DialogDescription>
                            Learn how to create and manage production recipes
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="overflow-y-auto flex-1 px-6 pt-4 pb-6">
                    <div className="space-y-6">
                        {/* What is a BOM */}
                        <GuideSection
                            icon={Info}
                            title="What is a BOM?"
                            iconColor="text-muted-foreground"
                        >
                            <p className="text-sm text-muted-foreground mb-3">
                                A <span className="font-semibold text-foreground">Bill of Materials (BOM)</span> is a production recipe that defines:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
                                <li>What product will be manufactured (output)</li>
                                <li>What materials are needed (inputs/ingredients)</li>
                                <li>How much of each material is required</li>
                                <li>Expected scrap or waste percentage</li>
                            </ul>
                        </GuideSection>

                        {/* BOM Structure Example */}
                        <GuideSection
                            icon={ListChecks}
                            title="BOM Structure Example"
                            iconColor="text-muted-foreground"
                        >
                            <div className="bg-muted/30 p-4 rounded-lg border">
                                <div className="font-semibold text-foreground mb-2">
                                    Example: Standard Red Mix Recipe
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center py-1 border-b border-border">
                                        <span className="font-semibold text-foreground">Output Product:</span>
                                        <span className="text-muted-foreground">Red Mixed Granules (INTERMEDIATE)</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-border">
                                        <span className="font-semibold text-foreground">Output Quantity:</span>
                                        <span className="text-muted-foreground">100 KG</span>
                                    </div>
                                    <div className="mt-3 pt-2">
                                        <div className="font-semibold text-foreground mb-2">Inputs Required:</div>
                                        <div className="ml-4 space-y-1">
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Pure PP Granules</span>
                                                <span className="font-mono text-foreground">98 KG (1% scrap)</span>
                                            </div>
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Red Colorant</span>
                                                <span className="font-mono text-foreground">2 KG</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground/70">
                                        Total Input: 100 KG → Expected Output: 99 KG (1% scrap loss)
                                    </div>
                                </div>
                            </div>
                        </GuideSection>

                        {/* Creating a BOM */}
                        <GuideSection
                            icon={FlaskConical}
                            title="How to Create a BOM"
                            iconColor="text-muted-foreground"
                        >
                            <div className="space-y-3 text-sm">
                                <StepItem
                                    number={1}
                                    title="Define BOM Details"
                                    description="Enter name, description, and select the output product variant"
                                />
                                <StepItem
                                    number={2}
                                    title="Set Output Quantity"
                                    description="Enter basis quantity (typically 100 for easy percentage calculations)"
                                />
                                <StepItem
                                    number={3}
                                    title="Add Ingredients"
                                    description="Select each raw material or intermediate product needed"
                                />
                                <StepItem number={4}
                                    title="Specify Quantities"
                                    description="Enter how much of each ingredient is required (based on output quantity)"
                                />
                                <StepItem
                                    number={5}
                                    title="Optional: Add Scrap %"
                                    description="Enter expected waste percentage for each ingredient (e.g., 1.0 for 1%)"
                                />
                                <StepItem
                                    number={6}
                                    title="Mark as Default"
                                    description="Check 'Is Default' if this is the primary recipe for this product"
                                />
                            </div>
                        </GuideSection>

                        <GuideSection
                            icon={Calculator}
                            title="How BOM Scaling Works"
                            iconColor="text-muted-foreground"
                        >
                            <p className="text-sm text-muted-foreground mb-3">
                                When you create a work order, the BOM automatically scales based on your planned quantity:
                            </p>
                            <div className="bg-muted/30 p-4 rounded-lg border">
                                <div className="text-sm space-y-2">
                                    <div className="font-semibold text-foreground">BOM Example: 100 KG basis</div>
                                    <div className="ml-4 space-y-1 text-muted-foreground">
                                        <div>• Pure PP: 98 KG</div>
                                        <div>• Red Colorant: 2 KG</div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-border">
                                        <div className="font-semibold text-foreground">Work Order: 500 KG</div>
                                        <div className="ml-4 space-y-1 text-muted-foreground">
                                            <div>• Pure PP: 98 × 5 = <span className="font-bold text-foreground">490 KG</span></div>
                                            <div>• Red Colorant: 2 × 5 = <span className="font-bold text-foreground">10 KG</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </GuideSection>

                        {/* When to Create Multiple BOMs */}
                        <GuideSection
                            icon={TrendingUp}
                            title="When to Create Multiple BOMs"
                            iconColor="text-muted-foreground"
                        >
                            <p className="text-sm text-muted-foreground mb-3">
                                You can create multiple BOMs for the same output product when:
                            </p>
                            <div className="space-y-2">
                                <BOMUseCase
                                    title="Different Formulations"
                                    example="Summer Mix vs. Winter Mix (different additive ratios)"
                                />
                                <BOMUseCase
                                    title="Quality Grades"
                                    example="Premium Grade (higher quality materials) vs. Standard Grade"
                                />
                                <BOMUseCase
                                    title="Production Methods"
                                    example="High-speed mixing vs. Slow mixing (different scrap rates)"
                                />
                                <BOMUseCase
                                    title="Equipment Variations"
                                    example="Large mixer (100 KG basis) vs. Small mixer (50 KG basis)"
                                />
                            </div>
                            <div className="bg-muted/30 p-3 rounded-lg border mt-3">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">Tip:</span> Mark one BOM as &quot;Default&quot; for
                                        the most commonly used recipe. You can select alternative BOMs when creating
                                        work orders.
                                    </div>
                                </div>
                            </div>
                        </GuideSection>

                        {/* Common Mistakes */}
                        <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                            <div className="flex items-start gap-2">
                                <div className="text-destructive font-semibold flex-shrink-0">⚠️</div>
                                <div>
                                    <div className="font-semibold text-foreground mb-2">Common Mistakes to Avoid</div>
                                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                        <li>Forgetting to add all required ingredients</li>
                                        <li>Using the wrong output product variant</li>
                                        <li>Entering quantities that don&apos;t match the output quantity basis</li>
                                        <li>Not updating BOMs when recipes change (create new version instead)</li>
                                        <li>Setting unrealistic scrap percentages</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Best Practices */}
                        <div className="bg-muted/30 p-4 rounded-lg border">
                            <div className="flex items-start gap-2">
                                <div className="text-foreground font-semibold flex-shrink-0">✓</div>
                                <div>
                                    <div className="font-semibold text-foreground mb-2">Best Practices</div>
                                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                        <li>Use descriptive BOM names (include ratio, date, or version)</li>
                                        <li>Document special instructions in the description field</li>
                                        <li>Use 100 as output quantity for easy percentage calculations</li>
                                        <li>Review and update scrap percentages based on actual production data</li>
                                        <li>Test new BOMs with small production batches first</li>
                                        <li>Keep historical BOMs for reference (don&apos;t delete old recipes)</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface GuideSectionProps {
    icon: React.ElementType;
    title: string;
    iconColor: string;
    children: React.ReactNode;
}

function GuideSection({ icon: Icon, title, iconColor, children }: GuideSectionProps) {
    return (
        <div className="border-l-4 border-muted pl-4">
            <div className="flex items-center gap-2 mb-3">
                <Icon className={cn("h-5 w-5", iconColor)} />
                <h3 className="font-semibold text-lg text-foreground">{title}</h3>
            </div>
            {children}
        </div>
    );
}

interface StepItemProps {
    number: number;
    title: string;
    description: string;
}

function StepItem({ number, title, description }: StepItemProps) {
    return (
        <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                {number}
            </div>
            <div>
                <div className="font-semibold text-foreground">{title}</div>
                <div className="text-muted-foreground">{description}</div>
            </div>
        </div>
    );
}

interface BOMUseCaseProps {
    title: string;
    example: string;
}

function BOMUseCase({ title, example }: BOMUseCaseProps) {
    return (
        <div className="bg-card p-3 rounded border border-border">
            <div className="font-semibold text-foreground text-sm">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">Example: {example}</div>
        </div>
    );
}

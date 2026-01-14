'use client';

import { HelpCircle, Info, Package, DollarSign, Scale, Tag } from 'lucide-react';
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

export function ProductGlossary() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Field Guide
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
                <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6">
                    <DialogHeader className="pb-4 pr-10">
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-muted-foreground" />
                            Product Master - Field Guide
                        </DialogTitle>
                        <DialogDescription>
                            Quick reference for all product terminology and fields
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="overflow-y-auto flex-1 px-6 pt-4 pb-6">
                    <div className="space-y-8">
                        {/* Product Types */}
                        <GlossarySection
                            icon={Package}
                            title="Product Types"
                            description="Categories based on production stage"
                        >
                            <GlossaryItem
                                term="RAW_MATERIAL"
                                badge="RM"
                                badgeVariant="outline"
                                description="Incoming materials from suppliers (e.g., PP Granules, Colorant)"
                                example="Pure PP Granules, Red Colorant Masterbatch"
                            />
                            <GlossaryItem
                                term="INTERMEDIATE"
                                badge="IN"
                                badgeVariant="outline"
                                description="Result of mixing/blending processes, not yet final product"
                                example="Red Mixed Granules (PP + Colorant)"
                            />
                            <GlossaryItem
                                term="PACKAGING"
                                badge="PK"
                                badgeVariant="outline"
                                description="Packaging materials and supplies"
                                example="Boxes, Labels, Pallets"
                            />
                            <GlossaryItem
                                term="WIP (Work in Progress)"
                                badge="WP"
                                badgeVariant="outline"
                                description="Semi-finished goods currently in production"
                                example="Red Raffia Jumbo Roll (before cutting)"
                            />
                            <GlossaryItem
                                term="FINISHED_GOOD"
                                badge="FG"
                                badgeVariant="default"
                                description="Ready-to-sell products"
                                example="Red Raffia Bales (5kg, 10kg)"
                            />
                            <GlossaryItem
                                term="SCRAP"
                                badge="SC"
                                badgeVariant="destructive"
                                description="Production waste and recyclable materials"
                                example="Edge Trim, Rejected Products, Regrind"
                            />
                        </GlossarySection>

                        {/* Units */}
                        <GlossarySection
                            icon={Scale}
                            title="Units of Measurement"
                            description="Available units for tracking inventory"
                        >
                            <GlossaryItem
                                term="KG"
                                description="Kilograms - Weight measurement, most common for raw materials and granules"
                            />
                            <GlossaryItem
                                term="ROLL"
                                description="Roll - For film, raffia, or tape products in roll form"
                            />
                            <GlossaryItem
                                term="BAL"
                                description="Bale - Bundled/packed products (e.g., 1 bale = 5kg or 10kg)"
                            />
                            <GlossaryItem
                                term="PCS"
                                description="Pieces - For discrete countable items"
                            />
                            <GlossaryItem
                                term="ZAK"
                                description="Sack/Bag - For bulk packaging units"
                            />
                        </GlossarySection>

                        {/* SKU Code */}
                        <GlossarySection
                            icon={Tag}
                            title="SKU Code Format"
                            description="8-character unique product identifier"
                        >
                            <div className="bg-muted/30 p-4 rounded-lg border">
                                <div className="font-mono text-lg font-bold text-center mb-3 tracking-wider">
                                    [TYPE][CATEGORY][SEQUENCE]
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">TYPE (2)</div>
                                        <div className="text-xs text-muted-foreground">RM, IN, WP, FG, SC</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">CATEGORY (3)</div>
                                        <div className="text-xs text-muted-foreground">PPG, CLR, MIX, RAF</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">SEQ (3)</div>
                                        <div className="text-xs text-muted-foreground">001-999</div>
                                    </div>
                                </div>
                                <div className="mt-3 p-3 bg-card rounded border font-mono text-sm flex flex-col items-center">
                                    <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Example</span>
                                    <span className="font-bold">RMPPG001</span>
                                    <span className="text-xs text-muted-foreground mt-1 text-center">
                                        Raw Material → PP Granules → #001
                                    </span>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Dual Unit System */}
                        <GlossarySection
                            icon={Scale}
                            title="Dual Unit System"
                            description="Primary unit for internal tracking, sales unit for customer-facing"
                        >
                            <GlossaryItem
                                term="Primary Unit"
                                description="Internal tracking unit (e.g., KG for precise inventory management)"
                                example="All stock movements tracked in KG"
                            />
                            <GlossaryItem
                                term="Sales Unit"
                                description="Customer-facing unit (e.g., BAL for sales orders)"
                                example="Sell in Bales, track internally in KG"
                            />
                            <GlossaryItem
                                term="Conversion Factor"
                                description="How many primary units = 1 sales unit"
                                example="1 BAL = 5 KG → Conversion Factor = 5.0"
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">Tip:</span> For raw materials and scrap,
                                        both units are typically the same (e.g., KG/KG with factor 1.0)
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Pricing */}
                        <GlossarySection
                            icon={DollarSign}
                            title="Price Fields"
                            description="Multiple price points for different purposes"
                        >
                            <GlossaryItem
                                term="Price"
                                description="Base/standard price for general reference"
                                example="IDR 15,000 per KG"
                            />
                            <GlossaryItem
                                term="Buy Price"
                                description="Purchase cost from supplier (for cost calculations and margins)"
                                example="IDR 14,500 per KG (what you pay)"
                            />
                            <GlossaryItem
                                term="Sell Price"
                                description="Sales price to customer (for invoicing and quotations)"
                                example="IDR 16,000 per KG (what customer pays)"
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">Margin Calculation:</span>
                                        {' '}(Sell Price - Buy Price) / Buy Price × 100%
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Min Stock Alert */}
                        <GlossarySection
                            icon={Package}
                            title="Inventory Controls"
                            description="Settings for inventory management"
                        >
                            <GlossaryItem
                                term="Min Stock Alert"
                                description="Threshold quantity - system alerts when total stock across all locations falls below this number"
                                example="Set to 100 KG → Alert when total stock < 100 KG"
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">Best Practice:</span> Set min stock to
                                        (Average Daily Usage × Lead Time Days) + Safety Stock
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Product Attributes */}
                        <GlossarySection
                            icon={Tag}
                            title="Product Attributes"
                            description="Flexible metadata for additional product information"
                        >
                            <div className="text-sm text-slate-600 mb-3">
                                Store custom properties like color, thickness, material grade, etc.
                            </div>
                            <div className="bg-muted/30 p-3 rounded-lg border font-mono text-xs">
                                <div className="text-muted-foreground mb-1">Example JSON:</div>
                                <pre className="text-foreground">{`{
  "color": "Red",
  "thickness": "Standard",
  "material": "PP",
  "grade": "Premium"
}`}</pre>
                            </div>
                        </GlossarySection>
                    </div>
                </div>
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
                <Icon className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-lg text-foreground">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{description}</p>
            <div className="space-y-4">
                {children}
            </div>
        </div>
    );
}

interface GlossaryItemProps {
    term: string;
    description: string;
    example?: string;
    badge?: string;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

function GlossaryItem({ term, description, example, badge, badgeVariant }: GlossaryItemProps) {
    return (
        <div className="bg-card p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-900">{term}</span>
                {badge && (
                    <Badge variant={badgeVariant || 'secondary'} className="text-xs">
                        {badge}
                    </Badge>
                )}
            </div>
            <p className="text-sm text-slate-600">{description}</p>
            {example && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                    Example: {example}
                </p>
            )}
        </div>
    );
}

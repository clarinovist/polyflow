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
                <div className="sticky top-0 z-10 bg-white border-b px-6 pt-6">
                    <DialogHeader className="pb-4 pr-10">
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-blue-600" />
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
                                badgeColor="bg-blue-100 text-blue-700"
                                description="Incoming materials from suppliers (e.g., PP Granules, Colorant)"
                                example="Pure PP Granules, Red Colorant Masterbatch"
                            />
                            <GlossaryItem
                                term="INTERMEDIATE"
                                badge="IN"
                                badgeColor="bg-purple-100 text-purple-700"
                                description="Result of mixing/blending processes, not yet final product"
                                example="Red Mixed Granules (PP + Colorant)"
                            />
                            <GlossaryItem
                                term="PACKAGING"
                                badge="PK"
                                badgeColor="bg-amber-100 text-amber-700"
                                description="Packaging materials and supplies"
                                example="Boxes, Labels, Pallets"
                            />
                            <GlossaryItem
                                term="WIP (Work in Progress)"
                                badge="WP"
                                badgeColor="bg-orange-100 text-orange-700"
                                description="Semi-finished goods currently in production"
                                example="Red Raffia Jumbo Roll (before cutting)"
                            />
                            <GlossaryItem
                                term="FINISHED_GOOD"
                                badge="FG"
                                badgeColor="bg-green-100 text-green-700"
                                description="Ready-to-sell products"
                                example="Red Raffia Bales (5kg, 10kg)"
                            />
                            <GlossaryItem
                                term="SCRAP"
                                badge="SC"
                                badgeColor="bg-red-100 text-red-700"
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
                            <div className="bg-slate-50 p-4 rounded-lg border">
                                <div className="font-mono text-lg font-bold text-center mb-3">
                                    [TYPE][CATEGORY][SEQUENCE]
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div className="text-center">
                                        <div className="font-semibold text-blue-600">TYPE (2)</div>
                                        <div className="text-xs text-slate-600">RM, IN, WP, FG, SC</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-purple-600">CATEGORY (3)</div>
                                        <div className="text-xs text-slate-600">PPG, CLR, MIX, RAF</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-green-600">SEQ (3)</div>
                                        <div className="text-xs text-slate-600">001-999</div>
                                    </div>
                                </div>
                                <div className="mt-3 p-2 bg-white rounded border-l-4 border-blue-500">
                                    <div className="text-xs font-semibold text-slate-700">Example:</div>
                                    <div className="font-mono font-bold text-slate-900">RMPPG001</div>
                                    <div className="text-xs text-slate-600 mt-1">
                                        = Raw Material → PP Granules → #001
                                    </div>
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
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-amber-800">
                                        <span className="font-semibold">Tip:</span> For raw materials and scrap,
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
                            <div className="bg-green-50 p-3 rounded-lg border border-green-200 mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-green-800">
                                        <span className="font-semibold">Margin Calculation:</span>
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
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-blue-800">
                                        <span className="font-semibold">Best Practice:</span> Set min stock to
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
                            <div className="bg-slate-50 p-3 rounded-lg border font-mono text-xs">
                                <div className="text-slate-500 mb-1">Example JSON:</div>
                                <pre className="text-slate-700">{`{
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
                <Icon className="h-5 w-5 text-slate-600" />
                <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">{description}</p>
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
    badgeColor?: string;
}

function GlossaryItem({ term, description, example, badge, badgeColor }: GlossaryItemProps) {
    return (
        <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-900">{term}</span>
                {badge && (
                    <Badge className={`${badgeColor} text-xs border-0`}>
                        {badge}
                    </Badge>
                )}
            </div>
            <p className="text-sm text-slate-600">{description}</p>
            {example && (
                <p className="text-xs text-slate-500 mt-2 italic">
                    Example: {example}
                </p>
            )}
        </div>
    );
}

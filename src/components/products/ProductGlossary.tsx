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
import { productGlossaryLabels } from '@/lib/labels/products';

export function ProductGlossary() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    {productGlossaryLabels.fieldGuide}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
                <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6">
                    <DialogHeader className="pb-4 pr-10">
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-muted-foreground" />
                            {productGlossaryLabels.title}
                        </DialogTitle>
                        <DialogDescription>
                            {productGlossaryLabels.subtitle}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="overflow-y-auto flex-1 px-6 pt-4 pb-6">
                    <div className="space-y-8">
                        {/* Product Types */}
                        <GlossarySection
                            icon={Package}
                            title={productGlossaryLabels.productTypes}
                            description={productGlossaryLabels.productTypesDesc}
                        >
                            <GlossaryItem
                                term={productGlossaryLabels.rmName}
                                badge="RM"
                                badgeVariant="outline"
                                description={productGlossaryLabels.rmDesc}
                                example={productGlossaryLabels.rmExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.inName}
                                badge="IN"
                                badgeVariant="outline"
                                description={productGlossaryLabels.inDesc}
                                example={productGlossaryLabels.inExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.pkName}
                                badge="PK"
                                badgeVariant="outline"
                                description={productGlossaryLabels.pkDesc}
                                example={productGlossaryLabels.pkExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.wipName}
                                badge="WP"
                                badgeVariant="outline"
                                description={productGlossaryLabels.wipDesc}
                                example={productGlossaryLabels.wipExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.fgName}
                                badge="FG"
                                badgeVariant="default"
                                description={productGlossaryLabels.fgDesc}
                                example={productGlossaryLabels.fgExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.scName}
                                badge="SC"
                                badgeVariant="destructive"
                                description={productGlossaryLabels.scDesc}
                                example={productGlossaryLabels.scExample}
                            />
                        </GlossarySection>

                        {/* Units */}
                        <GlossarySection
                            icon={Scale}
                            title={productGlossaryLabels.unitsOfMeasurement}
                            description={productGlossaryLabels.unitsOfMeasurementDesc}
                        >
                            <GlossaryItem
                                term="KG"
                                description={productGlossaryLabels.kgDesc}
                            />
                            <GlossaryItem
                                term="ROLL"
                                description={productGlossaryLabels.rollDesc}
                            />
                            <GlossaryItem
                                term="BAL"
                                description={productGlossaryLabels.balDesc}
                            />
                            <GlossaryItem
                                term="PACK"
                                description={productGlossaryLabels.packDesc}
                            />
                            <GlossaryItem
                                term="ZAK"
                                description={productGlossaryLabels.zakDesc}
                            />
                        </GlossarySection>

                        {/* SKU Code */}
                        <GlossarySection
                            icon={Tag}
                            title={productGlossaryLabels.skuCodeFormat}
                            description={productGlossaryLabels.skuCodeFormatDesc}
                        >
                            <div className="bg-muted/30 p-4 rounded-lg border">
                                <div className="font-mono text-lg font-bold text-center mb-3 tracking-wider">
                                    [TYPE][CATEGORY][SEQUENCE]
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">{productGlossaryLabels.typeLabel}</div>
                                        <div className="text-xs text-muted-foreground">RM, IN, WP, FG, SC</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">{productGlossaryLabels.categoryLabel}</div>
                                        <div className="text-xs text-muted-foreground">PPG, CLR, MIX, RAF</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-foreground">{productGlossaryLabels.seqLabel}</div>
                                        <div className="text-xs text-muted-foreground">001-999</div>
                                    </div>
                                </div>
                                <div className="mt-3 p-3 bg-card rounded border font-mono text-sm flex flex-col items-center">
                                    <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">{productGlossaryLabels.exampleLabel}</span>
                                    <span className="font-bold">RMPPG001</span>
                                    <span className="text-xs text-muted-foreground mt-1 text-center">
                                        {productGlossaryLabels.skuExamplePath}
                                    </span>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Dual Unit System */}
                        <GlossarySection
                            icon={Scale}
                            title={productGlossaryLabels.dualUnitSystem}
                            description={productGlossaryLabels.dualUnitSystemDesc}
                        >
                            <GlossaryItem
                                term={productGlossaryLabels.primaryUnit}
                                description={productGlossaryLabels.primaryUnitDesc}
                                example={productGlossaryLabels.primaryUnitExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.salesUnit}
                                description={productGlossaryLabels.salesUnitDesc}
                                example={productGlossaryLabels.salesUnitExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.conversionFactor}
                                description={productGlossaryLabels.conversionFactorDesc}
                                example={productGlossaryLabels.conversionFactorExample}
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">Tip:</span> {productGlossaryLabels.dualUnitTip}
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Pricing */}
                        <GlossarySection
                            icon={DollarSign}
                            title={productGlossaryLabels.priceFields}
                            description={productGlossaryLabels.priceFieldsDesc}
                        >
                            <GlossaryItem
                                term={productGlossaryLabels.price}
                                description={productGlossaryLabels.priceDesc}
                                example={productGlossaryLabels.priceExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.buyPriceName}
                                description={productGlossaryLabels.buyPriceDesc}
                                example={productGlossaryLabels.buyPriceExample}
                            />
                            <GlossaryItem
                                term={productGlossaryLabels.sellPrice}
                                description={productGlossaryLabels.sellPriceDesc}
                                example={productGlossaryLabels.sellPriceExample}
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">{productGlossaryLabels.marginCalc}</span>
                                        {' '}{productGlossaryLabels.marginFormula}
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Min Stock Alert */}
                        <GlossarySection
                            icon={Package}
                            title={productGlossaryLabels.inventoryControls}
                            description={productGlossaryLabels.inventoryControlsDesc}
                        >
                            <GlossaryItem
                                term={productGlossaryLabels.minStockAlert}
                                description={productGlossaryLabels.minStockAlertDesc}
                                example={productGlossaryLabels.minStockAlertExample}
                            />
                            <div className="bg-muted/30 p-3 rounded-lg border mt-2">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground">{productGlossaryLabels.bestPractice}</span> {productGlossaryLabels.bestPracticeFormula}
                                    </div>
                                </div>
                            </div>
                        </GlossarySection>

                        {/* Product Attributes */}
                        <GlossarySection
                            icon={Tag}
                            title={productGlossaryLabels.productAttributes}
                            description={productGlossaryLabels.productAttributesDesc}
                        >
                            <div className="text-sm text-slate-600 mb-3">
                                {productGlossaryLabels.productAttributesDetail}
                            </div>
                            <div className="bg-muted/30 p-3 rounded-lg border font-mono text-xs">
                                <div className="text-muted-foreground mb-1">{productGlossaryLabels.exampleJson}</div>
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
                    {productGlossaryLabels.exampleLabel}: {example}
                </p>
            )}
        </div>
    );
}

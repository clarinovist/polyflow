import { getBoms } from '@/actions/boms';
import { canViewPrices } from '@/actions/permissions';
import { BOMList } from '@/components/production/bom/BOMList';
import { BOMFieldGuide } from '@/components/production/BOMFieldGuide';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function BomsPage() {
    const [bomsRes, showPrices] = await Promise.all([
        getBoms(),
        canViewPrices()
    ]);

    const boms = (bomsRes.success && bomsRes.data) ? bomsRes.data : [];

    return (
        <div className="relative flex flex-col gap-8">
            {/* Background Decorative Element */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/2 -left-24 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Master Recipes
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Manage your Bill of Materials (BOM) and production formulas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ProductionGlossary />
                    <BOMFieldGuide />
                </div>
            </div>

            <Alert className="bg-background/40 backdrop-blur-md border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-sm relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-start gap-3 relative">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <AlertTitle className="font-bold tracking-tight">Industrial ERP Standards</AlertTitle>
                        <AlertDescription className="text-xs opacity-90">
                            Centralized reference data (BOMs, Machines, Employees) are now managed globally within the Mother Office for data integrity across all production branches.
                        </AlertDescription>
                    </div>
                </div>
            </Alert>

            <BOMList
                boms={boms}
                showPrices={showPrices}
            />
        </div>
    );
}

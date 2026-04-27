import { getBoms } from '@/actions/production/boms';
import { canViewPrices } from '@/actions/admin/permissions';
import { BOMList } from '@/components/production/bom/BOMList';
import { BOMFieldGuide } from '@/components/production/BOMFieldGuide';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';
import { Info, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function BomsPage() {
    const [bomsRes, showPrices] = await Promise.all([
        getBoms(),
        canViewPrices()
    ]);

    const boms = (bomsRes.success && bomsRes.data) ? bomsRes.data : [];

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Master Recipes
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Manage your Bill of Materials (BOM) and production formulas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/boms/material-simulator">
                            <Calculator className="mr-2 h-4 w-4" />
                            Material Simulator
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/boms/hpp-calculator">
                            <Calculator className="mr-2 h-4 w-4" />
                            HPP Calculator
                        </Link>
                    </Button>
                    <ProductionGlossary />
                    <BOMFieldGuide />
                </div>
            </div>

            <Alert className="bg-background border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-sm relative overflow-hidden">
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
                showPrices={showPrices.success ? showPrices.data : false}
            />
        </div >
    );
}

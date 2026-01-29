'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { Search, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getRealtimeStock } from '@/actions/inventory';

interface QuickStockCheckProps {
    products: { id: string; name: string; skuCode: string }[];
    locations: { id: string; name: string }[];
}

export function QuickStockCheck({ products, locations }: QuickStockCheckProps) {
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [stockData, setStockData] = useState<Record<string, number> | null>(null);
    const [loading, setLoading] = useState(false);

    const handleProductSelect = async (productId: string) => {
        setSelectedProduct(productId);
        if (!productId) {
            setStockData(null);
            return;
        }

        setLoading(true);
        try {
            // Check stock across all locations concurrently
            const promises = locations.map(loc =>
                getRealtimeStock(loc.id, productId).then(qty => ({ locId: loc.id, qty }))
            );

            const results = await Promise.all(promises);
            const stockMap: Record<string, number> = {};
            results.forEach(r => stockMap[r.locId] = r.qty);

            setStockData(stockMap);
        } catch (error) {
            console.error("Failed to fetch quick stock:", error);
        } finally {
            setLoading(false);
        }
    };

    const productDetails = products.find(p => p.id === selectedProduct);

    return (
        <Card className="shadow-sm border-border/60 bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    Quick Stock Check
                </CardTitle>
                <CardDescription className="text-xs">Check availability across warehouses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Select Product</label>
                    <ProductCombobox
                        products={products.map(p => ({ ...p, quantity: 0 }))} // Qty irrelevant here
                        value={selectedProduct}
                        onValueChange={handleProductSelect}
                        placeholder="Search SKU..."
                    />
                </div>

                {selectedProduct && (
                    <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
                            <p className="text-sm font-semibold text-foreground">{productDetails?.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{productDetails?.skuCode}</p>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Stock by Location</h4>
                            {loading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {locations.map(loc => {
                                        const qty = stockData?.[loc.id] || 0;
                                        return (
                                            <div key={loc.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-muted-foreground">{loc.name}</span>
                                                </div>
                                                <Badge variant={qty > 0 ? "outline" : "secondary"} className={cn("font-mono font-medium", qty > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "text-muted-foreground opacity-70")}>
                                                    {qty}
                                                </Badge>
                                            </div>
                                        );
                                    })}
                                    {Object.values(stockData || {}).reduce((a, b) => a + b, 0) === 0 && (
                                        <p className="text-xs text-center text-muted-foreground py-2 italic">Out of stock everywhere</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

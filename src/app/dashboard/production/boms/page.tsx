import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { getBoms } from '@/actions/boms';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { BOMFieldGuide } from '@/components/production/BOMFieldGuide';

export default async function BomListPage() {
    const result = await getBoms();
    const boms = result.success ? result.data : [];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">


            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Bill of Materials</h1>
                    <p className="text-muted-foreground mt-2">Manage production recipes and formulas</p>
                </div>
                <div className="flex gap-2">
                    <BOMFieldGuide />
                    <Link href="/dashboard/production/boms/create">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create New Recipe
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="border shadow-sm">
                <CardHeader>
                    <CardTitle>Existing Recipes</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground font-medium">
                                <tr>
                                    <th className="p-3">Recipe Name</th>
                                    <th className="p-3">Output Product</th>
                                    <th className="p-3">Ingredients</th>
                                    <th className="p-3">Basis Qty</th>
                                    <th className="p-3">Last Updated</th>
                                    <th className="p-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {boms?.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            No recipes found. Create one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    boms?.map((bom) => (
                                        <tr key={bom.id} className="hover:bg-muted/50 group">
                                            <td className="p-3 font-medium flex items-center gap-2">
                                                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                                                {bom.name}
                                                {bom.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                                            </td>
                                            <td className="p-3">
                                                {bom.productVariant.name}
                                            </td>
                                            <td className="p-3">
                                                {bom.items.length} items
                                            </td>
                                            <td className="p-3">
                                                {Number(bom.outputQuantity)} {bom.productVariant.primaryUnit}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {format(new Date(bom.updatedAt), 'MMM dd, yyyy')}
                                            </td>
                                            <td className="p-3 text-right">
                                                <Link href={`/dashboard/production/boms/${bom.id}/edit`}>
                                                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                                                        Edit <ChevronRight className="h-4 w-4 ml-1" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

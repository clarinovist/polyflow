'use client';

import Link from 'next/link';

import { useState, useMemo } from 'react';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Info, Package, Search } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { deleteVariant } from '@/actions/product';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { productTypeBadgeLabels, productTableLabels } from '@/lib/labels/products';

type ProductVariant = {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: Prisma.Decimal;
    price: Prisma.Decimal | null;
    standardCost: Prisma.Decimal | null;
    buyPrice: Prisma.Decimal | null;
    minStockAlert: Prisma.Decimal | null;
    currentCost?: number;
    currentStockValue?: number;
    stock: number;
    _count: {
        inventories: number;
    };
    productName: string;
    productType: ProductType;
    productId: string;
};

type Product = {
    id: string;
    name: string;
    productType: ProductType;
    createdAt: Date;
    updatedAt: Date;
    variants: (Omit<ProductVariant, 'productName' | 'productType' | 'productId'>)[];
    totalStock?: number;
};

interface ProductTableProps {
    products: Product[];
    showPrices?: boolean;
}

const productTypeBadgeColors: Record<ProductType, string> = {
    RAW_MATERIAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10 hover:bg-blue-500/20',
    FINISHED_GOOD: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/10 hover:bg-green-500/20',
    SCRAP: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/10 hover:bg-gray-500/20',
    INTERMEDIATE: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/10 hover:bg-purple-500/20',
    PACKAGING: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/10 hover:bg-orange-500/20',
    AUXILIARY: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/10 hover:bg-indigo-500/20',
    WIP: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/10 hover:bg-yellow-500/20',
    SERVICE: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/10 hover:bg-pink-500/20',
    OPERATIONAL: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/10 hover:bg-teal-500/20',
    FIXED_ASSET: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10 hover:bg-amber-500/20',
};

export function ProductTable({ products = [], showPrices = false }: ProductTableProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [variantToDelete, setVariantToDelete] = useState<ProductVariant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    // Flatten products into variants
    const flattenedVariants = useMemo(() => {
        return products.flatMap(product =>
            (product.variants || []).map(variant => ({
                ...variant,
                productName: product.name,
                productType: product.productType,
                productId: product.id,
            }))
        ) as ProductVariant[];
    }, [products]);

    // Filter variants by search query
    const filteredVariants = useMemo(() => {
        if (!searchQuery.trim()) return flattenedVariants;
        const q = searchQuery.toLowerCase();
        return flattenedVariants.filter(v =>
            v.productName.toLowerCase().includes(q) ||
            v.name.toLowerCase().includes(q) ||
            v.skuCode.toLowerCase().includes(q)
        );
    }, [flattenedVariants, searchQuery]);

    const handleDeleteClick = (variant: ProductVariant) => {
        setVariantToDelete(variant);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!variantToDelete) return;

        setIsDeleting(true);
        const result = await deleteVariant(variantToDelete.id);

        if (result.success) {
            toast.success('Variant produk berhasil dihapus.');
            setDeleteDialogOpen(false);
            setVariantToDelete(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Gagal menghapus varian produk.');
        }
        setIsDeleting(false);
    };

    const handleEditClick = (productId: string) => {
        router.push(`/dashboard/products/${productId}/edit`);
    };

    if (flattenedVariants.length === 0) {
        return (
            <div className="text-center py-20 text-muted-foreground bg-muted/5 min-h-[400px] flex flex-col items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                    <Package className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-lg font-medium">{productTableLabels.emptyTitle}</p>
                <p className="text-sm mt-1 max-w-xs mx-auto">{productTableLabels.emptyDescription}</p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            {/* Search Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Cari nama produk, varian, atau SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-muted/30 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors placeholder:text-muted-foreground/60"
                    />
                </div>
                {searchQuery && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {filteredVariants.length} dari {flattenedVariants.length} item
                    </span>
                )}
            </div>

            {/* No search results */}
            {filteredVariants.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm font-medium">Tidak ada hasil untuk &quot;{searchQuery}&quot;</p>
                    <p className="text-xs mt-1">Coba kata kunci lain</p>
                </div>
            )}

            {filteredVariants.length > 0 && (
            <div className="overflow-x-auto">
                <ResponsiveTable minWidth={1000}>
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                <TableHead className="pl-6">{productTableLabels.catalogItem}</TableHead>
                                <TableHead>{productTableLabels.skuCode}</TableHead>
                                <TableHead>{productTableLabels.type}</TableHead>
                                <TableHead>{productTableLabels.unit}</TableHead>
                                <TableHead className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        {productTableLabels.stockLevel}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    {productTableLabels.stockLevelTooltip}
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TableHead>
                                {showPrices && (
                                    <>
                                        <TableHead className="text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1">
                                                {productTableLabels.currentCost}
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs text-xs">
                                                            {productTableLabels.currentCostTooltip}
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1">
                                                {productTableLabels.standardCost}
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs text-xs">
                                                            {productTableLabels.standardCostTooltip}
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right whitespace-nowrap">{productTableLabels.buyPrice}</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">{productTableLabels.catalog}</TableHead>
                                    </>
                                )}
                                <TableHead className="text-right pr-6">{productTableLabels.actions}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredVariants.map((variant) => (
                                <TableRow key={variant.id} className="group border-white/5 hover:bg-primary/[0.02] transition-colors">
                                    <TableCell className="pl-6 py-4">
                                        <div className="flex flex-col">
                                            <Link
                                                href={`/dashboard/products/${variant.productId}`}
                                                className="font-bold text-sm tracking-tight text-foreground truncate max-w-[300px] hover:text-primary transition-colors"
                                            >
                                                {variant.name || variant.productName}
                                            </Link>
                                            {variant.name && variant.name !== variant.productName && (
                                                <span className="text-[11px] text-muted-foreground font-medium">
                                                    {variant.productName}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-white/5">
                                            {variant.skuCode}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`text-[10px] font-bold py-0 h-5 border-transparent ${productTypeBadgeColors[variant.productType]}`}>
                                            {productTypeBadgeLabels[variant.productType]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-[11px] font-semibold text-muted-foreground">
                                            {variant.primaryUnit}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end">
                                            <span className={`text-sm font-bold tracking-tight ${variant.stock <= (Number(variant.minStockAlert) || 0) ? 'text-red-500' : 'text-foreground'}`}>
                                                {variant.stock.toFixed(2)}
                                            </span>
                                            {variant.minStockAlert && (
                                                <span className="text-[9px] text-muted-foreground uppercase tracking-tighter">
                                                    Min: {Number(variant.minStockAlert)}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    {showPrices && (
                                        <>
                                            <TableCell className="text-right font-medium text-sm tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={variant.currentCost ? "text-primary font-bold" : "text-muted-foreground"}>
                                                        {variant.currentCost ? formatRupiah(Number(variant.currentCost)) : '-'}
                                                    </span>
                                                    {variant.currentCost ? (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1 bg-primary/5 text-primary border-primary/20">
                                                            AVG COST
                                                        </Badge>
                                                    ) : variant.standardCost ? (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1">
                                                            FALLBACK
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-sm tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={variant.standardCost ? "text-foreground font-bold" : "text-muted-foreground"}>
                                                        {variant.standardCost ? formatRupiah(Number(variant.standardCost)) : '-'}
                                                    </span>
                                                    {variant.standardCost && (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1">
                                                            PLAN COST
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-sm tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={!variant.currentCost && variant.buyPrice ? "text-foreground font-bold" : "text-muted-foreground"}>
                                                        {variant.buyPrice ? formatRupiah(Number(variant.buyPrice)) : '-'}
                                                    </span>
                                                    {!variant.currentCost && variant.buyPrice && (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1">
                                                            LAST BUY
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-xs tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={!variant.currentCost && !variant.buyPrice ? "text-foreground font-bold" : "text-muted-foreground"}>
                                                        {variant.price ? formatRupiah(Number(variant.price)) : '-'}
                                                    </span>
                                                    {!variant.currentCost && !variant.buyPrice && variant.price && (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1">
                                                            CATALOG
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </>
                                    )}
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                                                onClick={() => handleEditClick(variant.productId)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                                onClick={() => handleDeleteClick(variant)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{productTableLabels.deleteDialogTitle}</DialogTitle>
                        <DialogDescription>
                            {productTableLabels.deleteDialogDescription(
                                variantToDelete?.productName || '',
                                variantToDelete?.name !== variantToDelete?.productName ? variantToDelete?.name || '' : '',
                                variantToDelete?.skuCode || ''
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            {productTableLabels.deleteDialogCancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                        >
                            {isDeleting ? productTableLabels.deleting : productTableLabels.deleteSku}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider >
    );
}

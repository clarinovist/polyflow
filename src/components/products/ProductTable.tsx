'use client';

import Link from 'next/link';

import { useState, useMemo } from 'react';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Info, Package } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
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
    WIP: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/10 hover:bg-yellow-500/20',
};

const productTypeLabels: Record<ProductType, string> = {
    RAW_MATERIAL: 'RM',
    FINISHED_GOOD: 'FG',
    SCRAP: 'Scrap',
    INTERMEDIATE: 'Inter',
    PACKAGING: 'Pack',
    WIP: 'WIP',
};

export function ProductTable({ products, showPrices = false }: ProductTableProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [variantToDelete, setVariantToDelete] = useState<ProductVariant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    // Flatten products into variants
    const flattenedVariants = useMemo(() => {
        return products.flatMap(product =>
            product.variants.map(variant => ({
                ...variant,
                productName: product.name,
                productType: product.productType,
                productId: product.id,
            }))
        ) as ProductVariant[];
    }, [products]);

    const handleDeleteClick = (variant: ProductVariant) => {
        setVariantToDelete(variant);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!variantToDelete) return;

        setIsDeleting(true);
        const result = await deleteVariant(variantToDelete.id);

        if (result.success) {
            toast.success('Product variant deleted successfully');
            setDeleteDialogOpen(false);
            setVariantToDelete(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to delete variant');
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
                <p className="text-lg font-medium">No products found</p>
                <p className="text-sm mt-1 max-w-xs mx-auto">Try changing your filters or create your first product to get started.</p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="overflow-x-auto">
                <ResponsiveTable minWidth={1000}>
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                <TableHead className="pl-6">Catalog Item</TableHead>
                                <TableHead>SKU Code</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        Stock Level
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Current physical stock available for this specific SKU
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TableHead>
                                {showPrices && (
                                    <>
                                        <TableHead className="text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1">
                                                Standard Cost
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs text-xs">
                                                            Unit cost calculated from the Bill of Materials (Recipe).
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Buy Price</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Catalog</TableHead>
                                    </>
                                )}
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {flattenedVariants.map((variant) => (
                                <TableRow key={variant.id} className="group border-white/5 hover:bg-primary/[0.02] transition-colors">
                                    <TableCell className="pl-6 py-4">
                                        <div className="flex flex-col">
                                            <Link
                                                href={`/dashboard/products/${variant.productId}`}
                                                className="font-bold text-sm tracking-tight text-foreground truncate max-w-[300px] hover:text-primary transition-colors"
                                            >
                                                {variant.productName}
                                            </Link>
                                            {variant.name && variant.name !== variant.productName && (
                                                <span className="text-[11px] text-muted-foreground font-medium">
                                                    {variant.name}
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
                                            {productTypeLabels[variant.productType]}
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
                                                    <span className={variant.standardCost ? "text-primary font-bold" : "text-muted-foreground"}>
                                                        {variant.standardCost ? formatRupiah(Number(variant.standardCost)) : '-'}
                                                    </span>
                                                    {variant.standardCost && (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1 bg-primary/5 text-primary border-primary/20">
                                                            VALUED AT
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-sm tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={!variant.standardCost && variant.buyPrice ? "text-foreground font-bold" : "text-muted-foreground"}>
                                                        {variant.buyPrice ? formatRupiah(Number(variant.buyPrice)) : '-'}
                                                    </span>
                                                    {!variant.standardCost && variant.buyPrice && (
                                                        <Badge variant="outline" className="text-[8px] h-4 py-0 px-1 mt-1">
                                                            LAST BUY
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-xs tabular-nums">
                                                <div className="flex flex-col items-end">
                                                    <span className={!variant.standardCost && !variant.buyPrice ? "text-foreground font-bold" : "text-muted-foreground"}>
                                                        {variant.price ? formatRupiah(Number(variant.price)) : '-'}
                                                    </span>
                                                    {!variant.standardCost && !variant.buyPrice && variant.price && (
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

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Product Item</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{variantToDelete?.productName} {variantToDelete?.name !== variantToDelete?.productName ? `(${variantToDelete?.name})` : ''}</strong>?
                            <br />
                            <span className="text-red-500 mt-2 block font-medium">SKU: {variantToDelete?.skuCode}</span>
                            This action cannot be undone and will fail if there is existing inventory or transaction history.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete SKU'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider >
    );
}

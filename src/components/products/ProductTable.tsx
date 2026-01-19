'use client';

import { useState, Fragment } from 'react';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Edit, Trash2, Info } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { deleteProduct } from '@/actions/product';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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
    buyPrice: Prisma.Decimal | null;
    sellPrice: Prisma.Decimal | null;
    minStockAlert: Prisma.Decimal | null;
    _count: {
        inventories: number;
    };
};

type Product = {
    id: string;
    name: string;
    productType: ProductType;
    createdAt: Date;
    updatedAt: Date;
    variants: ProductVariant[];
    totalStock?: number;
};

interface ProductTableProps {
    products: Product[];
    showPrices?: boolean;
}

const productTypeBadgeColors: Record<ProductType, string> = {
    RAW_MATERIAL: 'bg-blue-500 hover:bg-blue-600',
    FINISHED_GOOD: 'bg-green-500 hover:bg-green-600',
    SCRAP: 'bg-gray-500 hover:bg-gray-600',
    INTERMEDIATE: 'bg-purple-500 hover:bg-purple-600',
    PACKAGING: 'bg-orange-500 hover:bg-orange-600',
    WIP: 'bg-yellow-500 hover:bg-yellow-600',
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
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const toggleRow = (productId: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(productId)) {
            newExpanded.delete(productId);
        } else {
            newExpanded.add(productId);
        }
        setExpandedRows(newExpanded);
    };

    const handleDeleteClick = (product: Product) => {
        setProductToDelete(product);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;

        setIsDeleting(true);
        const result = await deleteProduct(productToDelete.id);

        if (result.success) {
            toast.success('Product deleted successfully');
            setDeleteDialogOpen(false);
            setProductToDelete(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to delete product');
        }
        setIsDeleting(false);
    };

    const handleEditClick = (productId: string) => {
        router.push(`/dashboard/products/${productId}/edit`);
    };

    if (products.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No products found</p>
                <p className="text-sm mt-2">Create your first product to get started</p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12 pl-6"></TableHead>
                        <TableHead className="min-w-[200px]">Product Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                Total Stock
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs text-xs">
                                            Sum of all stock across all locations for this product
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </TableHead>
                        {showPrices && <TableHead className="text-right">Price</TableHead>}
                        <TableHead className="text-right">Variants</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product) => {
                        const isExpanded = expandedRows.has(product.id);

                        return (
                            <Fragment key={product.id}>
                                {/* Parent Row */}
                                <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors">
                                    <TableCell onClick={() => toggleRow(product.id)} className="pl-6">
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                                        )}
                                    </TableCell>
                                    <TableCell onClick={() => toggleRow(product.id)} className="whitespace-normal">
                                        <div className="font-medium text-foreground">{product.name}</div>
                                    </TableCell>
                                    <TableCell onClick={() => toggleRow(product.id)}>
                                        <Badge className={productTypeBadgeColors[product.productType]}>
                                            {productTypeLabels[product.productType]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell onClick={() => toggleRow(product.id)} className="text-right">
                                        <span className="font-medium text-foreground">
                                            {product.totalStock?.toFixed(2) || '0.00'}
                                        </span>
                                    </TableCell>
                                    <TableCell onClick={() => toggleRow(product.id)} className="text-right text-muted-foreground">
                                        {product.variants.length}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditClick(product.id)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteClick(product)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>

                                {/* Child Rows (Variants) */}
                                {isExpanded && product.variants.map((variant) => (
                                    <TableRow key={variant.id} className="bg-muted/30 hover:bg-muted/50 transition-colors">
                                        <TableCell className="pl-6"></TableCell>
                                        <TableCell className="pl-8 whitespace-normal">
                                            <div className="text-sm">
                                                <span className="font-medium text-foreground">{variant.name}</span>
                                                <span className="text-muted-foreground ml-2">({variant.skuCode})</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-muted-foreground">
                                                {variant.primaryUnit}
                                                {variant.salesUnit && variant.salesUnit !== variant.primaryUnit && (
                                                    <span className="ml-1 text-muted-foreground/70">
                                                        / {variant.salesUnit} ({variant.conversionFactor.toString()})
                                                    </span>
                                                )}
                                                {variant.primaryUnit}
                                                {variant.salesUnit && variant.salesUnit !== variant.primaryUnit && (
                                                    <span className="ml-1 text-muted-foreground/70">
                                                        / {variant.salesUnit} ({variant.conversionFactor.toString()})
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        {showPrices && (
                                            <TableCell className="text-right font-medium tabular-nums">
                                                {formatRupiah(variant.price ? Number(variant.price) : null)}
                                            </TableCell>
                                        )}
                                        <TableCell className="text-right">
                                            {/* Matches Total Stock column */}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="cursor-help inline-flex items-center gap-1">
                                                        {variant._count.inventories} location(s)
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs text-xs">
                                                        {variant._count.inventories === 0
                                                            ? "This variant has no inventory yet. Use Stock Adjustment to add initial stock."
                                                            : `This variant has stock in ${variant._count.inventories} warehouse location(s).`
                                                        }
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            {/* Matches Actions column */}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Product</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{productToDelete?.name}</strong>?
                            This will also delete all {productToDelete?.variants.length} variant(s).
                            This action cannot be undone.
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
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}

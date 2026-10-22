import {
    getInventoryList,
    getStockMovements,
} from '@/actions/inventory/inventory';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Boxes,
    PackageOpen,
    ArrowRightLeft,
    ClipboardCheck,
} from 'lucide-react';
import {
    LOW_STOCK_THRESHOLD_KG,
    STOCK_LEVEL_LABEL,
    classifyStockLevel,
    countStockLevels,
    type StockLevel,
} from '@/lib/production/stock-level';
import { formatQuantity } from '@/lib/utils/utils';
import AcknowledgeHandoverButton from '@/components/production/AcknowledgeHandoverButton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Items still in stock come first; depleted ones are grouped at the end. */
const STOCK_LEVEL_ORDER: Record<StockLevel, number> = {
    LOW: 0,
    OK: 1,
    DEPLETED: 2,
};

function StockLevelBadge({ level }: { level: StockLevel }) {
    if (level === 'DEPLETED') {
        return (
            <Badge variant="destructive" className="text-[10px]">
                {STOCK_LEVEL_LABEL.DEPLETED}
            </Badge>
        );
    }
    if (level === 'LOW') {
        return (
            <Badge
                variant="outline"
                className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 text-[10px]"
            >
                {STOCK_LEVEL_LABEL.LOW}
            </Badge>
        );
    }
    return (
        <Badge
            variant="outline"
            className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-[10px]"
        >
            {STOCK_LEVEL_LABEL.OK}
        </Badge>
    );
}

export default async function ProductionInventoryPage() {
    // 1. Fetch Current Floor Stock (Mixing Area)
    const inventoryRes = await getInventoryList();
    const allInventory =
        inventoryRes.success && inventoryRes.data ? inventoryRes.data : [];
    const floorInventory = allInventory
        .filter((item) => item.location?.slug === WAREHOUSE_SLUGS.MIXING)
        .map((item) => ({
            item,
            level: classifyStockLevel(Number(item.quantity)),
        }))
        .sort((a, b) => STOCK_LEVEL_ORDER[a.level] - STOCK_LEVEL_ORDER[b.level]);
    const levelCounts = countStockLevels(
        floorInventory.map(({ item }) => Number(item.quantity)),
    );

    // 2. Fetch Recent Handover Activity (Recent Transfers to Mixing Area)
    const movementsRes = await getStockMovements();
    const allMovements =
        movementsRes.success && movementsRes.data ? movementsRes.data : [];
    const recentHandovers = allMovements
        .filter(
            (move) =>
                move.toLocation?.slug === WAREHOUSE_SLUGS.MIXING &&
                move.type === 'TRANSFER',
        )
        .slice(0, 5);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">
                        Stok Lantai & Serah Terima
                    </h2>
                    <p className="text-muted-foreground">
                        Manage materials currently on the production floor.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link href="/warehouse/inventory/transfer">
                        <Button variant="outline" className="text-xs h-9">
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Request Materials
                        </Button>
                    </Link>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs h-9">
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Stock Opname Floor
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Stock Table */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Boxes className="h-5 w-5 text-emerald-600" />
                            Mixing Area Inventory
                        </CardTitle>
                        <CardDescription>
                            Bahan di Area Mixing yang siap dipakai mesin.{' '}
                            {STOCK_LEVEL_LABEL.DEPLETED} {levelCounts.DEPLETED}
                            {' · '}
                            {STOCK_LEVEL_LABEL.LOW} {levelCounts.LOW}
                            {' · '}
                            {STOCK_LEVEL_LABEL.OK} {levelCounts.OK}. Menipis
                            berarti di bawah {formatQuantity(LOW_STOCK_THRESHOLD_KG)}{' '}
                            kg.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead className="text-right">
                                        Quantity
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Status
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {floorInventory.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            Tidak ada stok ditemukan di Mixing
                                            Area.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    floorInventory.map(({ item, level }) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="font-medium">
                                                    {item.productVariant.name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground uppercase">
                                                    {
                                                        item.productVariant
                                                            .product.productType
                                                    }
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {item.productVariant.skuCode}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {formatQuantity(
                                                    Number(item.quantity),
                                                )}{' '}
                                                <span className="text-[10px] font-normal text-muted-foreground">
                                                    {
                                                        item.productVariant
                                                            .primaryUnit
                                                    }
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <StockLevelBadge level={level} />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Handover Activity Feed */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-base flex items-center gap-2">
                                <PackageOpen className="h-4 w-4 text-blue-600" />
                                Incoming Handover
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Recent incoming from warehouse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 px-0">
                            <div className="relative">
                                <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-800" />
                                <div className="space-y-6">
                                    {recentHandovers.length === 0 ? (
                                        <p className="text-center text-xs text-muted-foreground py-4 italic">
                                            No recent activity.
                                        </p>
                                    ) : (
                                        recentHandovers.map((move) => (
                                            <div
                                                key={move.id}
                                                className="relative pl-12 pr-6"
                                            >
                                                <div className="absolute left-4 top-1 h-4 w-4 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-500 z-10" />
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-bold">
                                                            {
                                                                move
                                                                    .productVariant
                                                                    .name
                                                            }
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                                            {new Date(
                                                                move.createdAt,
                                                            ).toLocaleTimeString(
                                                                [],
                                                                {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                },
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-blue-600 font-medium">
                                                        +
                                                        {Number(
                                                            move.quantity,
                                                        ).toLocaleString()}{' '}
                                                        {
                                                            move.productVariant
                                                                .primaryUnit
                                                        }
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1">
                                                        From:{' '}
                                                        {move.fromLocation
                                                            ?.name ||
                                                            'Main Warehouse'}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] font-bold">
                                                            {move.createdBy?.name?.charAt(
                                                                0,
                                                            ) || 'S'}
                                                        </div>
                                                        <span className="text-[9px] text-muted-foreground">
                                                            By{' '}
                                                            {move.createdBy
                                                                ?.name ||
                                                                'System'}
                                                        </span>
                                                        <div className="ml-auto">
                                                            {/* Client component */}
                                                            <AcknowledgeHandoverButton
                                                                movementId={
                                                                    move.id
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="px-6 mt-6">
                                <Button
                                    className="w-full text-xs"
                                    variant="outline"
                                    size="sm"
                                >
                                    View All Activity
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    CheckCircle2, AlertTriangle, Calculator, ArrowLeft,
    Plus, Loader2, Search
} from 'lucide-react';
import { OpnameCounter } from './OpnameCounter';
import { OpnameVariance } from './OpnameVariance';
import { toast } from 'sonner';
import { completeOpname, deleteOpnameSession, addItemToOpname } from '@/actions/inventory/opname';
import { getProductVariants } from '@/actions/production/boms';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';


export interface OpnameItem {
    id: string;
    systemQuantity: number;
    countedQuantity: number | null;
    notes: string | null;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: {
            name: string;
        };
    };
}

export interface OpnameSession {
    id: string;
    status: string;
    remarks: string | null;
    location?: { name: string } | null;
    createdBy?: { name: string | null } | null;
    items: OpnameItem[];
    opnameNumber: string | null;
}

interface OpnameDetailClientProps {
    session: OpnameSession;
    currentUserId: string;
    basePath?: string;
}

export function OpnameDetailClient({ session, currentUserId, basePath = '/warehouse/inventory/opname' }: OpnameDetailClientProps) {
    const [activeTab, setActiveTab] = useState('count');
    const [isFinalizing, setIsFinalizing] = useState(false);
    const router = useRouter();

    // Add Item dialog
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [allVariants, setAllVariants] = useState<Array<{
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: { name: string };
    }>>([]);
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Fetch all variants when dialog opens
    useEffect(() => {
        if (addDialogOpen && allVariants.length === 0) {
            getProductVariants()
                .then(result => {
                    if (result.success && result.data) {
                        setAllVariants(result.data as unknown as typeof allVariants);
                    } else {
                        toast.error('Gagal memuat varian produk');
                    }
                })
                .catch(() => toast.error('Gagal memuat varian produk'));
        }
    }, [addDialogOpen, allVariants.length]);

    // Items already in this session — deduplication is handled server-side via addItemToOpname validation

    const handleAddItem = async (variantId: string) => {
        setIsAddingItem(true);
        try {
            const result = await addItemToOpname(session.id, variantId);
            if (result.success) {
                toast.success('Item berhasil ditambahkan ke opname');
                setAddDialogOpen(false);
                setProductSearch('');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal menambahkan item');
            }
        } catch {
            toast.error('Gagal menambahkan item');
        } finally {
            setIsAddingItem(false);
        }
    };

    const filteredVariants = allVariants.filter(v => {
        if (!productSearch) return true;
        const q = productSearch.toLowerCase();
        return (
            v.name.toLowerCase().includes(q) ||
            v.skuCode.toLowerCase().includes(q) ||
            v.product.name.toLowerCase().includes(q)
        );
    }).slice(0, 30);

    const handleFinalize = async () => {
        if (!currentUserId) {
            toast.error('Kesalahan autentikasi: User ID tidak ditemukan.');
            return;
        }

        if (!confirm('Yakin ingin menyelesaikan sesi ini? Tindakan ini akan membuat penyesuaian stok untuk semua selisih.')) {
            return;
        }

        setIsFinalizing(true);
        try {
            const result = await completeOpname(session.id);
            if (result.success) {
                toast.success("Sesi berhasil diselesaikan dan inventaris diperbarui");
                router.refresh();
            } else {
                toast.error(`Terjadi kesalahan: ${result.error}`);
            }
        } catch {
            toast.error('Gagal menyelesaikan sesi');
        } finally {
            setIsFinalizing(false);
        }
    };

    const isOpen = session.status === 'OPEN';

    return (
        <div className="space-y-6 pt-2 pb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <Link href={basePath} className="hover:text-foreground transition-colors flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    Kembali ke Daftar Opname
                </Link>
                <span>/</span>
                <span className="text-foreground font-medium">{session.opnameNumber || 'New Session'}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            {session.opnameNumber ? `${session.opnameNumber} - ` : ''}{session.location?.name || 'Unknown Location'}
                        </h2>
                        <Badge
                            variant={isOpen ? "secondary" : "outline"}
                            className={isOpen
                                ? "bg-primary/10 text-primary border-transparent"
                                : "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                            }
                        >
                            {session.status}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-2">
                        {session.remarks || "No Remarks"}
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        Created by {session.createdBy?.name || 'System'}
                    </p>
                </div>

                {isOpen && (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setAddDialogOpen(true)}
                            title="Add item not in system inventory"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="icon"
                            onClick={async () => {
                                if (confirm('Yakin ingin menghapus sesi ini? Tindakan ini tidak dapat dibatalkan.')) {
                                    const result = await deleteOpnameSession(session.id);
                                    if (result.success) {
                                        toast.success("Sesi berhasil dihapus");
                                        router.push(basePath);
                                    } else {
                                        toast.error(result.error);
                                    }
                                }
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-900/10"
                            onClick={handleFinalize}
                            disabled={isFinalizing}
                        >
                            {isFinalizing ? (
                                <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Finalize & Reconcile
                        </Button>
                    </div>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                    <TabsTrigger value="count">
                        <Calculator className="mr-2 h-4 w-4" />
                        Count Sheet
                    </TabsTrigger>
                    <TabsTrigger value="variance">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Variance Report
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="count" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle>Physical Count</CardTitle>
                            <CardDescription>
                                Enter the actual quantities found in the warehouse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6">
                            <OpnameCounter session={session} isReadOnly={!isOpen} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="variance" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle>Variance Analysis</CardTitle>
                            <CardDescription>
                                Review discrepancies between system record and physical count.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OpnameVariance items={session.items} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Add Item Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Add Item to Opname
                        </DialogTitle>
                        <DialogDescription>
                            Search and add items found physically but not yet in the inventory system for this location.
                            The item will be added with a system quantity of 0.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, SKU, or product..."
                                className="pl-9"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
                            {filteredVariants.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    {allVariants.length === 0 ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading products...
                                        </div>
                                    ) : (
                                        'Tidak ada produk ditemukan'
                                    )}
                                </div>
                            ) : (
                                filteredVariants.map((variant) => (
                                    <div
                                        key={variant.id}
                                        className="p-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between transition-colors"
                                        onClick={() => handleAddItem(variant.id)}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-medium text-sm truncate">{variant.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {variant.product.name} · SKU: {variant.skuCode}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                            <Badge variant="outline" className="text-xs">
                                                {variant.primaryUnit}
                                            </Badge>
                                            {isAddingItem ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plus className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
}

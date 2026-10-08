'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    CheckCircle2,
    AlertTriangle,
    Calculator,
    ArrowLeft,
    Plus,
    Loader2,
    Search,
    MoreHorizontal,
    Paperclip,
    History,
} from 'lucide-react';
import { OpnameCounter } from './OpnameCounter';
import { OpnameVariance } from './OpnameVariance';
import { toast } from 'sonner';
import {
    completeOpname,
    deleteOpnameSession,
    addItemToOpname,
} from '@/actions/inventory/opname';
import { getProductVariants } from '@/actions/production/boms';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { warehouseComponentLabels } from '@/lib/labels';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { formatWibDate } from '@/lib/utils/timezone';
import { FinalizeOpnameDialog } from './FinalizeOpnameDialog';
import { OpnameReadinessSummary } from './OpnameReadinessSummary';
import {
    WarehouseAttachmentPanel,
    type AttachmentItem,
} from '@/components/warehouse/WarehouseAttachmentPanel';

interface OpnameItem {
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
    effectiveDate?: Date | string | null;
}

interface OpnameDetailClientProps {
    session: OpnameSession;
    currentUserId: string;
    basePath?: string;
    attachments?: AttachmentItem[];
}

export function OpnameDetailClient({
    session,
    currentUserId,
    basePath = '/warehouse/opname',
    attachments = [],
}: OpnameDetailClientProps) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const [activeTab, setActiveTab] = useState('count');
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const moreActionsRef = useRef<HTMLButtonElement>(null);
    const router = useRouter();

    // Add Item dialog
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [allVariants, setAllVariants] = useState<
        Array<{
            id: string;
            name: string;
            skuCode: string;
            primaryUnit: string;
            product: { name: string };
        }>
    >([]);
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Fetch all variants when dialog opens
    useEffect(() => {
        if (!addDialogOpen || allVariants.length > 0) return;
        let cancelled = false;

        getProductVariants()
            .then((result) => {
                if (cancelled) return;
                if (result.success && result.data) {
                    setAllVariants(
                        result.data as unknown as typeof allVariants,
                    );
                } else {
                    toast.error('Gagal memuat varian produk');
                }
            })
            .catch(() => {
                if (!cancelled) toast.error('Gagal memuat varian produk');
            });

        return () => {
            cancelled = true;
        };
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

    const filteredVariants = allVariants
        .filter((v) => {
            if (!productSearch) return true;
            const q = productSearch.toLowerCase();
            return (
                v.name.toLowerCase().includes(q) ||
                v.skuCode.toLowerCase().includes(q) ||
                v.product.name.toLowerCase().includes(q)
            );
        })
        .slice(0, 30);

    const handleFinalize = async (effectiveDate: string) => {
        if (!currentUserId) {
            toast.error('Kesalahan autentikasi: User ID tidak ditemukan.');
            return;
        }

        setIsFinalizing(true);
        try {
            const result = await completeOpname(session.id, effectiveDate);
            if (result.success) {
                toast.success(
                    `Sesi berhasil diselesaikan dengan tanggal efektif ${effectiveDate}`,
                );
                setFinalizeDialogOpen(false);
                router.refresh();
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch {
            toast.error('Gagal menyelesaikan sesi');
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteOpnameSession(session.id);
            if (result.success) {
                toast.success('Sesi berhasil dihapus');
                setDeleteDialogOpen(false);
                router.push(basePath);
            } else {
                toast.error(result.error || 'Gagal menghapus sesi');
            }
        } catch {
            toast.error('Gagal menghapus sesi');
        } finally {
            setIsDeleting(false);
        }
    };

    const isOpen = session.status === 'OPEN';
    const countedCount = session.items.filter(
        (item) => item.countedQuantity !== null,
    ).length;
    const varianceCount = session.items.filter(
        (item) =>
            item.countedQuantity !== null &&
            Number(item.countedQuantity) !== Number(item.systemQuantity),
    ).length;
    const uncountedCount = session.items.length - countedCount;

    return (
        <div className="space-y-6 pt-2 pb-8">
            <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5 xl:sticky xl:top-4 xl:z-20 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                    <Button variant="outline" size="sm" asChild className="min-h-11">
                        <Link href={basePath}>
                            <ArrowLeft className="h-4 w-4" />
                            Kembali ke Daftar Opname
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                {session.opnameNumber || 'Stock Opname'}
                            </h1>
                            <Badge
                                variant={isOpen ? 'secondary' : 'outline'}
                                className={
                                    isOpen
                                        ? 'border-transparent bg-primary/10 text-primary'
                                        : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600'
                                }
                            >
                                {isOpen ? 'Sedang Berjalan' : 'Selesai'}
                            </Badge>
                        </div>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>{session.location?.name || 'Lokasi belum tersedia'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{session.remarks || 'Tanpa catatan'}</span>
                            <span aria-hidden="true">·</span>
                            <span>Dibuat oleh {session.createdBy?.name || 'Sistem'}</span>
                            {session.effectiveDate && (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <span>Efektif {formatWibDate(session.effectiveDate)}</span>
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {isOpen && (
                    <div
                        role="group"
                        aria-label="Aksi stock opname"
                        className="flex flex-wrap items-center gap-2 [&_button]:min-h-11"
                    >
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => setFinalizeDialogOpen(true)}
                            disabled={isFinalizing}
                            aria-describedby={
                                uncountedCount > 0 || varianceCount > 0
                                    ? 'opname-readiness-warning'
                                    : undefined
                            }
                        >
                            {isFinalizing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4" />
                            )}
                            {warehouseComponentLabels.finalizeOpname}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    ref={moreActionsRef}
                                    variant="outline"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                    Lainnya
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-56"
                                onCloseAutoFocus={(event) => {
                                    if (deleteDialogOpen) event.preventDefault();
                                }}
                            >
                                <DropdownMenuItem
                                    className="min-h-11"
                                    onSelect={() => setAddDialogOpen(true)}
                                >
                                    <Plus className="h-4 w-4" />
                                    Tambah Item
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    variant="destructive"
                                    className="min-h-11"
                                    onSelect={() => setDeleteDialogOpen(true)}
                                >
                                    Hapus Sesi
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </header>

            <OpnameReadinessSummary
                locationName={session.location?.name || 'Lokasi belum tersedia'}
                itemCount={session.items.length}
                countedCount={countedCount}
                varianceCount={varianceCount}
                attachmentCount={safeAttachments.length}
                isOpen={isOpen}
            />

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
            >
                <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                    <TabsTrigger value="count" className="min-h-11">
                        <Calculator className="mr-2 h-4 w-4" />
                        Hitung Fisik
                    </TabsTrigger>
                    <TabsTrigger value="variance" className="min-h-11">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Selisih ({varianceCount})
                    </TabsTrigger>
                    <TabsTrigger value="evidence" className="min-h-11">
                        <Paperclip className="mr-2 h-4 w-4" />
                        Bukti ({safeAttachments.length})
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="min-h-11">
                        <History className="mr-2 h-4 w-4" />
                        Audit Status
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="count" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle>Perhitungan Fisik</CardTitle>
                            <CardDescription>
                                Masukkan jumlah aktual yang ditemukan di gudang.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6">
                            <OpnameCounter
                                session={session}
                                isReadOnly={!isOpen}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="variance" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle>Analisis Selisih</CardTitle>
                            <CardDescription>
                                Tinjau perbedaan antara catatan sistem dan hasil
                                hitung fisik.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OpnameVariance items={session.items} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="evidence" className="mt-6">
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                Bukti Opname
                            </CardTitle>
                            <CardDescription>
                                Foto kondisi area/rak, item selisih, atau berita
                                acara — opsional.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WarehouseAttachmentPanel
                                entityId={session.id}
                                entityLabel={session.opnameNumber || 'Opname'}
                                entityType="stockOpnameId"
                                checkpoint="OPNAME"
                                attachments={safeAttachments.filter(
                                    (attachment) =>
                                        attachment.checkpoint === 'OPNAME',
                                )}
                                disabled={!isOpen}
                                onAttachmentChange={() => router.refresh()}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit" className="mt-6">
                    <EntityStatusTimeline
                        entityType="StockOpname"
                        entityId={session.id}
                    />
                </TabsContent>
            </Tabs>

            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    if (!isDeleting) setDeleteDialogOpen(open);
                }}
            >
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        moreActionsRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus sesi stock opname?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Sesi {session.opnameNumber || 'ini'} akan dihapus
                            secara permanen. Tindakan ini tidak dapat dibatalkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                            Kembali
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={handleDelete}
                        >
                            {isDeleting ? 'Menghapus…' : 'Hapus Sesi'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Add Item Dialog */}
            <FinalizeOpnameDialog
                open={finalizeDialogOpen}
                onOpenChange={setFinalizeDialogOpen}
                onConfirm={handleFinalize}
                isSubmitting={isFinalizing}
                uncountedItems={uncountedCount}
            />

            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Tambah Item ke Opname
                        </DialogTitle>
                        <DialogDescription>
                            Cari dan tambahkan item yang ditemukan secara
                            fisik tetapi belum ada pada sesi ini. Kuantitas
                            sistem awal item tambahan adalah 0.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari nama, SKU, atau produk..."
                                className="pl-9"
                                value={productSearch}
                                onChange={(e) =>
                                    setProductSearch(e.target.value)
                                }
                                autoFocus
                            />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
                            {filteredVariants.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    {allVariants.length === 0 ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Memuat produk...
                                        </div>
                                    ) : (
                                        'Tidak ada produk ditemukan'
                                    )}
                                </div>
                            ) : (
                                filteredVariants.map((variant) => (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        className="flex min-h-11 w-full items-center justify-between p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        onClick={() =>
                                            handleAddItem(variant.id)
                                        }
                                        disabled={isAddingItem}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-medium text-sm truncate">
                                                {variant.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {variant.product.name} · SKU:{' '}
                                                {variant.skuCode}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                {variant.primaryUnit}
                                            </Badge>
                                            {isAddingItem ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plus className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

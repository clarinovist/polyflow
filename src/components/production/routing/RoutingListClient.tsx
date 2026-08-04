'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import {
    createRoute,
    duplicateRoute,
    archiveRoute,
    publishRoute,
    setDefaultRoute,
    validateRouteAction,
} from '@/actions/production/production-routings';
import { toast } from 'sonner';

type RouteType = {
    id: string;
    code: string;
    name: string;
    version: number;
    status: string;
    isDefault: boolean;
    productVariant?: {
        skuCode: string;
        name: string;
        product?: { name: string };
    } | null;
    _count?: { steps: number; runs: number };
    steps?: { process?: { code: string; name: string } }[];
};

type VariantOption = {
    id: string;
    skuCode: string;
    name: string;
    productName: string;
    productType?: string;
    bomCount?: number;
};

export function RoutingListClient({
    initialRoutes,
}: {
    initialRoutes: RouteType[];
}) {
    const [routes] = useState(initialRoutes);
    const [showCreate, setShowCreate] = useState(false);
    const [formName, setFormName] = useState('');
    const [formVariantId, setFormVariantId] = useState('');
    const [selectedVariant, setSelectedVariant] = useState<VariantOption | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [search, setSearch] = useState('');
    const [variants, setVariants] = useState<VariantOption[]>([]);
    const [variantSearch, setVariantSearch] = useState('');
    const [routableOnly, setRoutableOnly] = useState(true);
    const [loadingVariants, setLoadingVariants] = useState(false);

    useEffect(() => {
        if (!showCreate) return;
        setLoadingVariants(true);
        const params = new URLSearchParams();
        if (variantSearch) params.set('q', variantSearch);
        params.set('type', 'FINISHED_GOOD,WIP,INTERMEDIATE');
        if (routableOnly) {
            params.set('hasBom', 'true');
            params.set('includeBomCount', 'true');
        }
        fetch('/api/products/variants?' + params.toString())
            .then((r) => r.json())
            .then((j) => {
                if (Array.isArray(j))
                    setVariants(
                        j.slice(0, 50).map(
                            (v: {
                                id: string;
                                skuCode: string;
                                name: string;
                                product?: { name: string; productType?: string };
                                bomCount?: number;
                            }) => ({
                                id: v.id,
                                skuCode: v.skuCode,
                                name: v.name,
                                productName: v.product?.name ?? '',
                                productType: v.product?.productType,
                                bomCount: v.bomCount,
                            }),
                        ),
                    );
            })
            .catch(() => {})
            .finally(() => setLoadingVariants(false));
    }, [showCreate, variantSearch, routableOnly]);

    // auto-suggest name when variant selected
    useEffect(() => {
        if (selectedVariant && !formName) {
            const nextV = routes.filter((r) => r.productVariant?.skuCode === selectedVariant.skuCode).length + 1;
            setFormName(`${selectedVariant.productName} ${selectedVariant.name} v${nextV}`.trim());
        }
    }, [selectedVariant, routes, formName]);

    const filtered = useMemo(() => {
        return routes.filter((r) => {
            if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
            if (
                search &&
                !`${r.code} ${r.name} ${r.productVariant?.skuCode} ${r.productVariant?.name} ${r.productVariant?.product?.name}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
            )
                return false;
            return true;
        });
    }, [routes, filterStatus, search]);

    const routableCount = useMemo(() => variants.length, [variants]);

    async function handleCreate() {
        if (!formName || !formVariantId) {
            toast.error('Pilih produk dan isi nama routing');
            return;
        }
        const res = await createRoute({
            name: formName,
            productVariantId: formVariantId,
            isDefault: false,
        });
        if (res.success) {
            toast.success('Routing dibuat');
            window.location.reload();
        } else {
            toast.error(res.error || 'Gagal membuat routing');
        }
    }

    async function handleDuplicate(id: string) {
        const res = await duplicateRoute(id);
        if (res.success) {
            toast.success('Routing diduplikasi');
            window.location.reload();
        } else toast.error(res.error || 'Gagal duplikasi');
    }

    async function handleArchive(id: string) {
        const res = await archiveRoute(id);
        if (res.success) {
            toast.success('Routing diarsipkan');
            window.location.reload();
        } else toast.error(res.error || 'Gagal');
    }

    async function handlePublish(id: string) {
        const res = await publishRoute(id);
        if (res.success) {
            toast.success('Routing dipublish');
            window.location.reload();
        } else toast.error(res.error || 'Gagal publish');
    }

    async function handleSetDefault(id: string) {
        const res = await setDefaultRoute(id);
        if (res.success) {
            toast.success('Default diperbarui');
            window.location.reload();
        } else toast.error(res.error || 'Gagal');
    }

    async function handleValidate(id: string) {
        const res = await validateRouteAction(id);
        if (res.success) {
            const issues =
                (
                    res.data as {
                        issues: { severity: string; message: string }[];
                    }
                )?.issues ?? [];
            if (issues.length === 0) toast.success('Routing valid — siap publish');
            else
                toast.warning(
                    `${issues.length} issue: ${issues.map((i) => i.message).join('; ')}`,
                );
        } else toast.error(res.error || 'Gagal validasi');
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-end justify-between">
                <div className="flex gap-2 items-center flex-wrap">
                    <Input
                        placeholder="Cari nama routing / sku / produk"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-64"
                    />
                    <Select
                        value={filterStatus}
                        onValueChange={setFilterStatus}
                    >
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua status</SelectItem>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                            <SelectItem value="ACTIVE">Published</SelectItem>
                            <SelectItem value="ARCHIVED">Arsip</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/production/routings/processes">Kelola Proses</Link>
                    </Button>
                    <Button onClick={() => setShowCreate(!showCreate)} size="sm">
                        {showCreate ? 'Tutup' : 'Buat Routing Baru'}
                    </Button>
                </div>
            </div>

            {showCreate && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Buat Routing Baru</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Routing hanya untuk produk yang punya BoM aktif (bisa diproduksi). Pilih produk → sistem sarankan nama → simpan sebagai Draft.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label>Produk Akhir / WIP</Label>
                                <Tabs value={routableOnly ? 'routable' : 'all'} onValueChange={(v) => setRoutableOnly(v === 'routable')}>
                                    <TabsList className="h-8">
                                        <TabsTrigger value="routable" className="text-xs">Punya BoM ({routableCount})</TabsTrigger>
                                        <TabsTrigger value="all" className="text-xs">Semua FG/WIP</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            {selectedVariant && (
                                <div className="rounded border bg-muted/50 p-3 text-sm flex justify-between items-start gap-2">
                                    <div>
                                        <div className="font-semibold">{selectedVariant.productName} — {selectedVariant.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                                            <Badge variant="outline" className="text-[10px] font-mono">{selectedVariant.skuCode}</Badge>
                                            {selectedVariant.productType && <span className="text-[10px]">{selectedVariant.productType}</span>}
                                            {selectedVariant.bomCount !== undefined && <span className="text-[10px]">{selectedVariant.bomCount} BoM</span>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedVariant(null); setFormVariantId(''); setFormName(''); }}>Ganti</Button>
                                </div>
                            )}

                            <Input
                                value={variantSearch}
                                onChange={(e) =>
                                    setVariantSearch(e.target.value)
                                }
                                placeholder="Cari sku atau nama produk..."
                                className="flex-1"
                            />

                            {loadingVariants && <div className="text-xs text-muted-foreground py-2">Memuat...</div>}

                            {!selectedVariant && variants.length > 0 && (
                                <div className="border rounded max-h-64 overflow-auto divide-y">
                                    {variants.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => {
                                                setFormVariantId(v.id);
                                                setSelectedVariant(v);
                                            }}
                                            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex justify-between gap-2 ${formVariantId === v.id ? 'bg-muted' : ''}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium">{v.productName} — {v.name}</div>
                                                <div className="text-[11px] text-muted-foreground flex gap-1.5 mt-0.5 flex-wrap items-center">
                                                    <span className="font-mono">{v.skuCode}</span>
                                                    {v.productType && <Badge variant="outline" className="text-[10px] h-4 px-1">{v.productType}</Badge>}
                                                    {v.bomCount !== undefined && <span>{v.bomCount} BoM</span>}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {!loadingVariants && variants.length === 0 && showCreate && (
                                <div className="text-xs text-muted-foreground p-3 border rounded text-center">
                                    {routableOnly
                                        ? 'Tidak ada produk dengan BoM aktif. Buat BoM dulu di menu BOM, atau ubah tab ke "Semua FG/WIP".'
                                        : 'Tidak ada produk ditemukan. Coba kata kunci lain.'}
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label>Nama Routing</Label>
                            <Input
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="Contoh: Rafia Merah Super v1"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Nama bebas. Otomatis disarankan dari produk yang dipilih.
                            </p>
                        </div>

                        <Button onClick={handleCreate} disabled={!formVariantId || !formName.trim()}>
                            Simpan Draft
                        </Button>
                    </CardContent>
                </Card>
            )}

            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg">🧭</div>
                        <div className="space-y-1">
                            <div className="font-semibold">Belum ada routing</div>
                            <div className="text-sm text-muted-foreground max-w-lg mx-auto">
                                Routing menjelaskan urutan proses (mis. Mix → Extrude → Rewind → Pack) untuk tiap varian produk jadi.
                                Hanya varian yang <strong>punya BoM aktif</strong> yang bisa dibuat routing. Tanpa routing, BoM tetap bisa dipakai untuk SPK manual.
                            </div>
                        </div>
                        {!showCreate && (
                            <div className="flex gap-2 justify-center pt-2">
                                <Button size="sm" onClick={() => setShowCreate(true)}>Buat Routing Pertama</Button>
                                <Button size="sm" variant="outline" asChild><Link href="/production/boms">Lihat BoM</Link></Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {filtered.map((r) => (
                        <Card key={r.id} className="overflow-hidden">
                            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="space-y-1.5 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link
                                            href={`/production/routings/${r.id}`}
                                            className="font-semibold hover:underline truncate"
                                        >
                                            {r.name}
                                        </Link>
                                        <Badge
                                            variant={
                                                r.status === 'ACTIVE'
                                                    ? 'default'
                                                    : r.status === 'DRAFT'
                                                      ? 'secondary'
                                                      : 'outline'
                                            }
                                            className="shrink-0"
                                        >
                                            {r.status === 'ACTIVE' ? 'Published' : r.status}
                                        </Badge>
                                        {r.isDefault && (
                                            <Badge variant="outline" className="shrink-0">
                                                Default
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            v{r.version}
                                        </span>
                                    </div>
                                    <div className="text-sm flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.productVariant?.skuCode ?? '-'}</span>
                                        <span className="truncate">{r.productVariant?.product?.name} {r.productVariant?.name}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground flex gap-2 flex-wrap items-center">
                                        <span>{r._count?.steps ?? r.steps?.length ?? 0} tahap</span>
                                        <span>·</span>
                                        <span>{r._count?.runs ?? 0} run</span>
                                        {r.steps && r.steps.length > 0 && (
                                            <>
                                                <span>·</span>
                                                <span className="flex gap-1 flex-wrap">
                                                    {r.steps.slice(0, 6).map((s, idx) => (
                                                        <Badge
                                                            key={idx}
                                                            variant="outline"
                                                            className="text-[10px] h-4"
                                                        >
                                                            {s.process?.code ?? '?'}
                                                        </Badge>
                                                    ))}
                                                    {r.steps.length > 6 && <span className="text-[10px]">+{r.steps.length - 6}</span>}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 flex-wrap shrink-0">
                                    {r.status === 'DRAFT' && (
                                        <>
                                            <Button
                                                size="sm"
                                                onClick={() => handleValidate(r.id)}
                                                variant="outline"
                                                className="h-8"
                                            >
                                                Validasi
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handlePublish(r.id)}
                                                className="h-8"
                                            >
                                                Publish
                                            </Button>
                                        </>
                                    )}
                                    {r.status === 'ACTIVE' && !r.isDefault && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                handleSetDefault(r.id)
                                            }
                                            className="h-8"
                                        >
                                            Jadikan Default
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDuplicate(r.id)}
                                        className="h-8"
                                    >
                                        Duplikat
                                    </Button>
                                    {r.status !== 'ARCHIVED' && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleArchive(r.id)}
                                            className="h-8"
                                        >
                                            Arsip
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        asChild
                                        variant="secondary"
                                        className="h-8"
                                    >
                                        <Link
                                            href={`/production/routings/${r.id}`}
                                        >
                                            Buka →
                                        </Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

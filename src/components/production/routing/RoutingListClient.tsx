'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [search, setSearch] = useState('');
    const [variants, setVariants] = useState<VariantOption[]>([]);
    const [variantSearch, setVariantSearch] = useState('');

    useEffect(() => {
        if (!showCreate) return;
        fetch('/api/products/variants?q=' + encodeURIComponent(variantSearch) + '&type=FINISHED_GOOD,WIP')
            .then((r) => r.json())
            .then((j) => {
                if (Array.isArray(j))
                    setVariants(
                        j
                            .slice(0, 30)
                            .map(
                                (v: {
                                    id: string;
                                    skuCode: string;
                                    name: string;
                                    product?: { name: string };
                                }) => ({
                                    id: v.id,
                                    skuCode: v.skuCode,
                                    name: v.name,
                                    productName: v.product?.name ?? '',
                                }),
                            ),
                    );
            })
            .catch(() => {});
    }, [showCreate, variantSearch]);

    const filtered = routes.filter((r) => {
        if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
        if (
            search &&
            !`${r.code} ${r.name} ${r.productVariant?.skuCode}`
                .toLowerCase()
                .includes(search.toLowerCase())
        )
            return false;
        return true;
    });

    async function handleCreate() {
        if (!formName || !formVariantId) {
            toast.error('Nama dan ProductVariantId wajib');
            return;
        }
        const res = await createRoute({
            name: formName,
            productVariantId: formVariantId,
            isDefault: false,
        });
        if (res.success) {
            toast.success('Route dibuat');
            window.location.reload();
        } else {
            toast.error(res.error || 'Gagal');
        }
    }

    async function handleDuplicate(id: string) {
        const res = await duplicateRoute(id);
        if (res.success) {
            toast.success('Route diduplicate');
            window.location.reload();
        } else toast.error(res.error || 'Gagal duplicate');
    }

    async function handleArchive(id: string) {
        const res = await archiveRoute(id);
        if (res.success) {
            toast.success('Route di-archive');
            window.location.reload();
        } else toast.error(res.error || 'Gagal');
    }

    async function handlePublish(id: string) {
        const res = await publishRoute(id);
        if (res.success) {
            toast.success('Route dipublish');
            window.location.reload();
        } else toast.error(res.error || 'Gagal publish');
    }

    async function handleSetDefault(id: string) {
        const res = await setDefaultRoute(id);
        if (res.success) {
            toast.success('Default route');
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
            if (issues.length === 0) toast.success('Route valid');
            else
                toast.warning(
                    `${issues.length} issue: ${issues.map((i) => i.message).join('; ')}`,
                );
        } else toast.error(res.error || 'Gagal');
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-end">
                <div className="flex gap-2 items-center">
                    <Input
                        placeholder="Cari code/nama/sku"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-52"
                    />
                    <Select
                        value={filterStatus}
                        onValueChange={setFilterStatus}
                    >
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua status</SelectItem>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="ARCHIVED">Archived</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? 'Tutup' : 'Buat Routing'}
                </Button>
            </div>

            {showCreate && (
                <Card>
                    <CardHeader>
                        <CardTitle>Buat Routing Baru</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-1.5">
                            <Label>Produk Akhir (FG/WIP)</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={variantSearch}
                                    onChange={(e) =>
                                        setVariantSearch(e.target.value)
                                    }
                                    placeholder="Cari sku/nama produk"
                                    className="flex-1"
                                />
                                {formVariantId && (
                                    <span className="text-xs py-2">
                                        {formVariantId.slice(0, 8)}
                                    </span>
                                )}
                            </div>
                            {variants.length > 0 && (
                                <div className="mt-2 border rounded max-h-48 overflow-auto divide-y">
                                    {variants.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => {
                                                setFormVariantId(v.id);
                                                setVariantSearch(
                                                    `${v.skuCode} ${v.name}`,
                                                );
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${formVariantId === v.id ? 'bg-muted font-semibold' : ''}`}
                                        >
                                            <span className="font-mono text-xs">
                                                {v.skuCode}
                                            </span>{' '}
                                            {v.productName} {v.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-1">
                                <Input
                                    value={formVariantId}
                                    onChange={(e) =>
                                        setFormVariantId(e.target.value)
                                    }
                                    placeholder="Atau paste UUID variant (fallback)"
                                    className="text-xs font-mono"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nama Routing</Label>
                            <Input
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="Contoh: Sedotan Steril v1"
                            />
                        </div>
                        <Button onClick={handleCreate}>Simpan Draft</Button>
                    </CardContent>
                </Card>
            )}

            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        Belum ada routing. BOM existing tetap dapat digunakan
                        untuk SPK manual.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filtered.map((r) => (
                        <Card key={r.id} className="overflow-hidden">
                            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link
                                            href={`/production/routings/${r.id}`}
                                            className="font-semibold hover:underline"
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
                                        >
                                            {r.status}
                                        </Badge>
                                        {r.isDefault && (
                                            <Badge variant="outline">
                                                Default
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            v{r.version} · {r.code}
                                        </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {r.productVariant?.product?.name ?? ''}{' '}
                                        {r.productVariant?.name ?? ''} (
                                        {r.productVariant?.skuCode ?? '-'}) ·{' '}
                                        {r._count?.steps ??
                                            r.steps?.length ??
                                            0}{' '}
                                        tahap · {r._count?.runs ?? 0} runs
                                    </div>
                                    {r.steps && r.steps.length > 0 && (
                                        <div className="flex gap-1 flex-wrap">
                                            {r.steps.map((s, idx) => (
                                                <Badge
                                                    key={idx}
                                                    variant="outline"
                                                    className="text-xs"
                                                >
                                                    {s.process?.code ?? '?'}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                    {r.status === 'DRAFT' && (
                                        <Button
                                            size="sm"
                                            onClick={() => handleValidate(r.id)}
                                            variant="outline"
                                        >
                                            Validasi
                                        </Button>
                                    )}
                                    {r.status === 'DRAFT' && (
                                        <Button
                                            size="sm"
                                            onClick={() => handlePublish(r.id)}
                                        >
                                            Publish
                                        </Button>
                                    )}
                                    {r.status === 'ACTIVE' && !r.isDefault && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                handleSetDefault(r.id)
                                            }
                                        >
                                            Jadikan Default
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDuplicate(r.id)}
                                    >
                                        Duplicate
                                    </Button>
                                    {r.status !== 'ARCHIVED' && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleArchive(r.id)}
                                        >
                                            Archive
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        asChild
                                        variant="secondary"
                                    >
                                        <Link
                                            href={`/production/routings/${r.id}`}
                                        >
                                            Buka
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

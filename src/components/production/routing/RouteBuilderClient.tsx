'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
    addRouteStep,
    updateRouteStep,
    deleteRouteStep,
    reorderRouteSteps,
    validateRouteAction,
    publishRoute,
    archiveRoute,
} from '@/actions/production/production-routings';
import { toast } from 'sonner';
import { RouteFlowChain } from '@/components/production/routing/RouteFlowChain';

type RouteType = {
    id: string;
    code: string;
    name: string;
    version: number;
    status: string;
    isDefault: boolean;
    productVariantId: string;
    productVariant?: {
        skuCode: string;
        name: string;
        product?: { name: string };
    };
    steps: Array<{
        id: string;
        sequence: number;
        stepCode: string;
        label: string;
        processId: string;
        process: {
            id: string;
            code: string;
            name: string;
            requiresMachine: boolean;
        };
        bomId: string;
        bom: {
            id: string;
            name: string;
            productVariantId: string;
            productVariant?: {
                skuCode?: string;
                name?: string;
                product?: { name?: string };
            };
            outputQuantity?: number | string;
        };
        materialSourceLocationId: string | null;
        outputLocationId: string | null;
        materialSourceLocation?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        outputLocation?: { id: string; name: string; slug: string } | null;
        requiresQualityGate: boolean;
        allowsPartialHandoff: boolean;
    }>;
};

type NewStepForm = {
    stepCode: string;
    label: string;
    processId: string;
    bomId: string;
    materialSourceLocationId: string;
    outputLocationId: string;
    allowsPartialHandoff: boolean;
    requiresQualityGate: boolean;
};

type Option = {
    id: string;
    name: string;
    code?: string;
    skuCode?: string;
    slug?: string;
    subtitle?: string;
    isChainMatch?: boolean;
};

export function RouteBuilderClient({
    initialRoute,
}: {
    initialRoute: RouteType;
}) {
    const [route] = useState(initialRoute);
    const [form, setForm] = useState<NewStepForm>({
        stepCode: '',
        label: '',
        processId: '',
        bomId: '',
        materialSourceLocationId: '',
        outputLocationId: '',
        allowsPartialHandoff: false,
        requiresQualityGate: false,
    });
    const [validationIssues, setValidationIssues] = useState<
        Array<{
            code: string;
            severity: string;
            message: string;
            stepCode?: string;
            field?: string;
        }>
    >([]);
    const [processes, setProcesses] = useState<Option[]>([]);
    const [boms, setBoms] = useState<Option[]>([]);
    const [srcLocs, setSrcLocs] = useState<Option[]>([]);
    const [outLocs, setOutLocs] = useState<Option[]>([]);
    const [procSearch, setProcSearch] = useState('');
    const [bomSearch, setBomSearch] = useState('');
    const [srcLocSearch, setSrcLocSearch] = useState('');
    const [outLocSearch, setOutLocSearch] = useState('');
    const [selectedProcess, setSelectedProcess] = useState<Option | null>(null);
    const [selectedBom, setSelectedBom] = useState<Option | null>(null);
    const [selectedSrcLoc, setSelectedSrcLoc] = useState<Option | null>(null);
    const [selectedOutLoc, setSelectedOutLoc] = useState<Option | null>(null);
    // G3: id of the step currently being edited, or null when the panel is
    // in "add new step" mode. RouteBuilderClient previously had no way to
    // fix a typo without deleting the step and re-adding it (which also
    // renormalizes every later sequence).
    const [editingStepId, setEditingStepId] = useState<string | null>(null);

    const isDraft = route.status === 'DRAFT';
    const sortedSteps = useMemo(
        () => [...route.steps].sort((a, b) => a.sequence - b.sequence),
        [route.steps],
    );
    const lastOutputVariantId = useMemo(
        () =>
            sortedSteps[sortedSteps.length - 1]?.bom?.productVariantId ?? null,
        [sortedSteps],
    );
    // Sequence the panel currently targets — the step being edited, or the
    // next append position when adding. Used only to phrase the "Ambil bahan
    // dari" copy accurately (first step has no predecessor to inherit from).
    const targetSequence = editingStepId
        ? (sortedSteps.find((s) => s.id === editingStepId)?.sequence ?? 0)
        : sortedSteps.length;
    const isFirstStepTarget = targetSequence === 0;

    useEffect(() => {
        fetch('/api/production/processes?q=' + encodeURIComponent(procSearch))
            .then((r) => r.json())
            .then((j) => {
                if (Array.isArray(j))
                    setProcesses(
                        j
                            .slice(0, 30)
                            .map(
                                (p: {
                                    id: string;
                                    name: string;
                                    code: string;
                                    requiresMachine?: boolean;
                                }) => ({
                                    id: p.id,
                                    name: p.name,
                                    code: p.code,
                                    subtitle: p.requiresMachine
                                        ? 'butuh mesin'
                                        : undefined,
                                }),
                            ),
                    );
            })
            .catch(() => {});
    }, [procSearch]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (bomSearch) params.set('q', bomSearch);
        if (lastOutputVariantId)
            params.set('continuesFromVariantId', lastOutputVariantId);
        fetch('/api/boms?' + params.toString())
            .then((r) => r.json())
            .then((j) => {
                const raw: Array<{
                    id: string;
                    name: string;
                    productVariant?: {
                        skuCode?: string;
                        name?: string;
                        product?: { name?: string };
                    };
                    isDefault?: boolean;
                    isChainMatch?: boolean;
                    chainMatch?: boolean;
                }> = Array.isArray(j)
                    ? j
                    : j && Array.isArray(j.data)
                      ? j.data
                      : [];
                setBoms(
                    raw.slice(0, 40).map((b) => ({
                        id: b.id,
                        name: b.name,
                        skuCode: b.productVariant?.skuCode ?? '',
                        subtitle:
                            `${b.productVariant?.product?.name ?? ''} ${b.productVariant?.name ?? ''}`.trim() +
                            (b.isDefault ? ' • default' : ''),
                        isChainMatch:
                            !!(
                                b as {
                                    isChainMatch?: boolean;
                                    chainMatch?: boolean;
                                }
                            ).isChainMatch ||
                            !!(b as { chainMatch?: boolean }).chainMatch,
                    })),
                );
            })
            .catch(() => {});
    }, [bomSearch, lastOutputVariantId]);

    useEffect(() => {
        fetch('/api/locations?q=' + encodeURIComponent(srcLocSearch))
            .then((r) => r.json())
            .then((j) => {
                if (Array.isArray(j))
                    setSrcLocs(
                        j
                            .slice(0, 30)
                            .map(
                                (l: {
                                    id: string;
                                    name: string;
                                    slug: string;
                                }) => ({
                                    id: l.id,
                                    name: l.name,
                                    slug: l.slug,
                                }),
                            ),
                    );
                else if (j && Array.isArray(j.data))
                    setSrcLocs(
                        j.data
                            .slice(0, 30)
                            .map(
                                (l: {
                                    id: string;
                                    name: string;
                                    slug: string;
                                }) => ({
                                    id: l.id,
                                    name: l.name,
                                    slug: l.slug,
                                }),
                            ),
                    );
            })
            .catch(() => {});
    }, [srcLocSearch]);

    useEffect(() => {
        fetch('/api/locations?q=' + encodeURIComponent(outLocSearch))
            .then((r) => r.json())
            .then((j) => {
                if (Array.isArray(j))
                    setOutLocs(
                        j
                            .slice(0, 30)
                            .map(
                                (l: {
                                    id: string;
                                    name: string;
                                    slug: string;
                                }) => ({
                                    id: l.id,
                                    name: l.name,
                                    slug: l.slug,
                                }),
                            ),
                    );
                else if (j && Array.isArray(j.data))
                    setOutLocs(
                        j.data
                            .slice(0, 30)
                            .map(
                                (l: {
                                    id: string;
                                    name: string;
                                    slug: string;
                                }) => ({
                                    id: l.id,
                                    name: l.name,
                                    slug: l.slug,
                                }),
                            ),
                    );
            })
            .catch(() => {});
    }, [outLocSearch]);

    function resetForm() {
        setForm({
            stepCode: '',
            label: '',
            processId: '',
            bomId: '',
            materialSourceLocationId: '',
            outputLocationId: '',
            allowsPartialHandoff: false,
            requiresQualityGate: false,
        });
        setSelectedProcess(null);
        setSelectedBom(null);
        setSelectedSrcLoc(null);
        setSelectedOutLoc(null);
    }

    function handleStartEdit(step: RouteType['steps'][number]) {
        setEditingStepId(step.id);
        setForm({
            stepCode: step.stepCode,
            label: step.label,
            processId: step.processId,
            bomId: step.bomId,
            materialSourceLocationId: step.materialSourceLocationId ?? '',
            outputLocationId: step.outputLocationId ?? '',
            allowsPartialHandoff: step.allowsPartialHandoff,
            requiresQualityGate: step.requiresQualityGate,
        });
        setSelectedProcess({
            id: step.process.id,
            name: step.process.name,
            code: step.process.code,
        });
        const bomPv = (
            step.bom as unknown as {
                productVariant?: {
                    skuCode?: string;
                    name?: string;
                    product?: { name?: string };
                };
            }
        )?.productVariant;
        setSelectedBom({
            id: step.bom.id,
            name: step.bom.name,
            skuCode: bomPv?.skuCode ?? '',
            subtitle:
                `${bomPv?.product?.name ?? ''} ${bomPv?.name ?? ''}`.trim(),
        });
        setSelectedSrcLoc(
            step.materialSourceLocation
                ? {
                      id: step.materialSourceLocation.id,
                      name: step.materialSourceLocation.name,
                      slug: step.materialSourceLocation.slug,
                  }
                : null,
        );
        setSelectedOutLoc(
            step.outputLocation
                ? {
                      id: step.outputLocation.id,
                      name: step.outputLocation.name,
                      slug: step.outputLocation.slug,
                  }
                : null,
        );
    }

    function handleCancelEdit() {
        setEditingStepId(null);
        resetForm();
    }

    async function handleSaveStep() {
        if (!form.stepCode || !form.label || !form.processId || !form.bomId) {
            toast.error('Lengkapi: kode tahap, label, process, dan BOM');
            return;
        }
        if (!form.outputLocationId) {
            toast.error('Output location wajib — pilih lokasi output');
            return;
        }

        if (editingStepId) {
            const res = await updateRouteStep({
                id: editingStepId,
                stepCode: form.stepCode.toUpperCase(),
                label: form.label,
                processId: form.processId,
                bomId: form.bomId,
                materialSourceLocationId: form.materialSourceLocationId || null,
                outputLocationId: form.outputLocationId || null,
                allowsPartialHandoff: form.allowsPartialHandoff,
                requiresQualityGate: form.requiresQualityGate,
            });
            if (res.success) {
                toast.success('Tahap diubah');
                window.location.reload();
            } else toast.error(res.error || 'Gagal ubah tahap');
            return;
        }

        const res = await addRouteStep({
            routeId: route.id,
            stepCode: form.stepCode.toUpperCase(),
            label: form.label,
            processId: form.processId,
            bomId: form.bomId,
            materialSourceLocationId: form.materialSourceLocationId || null,
            outputLocationId: form.outputLocationId || null,
            allowsPartialHandoff: form.allowsPartialHandoff,
            requiresQualityGate: form.requiresQualityGate,
        });
        if (res.success) {
            toast.success('Tahap ditambah');
            window.location.reload();
        } else toast.error(res.error || 'Gagal tambah tahap');
    }

    async function handleDeleteStep(stepId: string) {
        if (!confirm('Hapus tahap ini? Chain output/input bisa putus.')) return;
        const res = await deleteRouteStep(stepId);
        if (res.success) {
            toast.success('Tahap dihapus');
            window.location.reload();
        } else toast.error(res.error || 'Gagal hapus');
    }

    async function handleMove(idx: number, dir: -1 | 1) {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= sortedSteps.length) return;
        const ordered = [...sortedSteps];
        const tmp = ordered[idx];
        ordered[idx] = ordered[newIdx];
        ordered[newIdx] = tmp;
        const orderedIds = ordered.map((s) => s.id);
        const res = await reorderRouteSteps({ routeId: route.id, orderedIds });
        if (res.success) {
            toast.success('Urutan diubah');
            window.location.reload();
        } else toast.error(res.error || 'Gagal reorder');
    }

    async function handleValidate() {
        const res = await validateRouteAction(route.id);
        if (res.success) {
            const v = res.data as {
                valid: boolean;
                issues: typeof validationIssues;
            };
            setValidationIssues(v.issues);
            if (v.valid) toast.success('Routing valid — siap publish');
            else
                toast.warning(
                    `${v.issues.filter((i) => i.severity === 'BLOCKING').length} blocking issue — cek di bawah`,
                );
        } else toast.error(res.error || 'Gagal validasi');
    }

    async function handlePublish() {
        const res = await publishRoute(route.id);
        if (res.success) {
            toast.success('Published');
            window.location.reload();
        } else toast.error(res.error || 'Gagal publish');
    }

    async function handleArchive() {
        if (
            !confirm(
                'Arsipkan routing ini? Run baru tidak bisa pakai routing ini.',
            )
        )
            return;
        const res = await archiveRoute(route.id);
        if (res.success) {
            toast.success('Diarsipkan');
            window.location.reload();
        } else toast.error(res.error || 'Gagal arsip');
    }

    const blockingIssues = validationIssues.filter(
        (i) => i.severity === 'BLOCKING',
    );
    const warningIssues = validationIssues.filter(
        (i) => i.severity === 'WARNING',
    );

    const finalVariantLabel =
        `${route.productVariant?.product?.name ?? ''} ${route.productVariant?.name ?? ''}`.trim() +
        ` (${route.productVariant?.skuCode ?? '-'})`;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/production/routings" className="hover:underline">
                    Routing Produksi
                </Link>
                <span>/</span>
                <span className="font-semibold text-foreground">
                    {route.name}
                </span>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <div className="space-y-1">
                        <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                            {route.name}
                            <Badge
                                variant={
                                    route.status === 'ACTIVE'
                                        ? 'default'
                                        : route.status === 'DRAFT'
                                          ? 'secondary'
                                          : 'outline'
                                }
                            >
                                {route.status === 'ACTIVE'
                                    ? 'Published'
                                    : route.status}
                            </Badge>
                            {route.isDefault && (
                                <Badge variant="outline">Default</Badge>
                            )}
                            <span className="text-xs font-normal text-muted-foreground">
                                v{route.version} · {route.code}
                            </span>
                        </CardTitle>
                        <CardDescription>
                            Produk akhir: <strong>{finalVariantLabel}</strong>.
                            Urutan tahap harus nyambung: output tahap N jadi
                            input BoM tahap N+1. Tahap terakhir wajib
                            menghasilkan {route.productVariant?.skuCode}.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleValidate}
                        >
                            Validasi
                        </Button>
                        {isDraft && (
                            <Button size="sm" onClick={handlePublish}>
                                Publish
                            </Button>
                        )}
                        {route.status !== 'ARCHIVED' && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleArchive}
                            >
                                Arsipkan
                            </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/production/routings/processes">
                                Kelola Proses
                            </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/production/boms">Lihat BoM</Link>
                        </Button>
                    </div>
                    {validationIssues.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {blockingIssues.length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-red-700">
                                        Blocking ({blockingIssues.length}) —
                                        publish dilarang:
                                    </div>
                                    <div className="space-y-1 mt-1.5">
                                        {blockingIssues.map((iss, i) => (
                                            <div
                                                key={i}
                                                className="text-xs p-2.5 rounded bg-red-50 text-red-800 border border-red-200 flex gap-2 items-start"
                                            >
                                                <span className="font-mono text-[10px] shrink-0 pt-0.5">
                                                    {iss.code}
                                                </span>
                                                <span className="flex-1">
                                                    {iss.message}
                                                </span>
                                                {iss.stepCode && (
                                                    <Badge
                                                        variant="outline"
                                                        className="ml-auto text-[10px] shrink-0"
                                                    >
                                                        {iss.stepCode}
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {warningIssues.length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-amber-700">
                                        Peringatan ({warningIssues.length}):
                                    </div>
                                    <div className="space-y-1 mt-1.5">
                                        {warningIssues.map((iss, i) => (
                                            <div
                                                key={i}
                                                className="text-xs p-2.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                                            >
                                                {iss.code}: {iss.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {blockingIssues.length === 0 && (
                                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2.5">
                                    ✓ Valid — siap publish
                                </div>
                            )}
                        </div>
                    )}
                    {isDraft && route.steps.length === 0 && (
                        <div className="text-xs p-3 rounded bg-blue-50 border border-blue-200 text-blue-800">
                            <strong>Cara isi:</strong> Tambah tahap di panel
                            kanan. 1) Pilih <em>Process</em> (REWINDING, BALING,
                            dsb) → 2) Pilih <em>BOM</em> yang outputnya =
                            WIP/Intermediate tahap ini → 3) Pilih{' '}
                            <em>Source lokasi</em> (ambil bahan) &{' '}
                            <em>Output lokasi</em> (hasil tahap ditaruh) →
                            Simpan. Ulang sampai tahap terakhir BOM-nya
                            menghasilkan{' '}
                            <strong>{route.productVariant?.skuCode}</strong>.
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                    <h3 className="font-semibold text-sm">
                        Urutan Tahap ({sortedSteps.length})
                    </h3>
                    {sortedSteps.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-8 border rounded text-center bg-muted/20">
                            Belum ada tahap. Tahap = satu proses produksi + satu
                            BOM + lokasi.
                            <br />
                            Contoh: Step 1 = MIX (BOM Campuran Rafia Hijau
                            Tampar → stok WIP), Step 2 = EXTRUDE (BOM Rafia
                            Hijau Super → FG).
                            <br />
                            Output location wajib untuk publish.
                        </div>
                    ) : (
                        sortedSteps.map((step, idx) => {
                            const hasIssue = validationIssues.some(
                                (iss) =>
                                    iss.stepCode === step.stepCode &&
                                    iss.severity === 'BLOCKING',
                            );
                            const bomPv = (
                                step.bom as unknown as {
                                    productVariant?: {
                                        skuCode?: string;
                                        name?: string;
                                        product?: { name?: string };
                                    };
                                }
                            )?.productVariant;
                            return (
                                <Card
                                    key={step.id}
                                    className={
                                        hasIssue
                                            ? 'border-red-300 bg-red-50/30'
                                            : ''
                                    }
                                >
                                    <CardContent className="p-3.5 flex gap-3">
                                        <div className="font-bold text-lg w-7 shrink-0 text-muted-foreground">
                                            #{idx + 1}
                                        </div>
                                        <div className="flex-1 space-y-2 min-w-0">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <span className="font-semibold truncate">
                                                    {step.label}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[11px] font-mono shrink-0"
                                                >
                                                    {step.stepCode}
                                                </Badge>
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[11px] shrink-0"
                                                >
                                                    {step.process.code}
                                                </Badge>
                                                {step.process
                                                    .requiresMachine && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] shrink-0"
                                                    >
                                                        butuh mesin
                                                    </Badge>
                                                )}
                                                {hasIssue && (
                                                    <Badge
                                                        variant="destructive"
                                                        className="text-[10px] shrink-0"
                                                    >
                                                        issue
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-xs space-y-1">
                                                <div className="flex gap-1.5 flex-wrap">
                                                    <span className="text-muted-foreground">
                                                        Proses:
                                                    </span>{' '}
                                                    <span className="font-medium">
                                                        {step.process.name}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        ·
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        BOM:
                                                    </span>
                                                    <span className="font-medium truncate">
                                                        {step.bom.name}
                                                    </span>
                                                    {bomPv && (
                                                        <span className="text-muted-foreground">
                                                            ({bomPv.skuCode} —{' '}
                                                            {bomPv.product
                                                                ?.name ??
                                                                ''}{' '}
                                                            {bomPv.name ?? ''})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-1.5 flex-wrap items-center">
                                                    <span className="text-muted-foreground">
                                                        Ambil dari:
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[11px] font-normal"
                                                    >
                                                        {step
                                                            .materialSourceLocation
                                                            ?.name ??
                                                            '— (stok umum)'}
                                                    </Badge>
                                                    <span>→</span>
                                                    <span className="text-muted-foreground">
                                                        Hasil ke:
                                                    </span>
                                                    {step.outputLocation ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[11px]"
                                                        >
                                                            {
                                                                step
                                                                    .outputLocation
                                                                    .name
                                                            }
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-red-600 font-semibold text-[11px] border border-red-200 rounded px-1.5 py-0.5 bg-red-50">
                                                            Wajib pilih output
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {step.allowsPartialHandoff && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px]"
                                                        >
                                                            Boleh estafet
                                                            sebagian
                                                        </Badge>
                                                    )}
                                                    {step.requiresQualityGate && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px]"
                                                        >
                                                            Butuh QC
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {isDraft && (
                                            <div className="flex flex-col gap-1 shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs"
                                                    disabled={idx === 0}
                                                    onClick={() =>
                                                        handleMove(idx, -1)
                                                    }
                                                >
                                                    ↑
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs"
                                                    disabled={
                                                        idx ===
                                                        sortedSteps.length - 1
                                                    }
                                                    onClick={() =>
                                                        handleMove(idx, 1)
                                                    }
                                                >
                                                    ↓
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs"
                                                    onClick={() =>
                                                        handleStartEdit(step)
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs text-red-600"
                                                    onClick={() =>
                                                        handleDeleteStep(
                                                            step.id,
                                                        )
                                                    }
                                                >
                                                    Hapus
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}

                    {sortedSteps.length > 0 && (
                        <>
                            <RouteFlowChain
                                steps={sortedSteps.map((s) => {
                                    const bomPv = (
                                        s.bom as unknown as {
                                            productVariant?: {
                                                skuCode?: string;
                                                name?: string;
                                            };
                                        }
                                    )?.productVariant;
                                    return {
                                        label: s.label,
                                        stepCode: s.stepCode,
                                        processCode: s.process.code,
                                        outputSkuLabel:
                                            bomPv?.skuCode ?? s.bom.name,
                                        outputLocationName:
                                            s.outputLocation?.name ?? null,
                                    };
                                })}
                            />
                            <div className="text-[11px] text-muted-foreground px-1">
                                Final harus: {route.productVariant?.skuCode} —{' '}
                                {finalVariantLabel}
                            </div>
                        </>
                    )}
                </div>

                {isDraft && (
                    <div className="space-y-4">
                        <Card className="sticky top-4">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm">
                                    {editingStepId
                                        ? 'Ubah Tahap'
                                        : 'Tambah Tahap'}
                                </CardTitle>
                                <CardDescription className="text-[11px]">
                                    Tahap = Proses + BoM output + Lokasi. Output
                                    lokasi wajib.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">
                                            Kode Tahap (huruf besar, _)
                                        </Label>
                                        <Input
                                            value={form.stepCode}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    stepCode:
                                                        e.target.value.toUpperCase(),
                                                })
                                            }
                                            placeholder="MIX, EXTRUDE, REWIND, BALING"
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">
                                            Nama Tahap
                                        </Label>
                                        <Input
                                            value={form.label}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    label: e.target.value,
                                                })
                                            }
                                            placeholder="Mix Bahan / Extrusi Sedotan"
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Proses</Label>
                                    {selectedProcess && (
                                        <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between items-center">
                                            <span>
                                                <strong>
                                                    {selectedProcess.code}
                                                </strong>{' '}
                                                — {selectedProcess.name}{' '}
                                                {selectedProcess.subtitle
                                                    ? `(${selectedProcess.subtitle})`
                                                    : ''}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[11px]"
                                                onClick={() => {
                                                    setSelectedProcess(null);
                                                    setForm({
                                                        ...form,
                                                        processId: '',
                                                    });
                                                }}
                                            >
                                                Ganti
                                            </Button>
                                        </div>
                                    )}
                                    <Input
                                        value={procSearch}
                                        onChange={(e) =>
                                            setProcSearch(e.target.value)
                                        }
                                        placeholder="Cari proses..."
                                        className="text-xs h-8"
                                    />
                                    {!selectedProcess && (
                                        <div className="border rounded max-h-36 overflow-auto divide-y">
                                            {processes.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm({
                                                            ...form,
                                                            processId: p.id,
                                                        });
                                                        setSelectedProcess(p);
                                                    }}
                                                    className={`w-full text-left px-2.5 py-2 text-xs hover:bg-muted flex justify-between gap-2 ${form.processId === p.id ? 'bg-muted font-medium' : ''}`}
                                                >
                                                    <span>
                                                        <span className="font-mono font-semibold">
                                                            {p.code}
                                                        </span>{' '}
                                                        — {p.name}
                                                    </span>
                                                    {p.subtitle && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {p.subtitle}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                            {processes.length === 0 && (
                                                <div className="text-[11px] text-muted-foreground p-2 text-center">
                                                    Tidak ada proses. Tambah di
                                                    Kelola Proses.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        BoM — output tahap ini{' '}
                                        {lastOutputVariantId ? (
                                            <span className="font-normal text-muted-foreground">
                                                (✓ Nyambung disortir ke atas)
                                            </span>
                                        ) : null}
                                    </Label>
                                    {selectedBom && (
                                        <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium truncate flex items-center gap-1">
                                                    {selectedBom.name}{' '}
                                                    {selectedBom.isChainMatch && (
                                                        <Badge className="text-[9px] h-3.5">
                                                            ✓ Nyambung
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    {selectedBom.skuCode}{' '}
                                                    {selectedBom.subtitle
                                                        ? `— ${selectedBom.subtitle}`
                                                        : ''}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[11px] shrink-0"
                                                onClick={() => {
                                                    setSelectedBom(null);
                                                    setForm({
                                                        ...form,
                                                        bomId: '',
                                                    });
                                                }}
                                            >
                                                Ganti
                                            </Button>
                                        </div>
                                    )}
                                    <Input
                                        value={bomSearch}
                                        onChange={(e) =>
                                            setBomSearch(e.target.value)
                                        }
                                        placeholder="Cari BoM..."
                                        className="text-xs h-8"
                                    />
                                    {!selectedBom && (
                                        <div className="border rounded max-h-40 overflow-auto divide-y">
                                            {boms.map((b) => (
                                                <button
                                                    key={b.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm({
                                                            ...form,
                                                            bomId: b.id,
                                                        });
                                                        setSelectedBom(b);
                                                    }}
                                                    className={`w-full text-left px-2.5 py-2 text-xs hover:bg-muted ${form.bomId === b.id ? 'bg-muted font-medium' : ''} ${b.isChainMatch ? 'bg-green-50/50' : ''}`}
                                                >
                                                    <div className="truncate font-medium flex items-center gap-1.5">
                                                        {b.name}{' '}
                                                        {b.isChainMatch && (
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-[9px] h-4 bg-green-100 text-green-800 border-green-200"
                                                            >
                                                                ✓ Nyambung
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {b.skuCode}
                                                        {b.subtitle
                                                            ? ` — ${b.subtitle}`
                                                            : ''}
                                                    </div>
                                                </button>
                                            ))}
                                            {boms.length === 0 && (
                                                <div className="text-[11px] text-muted-foreground p-2 text-center">
                                                    Tidak ada BoM. Buat BoM
                                                    dulu.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-[10px] text-muted-foreground">
                                        Pilih BoM yang output-nya = hasil tahap
                                        ini (bisa WIP/Intermediate). Tahap
                                        terakhir harus BoM dari{' '}
                                        {route.productVariant?.skuCode}.{' '}
                                        {lastOutputVariantId
                                            ? 'BOM yang inputnya dari output tahap sebelumnya ditandai ✓ Nyambung.'
                                            : ''}
                                    </p>
                                </div>

                                <div className="space-y-3 rounded border p-2.5 bg-muted/10">
                                    <Label className="text-xs">Lokasi</Label>
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-medium">
                                                Ambil bahan dari{' '}
                                                {isFirstStepTarget
                                                    ? '(opsional — tahap pertama, stok umum)'
                                                    : '(opsional — kosong = ikut lokasi output tahap sebelumnya)'}
                                            </div>
                                            {selectedSrcLoc ? (
                                                <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between items-center">
                                                    <span>
                                                        {selectedSrcLoc.name}{' '}
                                                        <span className="text-muted-foreground">
                                                            (
                                                            {
                                                                selectedSrcLoc.slug
                                                            }
                                                            )
                                                        </span>
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-[11px]"
                                                        onClick={() => {
                                                            setSelectedSrcLoc(
                                                                null,
                                                            );
                                                            setForm({
                                                                ...form,
                                                                materialSourceLocationId:
                                                                    '',
                                                            });
                                                        }}
                                                    >
                                                        Hapus
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[11px] font-normal"
                                                >
                                                    {isFirstStepTarget
                                                        ? 'Stok umum (tidak spesifik lokasi)'
                                                        : 'Kosong = otomatis ikut lokasi output tahap sebelumnya'}
                                                </Badge>
                                            )}
                                            <Input
                                                value={srcLocSearch}
                                                onChange={(e) =>
                                                    setSrcLocSearch(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Cari lokasi sumber..."
                                                className="text-xs h-8"
                                            />
                                            <div className="border rounded max-h-24 overflow-auto divide-y bg-background">
                                                {srcLocs.map((l) => (
                                                    <button
                                                        key={l.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setForm({
                                                                ...form,
                                                                materialSourceLocationId:
                                                                    l.id,
                                                            });
                                                            setSelectedSrcLoc(
                                                                l,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted ${form.materialSourceLocationId === l.id ? 'bg-muted font-medium' : ''}`}
                                                    >
                                                        {l.name}{' '}
                                                        <span className="text-muted-foreground">
                                                            ({l.slug})
                                                        </span>
                                                    </button>
                                                ))}
                                                {srcLocs.length === 0 && (
                                                    <div className="text-[10px] text-muted-foreground p-1.5 text-center">
                                                        Tidak ada lokasi
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-medium">
                                                Hasil tahap ditaruh ke (wajib)
                                            </div>
                                            {selectedOutLoc ? (
                                                <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between items-center">
                                                    <span>
                                                        {selectedOutLoc.name}{' '}
                                                        <span className="text-muted-foreground">
                                                            (
                                                            {
                                                                selectedOutLoc.slug
                                                            }
                                                            )
                                                        </span>
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-[11px]"
                                                        onClick={() => {
                                                            setSelectedOutLoc(
                                                                null,
                                                            );
                                                            setForm({
                                                                ...form,
                                                                outputLocationId:
                                                                    '',
                                                            });
                                                        }}
                                                    >
                                                        Ganti
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="text-[11px] text-red-600 font-medium px-2 py-1 rounded border border-red-200 bg-red-50">
                                                    Belum dipilih — wajib
                                                    sebelum publish
                                                </div>
                                            )}
                                            <Input
                                                value={outLocSearch}
                                                onChange={(e) =>
                                                    setOutLocSearch(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Cari lokasi output..."
                                                className="text-xs h-8"
                                            />
                                            <div className="border rounded max-h-24 overflow-auto divide-y bg-background">
                                                {outLocs.map((l) => (
                                                    <button
                                                        key={l.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setForm({
                                                                ...form,
                                                                outputLocationId:
                                                                    l.id,
                                                            });
                                                            setSelectedOutLoc(
                                                                l,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted ${form.outputLocationId === l.id ? 'bg-muted font-medium' : ''}`}
                                                    >
                                                        {l.name}{' '}
                                                        <span className="text-muted-foreground">
                                                            ({l.slug})
                                                        </span>
                                                    </button>
                                                ))}
                                                {outLocs.length === 0 && (
                                                    <div className="text-[10px] text-muted-foreground p-1.5 text-center">
                                                        Tidak ada lokasi
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-1">
                                    <label className="text-xs flex gap-1.5 items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.allowsPartialHandoff}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    allowsPartialHandoff:
                                                        e.target.checked,
                                                })
                                            }
                                        />{' '}
                                        Boleh estafet sebagian
                                    </label>
                                    <label className="text-xs flex gap-1.5 items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.requiresQualityGate}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    requiresQualityGate:
                                                        e.target.checked,
                                                })
                                            }
                                        />{' '}
                                        Butuh QC
                                    </label>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleSaveStep}
                                        className="w-full"
                                        disabled={
                                            !form.stepCode ||
                                            !form.label ||
                                            !form.processId ||
                                            !form.bomId ||
                                            !form.outputLocationId
                                        }
                                    >
                                        {editingStepId
                                            ? 'Simpan Perubahan'
                                            : 'Tambah Tahap'}
                                    </Button>
                                    {editingStepId && (
                                        <Button
                                            variant="outline"
                                            onClick={handleCancelEdit}
                                        >
                                            Batal
                                        </Button>
                                    )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Sistem cek: chain output-input, lokasi
                                    aktif/tidak risky, mesin capable.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}

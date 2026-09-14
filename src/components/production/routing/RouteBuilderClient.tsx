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

import type { RouteType, NewStepForm, Option } from './route-builder/types';
import { RouteStepEditor } from './route-builder/RouteStepEditor';
import { RouteStepCard } from './route-builder/RouteStepCard';
import { RouteValidationIssues } from './route-builder/RouteValidationIssues';

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
                        <RouteValidationIssues
                            blockingIssues={blockingIssues}
                            warningIssues={warningIssues}
                        />
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
                                <RouteStepCard
                                    key={step.id}
                                    step={step}
                                    idx={idx}
                                    hasIssue={hasIssue}
                                    bomPv={bomPv}
                                    isDraft={isDraft}
                                    sortedSteps={sortedSteps}
                                    handleMove={handleMove}
                                    handleStartEdit={handleStartEdit}
                                    handleDeleteStep={handleDeleteStep}
                                />
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
                    <RouteStepEditor
                        form={form}
                        setForm={setForm}
                        selectedProcess={selectedProcess}
                        setSelectedProcess={setSelectedProcess}
                        procSearch={procSearch}
                        setProcSearch={setProcSearch}
                        processes={processes}
                        selectedBom={selectedBom}
                        setSelectedBom={setSelectedBom}
                        bomSearch={bomSearch}
                        setBomSearch={setBomSearch}
                        boms={boms}
                        lastOutputVariantId={lastOutputVariantId}
                        route={route}
                        selectedSrcLoc={selectedSrcLoc}
                        setSelectedSrcLoc={setSelectedSrcLoc}
                        srcLocSearch={srcLocSearch}
                        setSrcLocSearch={setSrcLocSearch}
                        srcLocs={srcLocs}
                        isFirstStepTarget={isFirstStepTarget}
                        selectedOutLoc={selectedOutLoc}
                        setSelectedOutLoc={setSelectedOutLoc}
                        outLocSearch={outLocSearch}
                        setOutLocSearch={setOutLocSearch}
                        outLocs={outLocs}
                        editingStepId={editingStepId}
                        handleSaveStep={handleSaveStep}
                        handleCancelEdit={handleCancelEdit}
                    />
                )}
            </div>
        </div>
    );
}

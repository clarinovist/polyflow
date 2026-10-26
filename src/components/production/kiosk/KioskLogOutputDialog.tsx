'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Unit } from '@prisma/client';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { logRunningOutput } from '@/actions/production/production';
import { getQualityCheckParametersForVariant } from '@/actions/production/production-quality-standards';
import {
    getProductionUnitMeta,
    toBaseQuantity,
} from '@/lib/utils/production-units';
import { kioskLabels } from '@/lib/labels';
import {
    resolveKioskMode,
    computeMaterialPreview,
} from '@/lib/production/rewinder-workflow';
import {
    PACKAGED_REQUEST_REUSED,
    buildInitialGroups,
    materialName,
    newClientRequestId,
    packagingStepProblem,
    type KioskPackagingContext,
} from '@/lib/production/kiosk-packaging';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskDialogClose } from '@/components/kiosk/ui/KioskDialogClose';
import { KioskPackagingStep } from './KioskPackagingStep';
import { StepHasil } from './wizard/StepHasil';
import { StepAffal } from './wizard/StepAffal';
import { StepQc, type QcParameter } from './wizard/StepQc';
import { StepKirim } from './wizard/StepKirim';
import { WizardSaved } from './wizard/WizardSaved';
import {
    WizardStepBar,
    WizardSummary,
    type SummaryRow,
} from './wizard/WizardFrame';
import {
    WIZARD_STEP_LABEL,
    affalProblem,
    hasilProblem,
    kirimProblem,
    parseAmount,
    qcProblem,
    wizardSteps,
    type WizardStepKey,
} from './wizard/wizard-model';

interface ShiftInfo {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
    operatorId: string | null;
}

interface KioskLogOutputDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    productVariantId?: string;
    productName: string;
    primaryUnit?: string | null;
    salesUnit?: string | null;
    conversionFactor?: unknown;
    operatorId?: string;
    /** Shown as "Dikirim sebagai"; identity itself comes from the PIN session. */
    operatorName?: string;
    orderHelpers?: Array<{ id: string; name: string }>;
    shifts?: ShiftInfo[];
    executionModeSnapshot?: string | null;
    processNameSnapshot?: string | null;
    bomOutputQuantity?: unknown;
    bomItems?: Array<{
        id: string;
        quantity: number;
        productVariant: {
            id: string;
            name: string;
            skuCode: string;
            primaryUnit?: string | null;
        };
    }>;
    /** SPKs in actual-packaging mode add the Kemasan step and send packagedOutput. */
    actualPackagingEnabled?: boolean;
    packaging?: {
        context: KioskPackagingContext | null;
        isLoading: boolean;
        error: string;
        onRetry: () => void;
    };
    onSuccess?: () => void;
}

type PackagingGroups = PackagedOutputValues['groups'];

const num = (value: number) =>
    value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
const isActive = (shift: ShiftInfo, now: number) =>
    now >= new Date(shift.startTime).getTime() &&
    now <= new Date(shift.endTime).getTime();

const STEP_TEXT: Record<
    Exclude<WizardStepKey, 'hasil'>,
    { title: string; desc: string }
> = {
    packaging: {
        title: kioskLabels.wizardKemasanTitle,
        desc: kioskLabels.wizardKemasanCountDesc,
    },
    affal: {
        title: kioskLabels.wizardAffalTitle,
        desc: kioskLabels.wizardAffalDesc,
    },
    qc: { title: kioskLabels.wizardQcTitle, desc: kioskLabels.wizardQCDesc },
    kirim: {
        title: kioskLabels.wizardKirimTitle,
        desc: kioskLabels.wizardKirimDesc,
    },
};

export function KioskLogOutputDialog({
    open,
    onOpenChange,
    executionId,
    productVariantId,
    productName,
    primaryUnit,
    salesUnit,
    conversionFactor,
    operatorId,
    operatorName = '',
    orderHelpers = [],
    shifts = [],
    executionModeSnapshot = null,
    processNameSnapshot = null,
    bomOutputQuantity,
    bomItems = [],
    actualPackagingEnabled = false,
    packaging,
    onSuccess,
}: KioskLogOutputDialogProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [quantity, setQuantity] = useState('');
    // "Hasil 0, hanya affal" chosen: an explicit answer, not a confirmation.
    const [scrapOnly, setScrapOnly] = useState(false);
    const [prongkol, setProngkol] = useState('');
    const [daun, setDaun] = useState('');
    const [noAffal, setNoAffal] = useState(false);
    const [notes, setNotes] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [savedRows, setSavedRows] = useState<SummaryRow[] | null>(null);
    const [session, setSession] = useState({ count: 0, total: 0 });
    const [selectedShiftId, setSelectedShiftId] = useState('');
    const [qcParameters, setQcParameters] = useState<QcParameter[]>([]);
    const [qcValues, setQcValues] = useState<Record<string, string>>({});
    // null until the operator edits the step; until then it follows the prefill.
    const [packagingGroups, setPackagingGroups] =
        useState<PackagingGroups | null>(null);
    // One id per submission. It survives failures and close/reopen so a lost
    // response cannot double-post; only a confirmed save clears it.
    const pendingRequestIdRef = useRef<string | null>(null);

    // Fetch QC parameters for this variant once per dialog open — kalau
    // varian belum punya parameter terdefinisi, step QC tidak pernah muncul.
    useEffect(() => {
        if (!open || !productVariantId) return;
        let cancelled = false;
        (async () => {
            const res =
                await getQualityCheckParametersForVariant(productVariantId);
            if (!cancelled && res.success) {
                setQcParameters(res.data as unknown as QcParameter[]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, productVariantId]);

    // Auto-select only an ACTIVE shift (the operator's first). With none
    // active nothing is preselected, so a stale shift is never attached.
    const now = Date.now();
    const hasActiveShift = shifts.some((shift) => isActive(shift, now));
    const autoShift =
        (operatorId &&
            shifts.find(
                (shift) =>
                    shift.operatorId === operatorId && isActive(shift, now),
            )) ||
        shifts.find((shift) => isActive(shift, now)) ||
        null;
    const shiftId = selectedShiftId || autoShift?.id || '';

    const unitMeta = getProductionUnitMeta({
        primaryUnit,
        salesUnit,
        conversionFactor,
    });
    const mode = resolveKioskMode(executionModeSnapshot);

    // GENERIC keeps legacy behavior (auto-fill order helpers except the kiosk
    // operator). Individual/conversion modes record operator-attributed output,
    // so helpers stay empty unless explicitly chosen.
    const helperIds =
        mode === 'GENERIC'
            ? orderHelpers.filter((h) => h.id !== operatorId).map((h) => h.id)
            : [];

    const qtyNum = parseAmount(quantity);
    const safeQty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0;
    const baseQty = unitMeta.hasAlternateUnit
        ? toBaseQuantity(safeQty, unitMeta.conversionFactor)
        : safeQty;
    const prongkolNum = parseAmount(prongkol);
    const daunNum = parseAmount(daun);
    const totalScrap =
        (Number.isFinite(prongkolNum) ? prongkolNum : 0) +
        (Number.isFinite(daunNum) ? daunNum : 0);

    const packagingContext = packaging?.context ?? null;
    const effectiveGroups: PackagingGroups =
        packagingGroups ??
        (packagingContext ? buildInitialGroups(packagingContext, baseQty) : []);

    // ── BOM ratio preview (MATERIAL_CONVERSION only) ──
    // Pick the single BOM item whose input unit differs from the output unit.
    // Ambiguous (none or several) → null → blocked, no ratio-1 fallback.
    const outputUnit = unitMeta.displayUnit;
    const ratioItem = (() => {
        if (mode !== 'MATERIAL_CONVERSION' || bomItems.length === 0)
            return null;
        const outQty = Number(bomOutputQuantity);
        const candidates = bomItems.filter((it) => {
            const itemQty = Number(it.quantity);
            return (
                itemQty > 0 &&
                outQty > 0 &&
                it.productVariant.primaryUnit !== outputUnit
            );
        });
        return candidates.length === 1 ? candidates[0] : null;
    })();
    const materialPreview =
        mode === 'MATERIAL_CONVERSION' && ratioItem
            ? computeMaterialPreview(
                  safeQty,
                  Number(bomOutputQuantity),
                  Number(ratioItem.quantity),
                  ratioItem.productVariant.primaryUnit || 'PCS',
              )
            : null;

    const steps = wizardSteps({
        actualPackagingEnabled,
        scrapOnly,
        hasQc: qcParameters.length > 0,
    });
    const index = Math.min(stepIndex, steps.length - 1);
    const stepKey = steps[index];

    const problem = (() => {
        switch (stepKey) {
            case 'hasil':
                return hasilProblem({
                    qty: qtyNum,
                    scrapOnly,
                    conversionInvalid:
                        mode === 'MATERIAL_CONVERSION' && !materialPreview,
                });
            case 'packaging':
                return packagingContext
                    ? packagingStepProblem(
                          packagingContext,
                          effectiveGroups,
                          baseQty,
                          unitMeta.primaryUnit,
                      )
                    : baseQty > 0
                      ? kioskLabels.packagingNotLoaded
                      : null;
            case 'affal':
                return affalProblem({
                    prongkol: prongkolNum,
                    daun: daunNum,
                    scrapOnly,
                    noAffal,
                });
            case 'qc':
                return qcProblem(qcParameters, qcValues);
            case 'kirim':
                return kirimProblem({ mode, hasActiveShift, shiftId });
        }
    })();

    const packagingRows: SummaryRow[] =
        actualPackagingEnabled && packagingContext && baseQty > 0
            ? effectiveGroups.flatMap((group) =>
                  group.packaging.map((row) => ({
                      label: materialName(
                          packagingContext,
                          row.productVariantId,
                      ),
                      value:
                          row.quantity > 0
                              ? `${num(row.quantity)} ${row.unit === 'KG' ? 'KG' : 'pcs'}`
                              : '-',
                  })),
              )
            : [];
    const summaryRows: SummaryRow[] = [
        {
            label: kioskLabels.todayGood,
            value:
                quantity === '' && !scrapOnly
                    ? '-'
                    : `${num(safeQty)} ${unitMeta.displayUnit}`,
        },
        ...packagingRows,
        {
            label: kioskLabels.todayScrap,
            value:
                totalScrap > 0
                    ? `${num(totalScrap)} KG`
                    : noAffal
                      ? '0 KG'
                      : '-',
        },
        ...qcParameters
            .filter((param) => (qcValues[param.id] ?? '') !== '')
            .map((param) => ({
                label: param.name,
                value: `${qcValues[param.id]} ${param.unit}`,
            })),
        {
            label: kioskLabels.shift,
            value:
                shifts.find((shift) => shift.id === shiftId)?.shiftName ?? '-',
        },
    ];

    const uploadPhoto = async (file: File): Promise<string | null> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('executionId', executionId);
        try {
            const res = await fetch('/api/upload/production-photo', {
                method: 'POST',
                body: formData,
            });
            if (
                (res as Response).redirected ||
                !res.headers.get('content-type')?.includes('application/json')
            ) {
                toast.error(
                    'Upload foto ditolak (akses mobile). Hubungi admin — endpoint upload belum diizinkan untuk perangkat ini.',
                );
                return null;
            }
            if (!res.ok) {
                let errMsg = `Gagal upload foto (${res.status})`;
                try {
                    const errBody = await res.json();
                    if (errBody?.error)
                        errMsg = `Upload foto: ${errBody.error}`;
                } catch {
                    /* response not JSON */
                }
                toast.error(errMsg);
                return null;
            }
            const data = await res.json();
            return data.publicUrl || null;
        } catch (error) {
            console.error('Photo upload failed:', error);
            toast.error(
                'Koneksi gagal saat upload foto. Periksa jaringan lalu coba lagi.',
            );
            return null;
        }
    };

    const submitOutput = async () => {
        if (problem) return;
        // One id per submission until it saves, so a retry never posts twice.
        pendingRequestIdRef.current ??= newClientRequestId();
        const clientRequestId = pendingRequestIdRef.current;
        const prongkolKg = Number.isFinite(prongkolNum) ? prongkolNum : 0;
        const daunKg = Number.isFinite(daunNum) ? daunNum : 0;

        setIsLoading(true);
        try {
            let photoUrl: string | undefined;
            if (photoFile) {
                setIsUploadingPhoto(true);
                photoUrl = (await uploadPhoto(photoFile)) || undefined;
                setIsUploadingPhoto(false);
            }

            const result = await logRunningOutput({
                executionId,
                quantityProduced: baseQty,
                enteredQuantity: unitMeta.hasAlternateUnit
                    ? safeQty
                    : undefined,
                enteredUnit: unitMeta.hasAlternateUnit
                    ? (unitMeta.salesUnit as Unit)
                    : undefined,
                baseQuantityProduced: unitMeta.hasAlternateUnit
                    ? baseQty
                    : undefined,
                conversionFactorSnapshot: unitMeta.hasAlternateUnit
                    ? unitMeta.conversionFactor
                    : undefined,
                scrapQuantity: prongkolKg + daunKg,
                scrapProngkolQty: prongkolKg,
                scrapDaunQty: daunKg,
                notes: notes || '',
                operatorId,
                helperIds: helperIds.length > 0 ? helperIds : undefined,
                photoUrl,
                shiftId: shiftId || undefined,
                qcMeasurements: qcParameters
                    .map((param) => ({
                        parameterId: param.id,
                        value: parseAmount(qcValues[param.id] ?? ''),
                    }))
                    .filter((m) => !Number.isNaN(m.value)),
                clientRequestId: actualPackagingEnabled
                    ? undefined
                    : clientRequestId,
                packagedOutput: actualPackagingEnabled
                    ? {
                          clientRequestId,
                          groups:
                              baseQty > 0
                                  ? effectiveGroups.map((group) =>
                                        effectiveGroups.length === 1
                                            ? { ...group, quantity: baseQty }
                                            : group,
                                    )
                                  : [],
                      }
                    : undefined,
            });

            if (result.success) {
                pendingRequestIdRef.current = null;
                toast.success(kioskLabels.wizardSuccessDesc);
                setSession((prev) => ({
                    count: prev.count + 1,
                    total: prev.total + safeQty,
                }));
                setSavedRows(
                    summaryRows.filter(
                        (row) => row.label !== kioskLabels.shift,
                    ),
                );
                onSuccess?.();
            } else if (result.code === PACKAGED_REQUEST_REUSED) {
                // An earlier attempt was saved with other numbers.
                pendingRequestIdRef.current = null;
                toast.error(kioskLabels.packagedRequestReused);
            } else {
                toast.error(result.error || kioskLabels.wizardFailed);
            }
        } catch (error) {
            toast.error(kioskLabels.wizardFailed);
            console.error(error);
        } finally {
            setIsUploadingPhoto(false);
            setIsLoading(false);
        }
    };

    const goNext = () => {
        if (!problem) setStepIndex(index + 1);
    };

    const resetForm = () => {
        setQuantity('');
        setScrapOnly(false);
        setProngkol('');
        setDaun('');
        setNoAffal(false);
        setNotes('');
        setPhotoFile(null);
        setSelectedShiftId('');
        setQcValues({});
        setPackagingGroups(null);
        setSavedRows(null);
        setStepIndex(0);
    };

    const handleClose = () => {
        resetForm();
        setSession({ count: 0, total: 0 });
        onOpenChange(false);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) handleClose();
        else onOpenChange(next);
    };

    const stepTitle =
        stepKey === 'hasil'
            ? mode === 'INDIVIDUAL_OUTPUT'
                ? kioskLabels.wizardHasilIndividualTitle
                : kioskLabels.wizardHasilTitle
            : STEP_TEXT[stepKey].title;
    const stepDesc =
        stepKey === 'hasil'
            ? kioskLabels.wizardHasilDesc
            : STEP_TEXT[stepKey].desc;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-2xl"
            >
                {savedRows ? (
                    <div className="flex-1 overflow-y-auto">
                        <DialogDescription className="sr-only">
                            {productName}
                        </DialogDescription>
                        <WizardSaved
                            rows={savedRows}
                            sessionTotal={
                                session.count > 1
                                    ? `${num(session.total)} ${unitMeta.displayUnit}`
                                    : null
                            }
                            onAgain={resetForm}
                            onDone={handleClose}
                        />
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 border-b px-4 py-3 md:px-6">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-base text-muted-foreground">
                                        {kioskLabels.wizardTitle} ·{' '}
                                        {processNameSnapshot || productName}
                                    </p>
                                    <DialogTitle className="text-2xl font-extrabold">
                                        {stepTitle}
                                    </DialogTitle>
                                    <DialogDescription className="text-base">
                                        {stepDesc}
                                    </DialogDescription>
                                </div>
                                <KioskDialogClose />
                            </div>
                            <WizardStepBar
                                labels={steps.map(
                                    (key) => WIZARD_STEP_LABEL[key],
                                )}
                                current={index}
                            />
                        </div>

                        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                            {stepKey === 'hasil' && (
                                <StepHasil
                                    value={quantity}
                                    unit={unitMeta.displayUnit}
                                    onChange={(value) => {
                                        setQuantity(value);
                                        if (parseAmount(value) > 0)
                                            setScrapOnly(false);
                                    }}
                                    onZeroOutput={() => {
                                        setQuantity('0');
                                        setScrapOnly(true);
                                        setNoAffal(false);
                                        setStepIndex(1);
                                    }}
                                    baseUnitNote={
                                        unitMeta.hasAlternateUnit
                                            ? unitMeta.primaryUnit
                                            : null
                                    }
                                    conversion={
                                        ratioItem
                                            ? {
                                                  standard: `${num(Number(ratioItem.quantity))} ${ratioItem.productVariant.primaryUnit} / ${Number(bomOutputQuantity)} ${outputUnit}`,
                                                  preview: materialPreview
                                                      ? `${kioskLabels.bomWipPreviewLabel}: ${num(materialPreview.requiredQty)} ${materialPreview.unit}`
                                                      : null,
                                              }
                                            : null
                                    }
                                    conversionInvalid={
                                        mode === 'MATERIAL_CONVERSION' &&
                                        !ratioItem
                                    }
                                />
                            )}
                            {stepKey === 'packaging' && (
                                <div className="rounded-2xl border-2 border-border bg-card p-4">
                                    <KioskPackagingStep
                                        context={packagingContext}
                                        isLoading={
                                            packaging?.isLoading ?? false
                                        }
                                        error={packaging?.error ?? ''}
                                        onRetry={
                                            packaging?.onRetry ?? (() => {})
                                        }
                                        groups={effectiveGroups}
                                        onChange={setPackagingGroups}
                                        baseQty={baseQty}
                                        unit={unitMeta.primaryUnit}
                                    />
                                </div>
                            )}
                            {stepKey === 'affal' && (
                                <StepAffal
                                    prongkol={prongkol}
                                    daun={daun}
                                    onProngkolChange={(value) => {
                                        setProngkol(value);
                                        setNoAffal(false);
                                    }}
                                    onDaunChange={(value) => {
                                        setDaun(value);
                                        setNoAffal(false);
                                    }}
                                    showNoAffal={!scrapOnly}
                                    onNoAffal={() => {
                                        setProngkol('');
                                        setDaun('');
                                        setNoAffal(true);
                                        setStepIndex(index + 1);
                                    }}
                                />
                            )}
                            {stepKey === 'qc' && (
                                <StepQc
                                    parameters={qcParameters}
                                    values={qcValues}
                                    onChange={(id, value) =>
                                        setQcValues((prev) => ({
                                            ...prev,
                                            [id]: value,
                                        }))
                                    }
                                />
                            )}
                            {stepKey === 'kirim' && (
                                <StepKirim
                                    shifts={shifts}
                                    shiftId={shiftId}
                                    onShiftChange={setSelectedShiftId}
                                    hasActiveShift={hasActiveShift}
                                    operatorName={operatorName || '-'}
                                    helperCount={helperIds.length}
                                    notes={notes}
                                    onNotesChange={setNotes}
                                    onPhoto={setPhotoFile}
                                    isUploadingPhoto={isUploadingPhoto}
                                    disabled={isLoading}
                                />
                            )}
                            <WizardSummary
                                rows={summaryRows}
                                footer={productName}
                            />
                        </div>

                        <div className="grid gap-2 border-t px-4 py-3 sm:flex sm:items-center sm:gap-3 md:px-6">
                            <p
                                aria-live="polite"
                                className="text-base text-muted-foreground sm:order-2 sm:min-w-0 sm:flex-1 sm:text-right"
                            >
                                {problem}
                            </p>
                            <div className="flex items-center gap-3 sm:contents">
                                {index > 0 && (
                                    <button
                                        type="button"
                                        className={kioskButton({
                                            size: 'lg',
                                            tone: 'ghost',
                                            className: 'sm:order-1',
                                        })}
                                        onClick={() => setStepIndex(index - 1)}
                                        disabled={isLoading}
                                    >
                                        <ArrowLeft aria-hidden="true" />
                                        {kioskLabels.wizardBack}
                                    </button>
                                )}
                                {stepKey === 'kirim' ? (
                                    <button
                                        type="button"
                                        className={kioskButton({
                                            size: 'lg',
                                            tone: 'go',
                                            className: 'ml-auto sm:order-3',
                                        })}
                                        onClick={submitOutput}
                                        disabled={Boolean(problem) || isLoading}
                                    >
                                        {isLoading ? (
                                            <Loader2
                                                aria-hidden="true"
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Send aria-hidden="true" />
                                        )}
                                        {kioskLabels.wizardSubmit}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className={kioskButton({
                                            size: 'lg',
                                            tone: 'go',
                                            className: 'ml-auto sm:order-3',
                                        })}
                                        onClick={goNext}
                                        disabled={Boolean(problem)}
                                    >
                                        {kioskLabels.wizardNext}
                                        <ArrowRight aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

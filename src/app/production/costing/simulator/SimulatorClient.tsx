'use client';

import { getHppPriceSimulatorDefault } from '@/actions/production/hpp-price-simulator';
import type {
    HppPriceSimulatorDefaultDTO,
    HppPriceSimulatorMaterialDTO,
    HppPriceSimulatorVariantOptionDTO,
} from '@/actions/production/hpp-price-simulator-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    HPP_SIMULATOR_MAX_SCENARIOS,
    HppSimulatorValidationError,
    calculateHppSimulatorScenario,
    hppSimulatorDefaultMargin,
    hppSimulatorManualNumber,
    isHppSimulatorManualZero,
    resetHppSimulatorNumber,
    type HppSimulatorDynamicComponent,
    type HppSimulatorNumberInput,
    type HppSimulatorScenarioInput,
    type HppSimulatorScenarioResult,
} from '@/lib/production/hpp-price-simulator';
import { formatRupiah } from '@/lib/utils/utils';
import {
    AlertTriangle,
    Calculator,
    Copy,
    Plus,
    RotateCcw,
    Trash2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

type Formula = HppSimulatorDynamicComponent['formula'];

type ScenarioState = {
    id: string;
    selectedVariantId: string;
    input: HppSimulatorScenarioInput | null;
    loading: boolean;
    error: string | null;
};

type ScenarioCalculation =
    | { result: HppSimulatorScenarioResult; error: null }
    | { result: null; error: string };

const SOURCE_LABELS: Record<string, string> = {
    inventory_average: 'Rata-rata persediaan internal',
    standard_cost: 'Biaya standar',
    buy_price: 'Harga beli',
    missing: 'Belum ada biaya',
    bom: 'BOM aktif/default',
    simulator_assumption: 'Asumsi simulator',
};

const WARNING_LABELS: Record<string, string> = {
    low_internal_stock: 'Saldo internal sangat kecil',
    inventory_standard_cost_gap: 'Berbeda material dari biaya standar',
    low_stock_cost_outlier: 'Biaya stok kecil berpotensi outlier',
};

const FORMULA_LABELS: Record<Formula, string> = {
    'quantity-times-unit-cost': 'Jumlah × harga satuan',
    'batch-cost-per-good-output': 'Biaya shift/batch ÷ hasil baik',
    'fixed-per-output': 'Biaya tetap per output',
    'percentage-of-pre-overhead': '% dari subtotal sebelum overhead',
};

function numberValue(input: HppSimulatorNumberInput): number | null {
    return input.mode === 'default' ? input.defaultSnapshot.value : input.value;
}

function manualValue(
    input: HppSimulatorNumberInput,
    value: number | null,
): HppSimulatorNumberInput {
    return hppSimulatorManualNumber(value, input.defaultSnapshot);
}

function cloneScenario(
    input: HppSimulatorScenarioInput,
    id: string,
    name: string,
): HppSimulatorScenarioInput {
    const clone = JSON.parse(JSON.stringify(input)) as HppSimulatorScenarioInput;
    return { ...clone, id, name };
}

function buildScenario(
    dto: HppPriceSimulatorDefaultDTO,
    id: string,
    name: string,
): HppSimulatorScenarioInput {
    return {
        id,
        name,
        bom: {
            id: dto.bom.id,
            name: dto.bom.name,
            outputQuantity: dto.bom.outputQuantity,
            primaryOutputUnit: dto.variant.primaryOutputUnit,
        },
        materials: dto.materials.map((material) => ({
            id: material.id,
            name: material.name,
            formula: 'bom-material',
            quantity: material.quantity,
            unitCost: material.unitCost,
            scrapPercentage: material.scrapPercentage,
            primaryUnit: material.primaryUnit,
        })),
        components: [
            {
                id: `${id}-labor`,
                name: 'Tenaga kerja per shift',
                formula: 'batch-cost-per-good-output',
                category: 'conversion',
                batchQuantity: hppSimulatorManualNumber(null),
                costPerBatchUnit: hppSimulatorManualNumber(null),
                goodOutputQuantity: hppSimulatorManualNumber(null),
                batchUnit: 'orang/shift',
            },
        ],
        targetMarginPercent: hppSimulatorDefaultMargin(),
        salePrice: hppSimulatorManualNumber(null),
    };
}

function calculate(input: HppSimulatorScenarioInput | null): ScenarioCalculation {
    if (!input) return { result: null, error: 'Pilih produk untuk memulai.' };
    try {
        return { result: calculateHppSimulatorScenario(input), error: null };
    } catch (error) {
        if (error instanceof HppSimulatorValidationError) {
            return { result: null, error: error.message };
        }
        return {
            result: null,
            error: 'Perhitungan gagal. Periksa kembali semua angka.',
        };
    }
}

function initialScenario(
    initialDefault: HppPriceSimulatorDefaultDTO | null,
): ScenarioState {
    return {
        id: 'scenario-1',
        selectedVariantId: initialDefault?.variant.id ?? '',
        input: initialDefault
            ? buildScenario(initialDefault, 'scenario-1', 'Skenario 1')
            : null,
        loading: false,
        error: null,
    };
}

export function SimulatorClient({
    options,
    initialDefault,
}: {
    options: HppPriceSimulatorVariantOptionDTO[];
    initialDefault: HppPriceSimulatorDefaultDTO | null;
}) {
    const [scenarios, setScenarios] = useState<ScenarioState[]>(() => [
        initialScenario(initialDefault),
    ]);
    const [formulaByScenario, setFormulaByScenario] = useState<
        Record<string, Formula>
    >({});
    const [defaultsByScenario, setDefaultsByScenario] = useState<
        Record<string, HppPriceSimulatorDefaultDTO | null>
    >({ 'scenario-1': initialDefault });
    const nextId = useRef(2);
    const requestVersions = useRef(new Map<string, number>());

    const calculations = useMemo(
        () => new Map(scenarios.map((item) => [item.id, calculate(item.input)])),
        [scenarios],
    );

    const updateScenario = (
        scenarioId: string,
        updater: (scenario: ScenarioState) => ScenarioState,
    ) => {
        setScenarios((current) =>
            current.map((scenario) =>
                scenario.id === scenarioId ? updater(scenario) : scenario,
            ),
        );
    };

    const loadVariant = async (scenarioId: string, variantId: string) => {
        const version = (requestVersions.current.get(scenarioId) ?? 0) + 1;
        requestVersions.current.set(scenarioId, version);
        updateScenario(scenarioId, (scenario) => ({
            ...scenario,
            selectedVariantId: variantId,
            input: null,
            loading: variantId !== '',
            error: null,
        }));
        setDefaultsByScenario((current) => ({
            ...current,
            [scenarioId]: null,
        }));
        if (!variantId) return;

        let response: Awaited<
            ReturnType<typeof getHppPriceSimulatorDefault>
        >;
        try {
            response = await getHppPriceSimulatorDefault(variantId);
        } catch {
            if (requestVersions.current.get(scenarioId) !== version) return;
            updateScenario(scenarioId, (scenario) => ({
                ...scenario,
                loading: false,
                error: 'Data simulator gagal dimuat. Silakan pilih produk atau coba lagi.',
            }));
            return;
        }
        if (requestVersions.current.get(scenarioId) !== version) return;

        if (!response.success) {
            updateScenario(scenarioId, (scenario) => ({
                ...scenario,
                loading: false,
                error: response.error,
            }));
            return;
        }
        if (!response.data) {
            updateScenario(scenarioId, (scenario) => ({
                ...scenario,
                loading: false,
                error: 'BOM aktif/default tidak ditemukan untuk produk ini.',
            }));
            return;
        }

        const loadedDefault = response.data;
        setDefaultsByScenario((current) => ({
            ...current,
            [scenarioId]: loadedDefault,
        }));
        updateScenario(scenarioId, (scenario) => ({
            ...scenario,
            selectedVariantId: variantId,
            input: buildScenario(
                loadedDefault,
                scenario.id,
                scenario.input?.name ??
                    `Skenario ${scenarios.findIndex((item) => item.id === scenario.id) + 1}`,
            ),
            loading: false,
            error: null,
        }));
    };

    const duplicateScenario = (source: ScenarioState) => {
        if (!source.input || scenarios.length >= HPP_SIMULATOR_MAX_SCENARIOS) {
            return;
        }
        const id = `scenario-${nextId.current++}`;
        setScenarios((current) => [
            ...current,
            {
                id,
                selectedVariantId: source.selectedVariantId,
                input: cloneScenario(
                    source.input!,
                    id,
                    `Skenario ${current.length + 1}`,
                ),
                loading: false,
                error: null,
            },
        ]);
        setDefaultsByScenario((current) => ({
            ...current,
            [id]: current[source.id] ?? null,
        }));
    };

    const removeScenario = (scenarioId: string) => {
        if (scenarios.length === 1) return;
        requestVersions.current.delete(scenarioId);
        setScenarios((current) =>
            current.filter((scenario) => scenario.id !== scenarioId),
        );
        setDefaultsByScenario((current) => {
            const next = { ...current };
            delete next[scenarioId];
            return next;
        });
    };

    const addComponent = (scenarioId: string) => {
        const formula =
            formulaByScenario[scenarioId] ?? 'quantity-times-unit-cost';
        const componentId = `${scenarioId}-component-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let component: HppSimulatorDynamicComponent;
        switch (formula) {
            case 'quantity-times-unit-cost':
                component = {
                    id: componentId,
                    name: 'Komponen tambahan',
                    formula,
                    category: 'conversion',
                    quantity: hppSimulatorManualNumber(null),
                    unitCost: hppSimulatorManualNumber(null),
                    quantityUnit: 'unit',
                };
                break;
            case 'batch-cost-per-good-output':
                component = {
                    id: componentId,
                    name: 'Biaya per shift/batch',
                    formula,
                    category: 'conversion',
                    batchQuantity: hppSimulatorManualNumber(null),
                    costPerBatchUnit: hppSimulatorManualNumber(null),
                    goodOutputQuantity: hppSimulatorManualNumber(null),
                    batchUnit: 'unit/batch',
                };
                break;
            case 'fixed-per-output':
                component = {
                    id: componentId,
                    name: 'Biaya tetap per output',
                    formula,
                    category: 'conversion',
                    costPerOutput: hppSimulatorManualNumber(null),
                };
                break;
            case 'percentage-of-pre-overhead':
                component = {
                    id: componentId,
                    name: 'Overhead',
                    formula,
                    percentage: hppSimulatorManualNumber(null),
                };
                break;
        }
        updateScenario(scenarioId, (scenario) => ({
            ...scenario,
            input: scenario.input
                ? {
                      ...scenario.input,
                      components: [...scenario.input.components, component],
                  }
                : null,
        }));
    };

    return (
        <div className="space-y-6">
            {options.length === 0 && (
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Belum ada produk yang dapat disimulasikan</AlertTitle>
                    <AlertDescription>
                        Buat satu BOM aktif/default terlebih dahulu. Simulator tidak
                        membuat asumsi biaya palsu.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
                {scenarios.map((scenario, scenarioIndex) => {
                    const calculation = calculations.get(scenario.id)!;
                    return (
                        <Card key={scenario.id} className="min-w-0 shadow-sm">
                            <CardHeader className="gap-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <CardTitle>
                                            {scenario.input?.name ??
                                                `Skenario ${scenarioIndex + 1}`}
                                        </CardTitle>
                                        <CardDescription>
                                            Semua perubahan hanya berlaku di layar ini.
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="min-h-10"
                                            onClick={() => duplicateScenario(scenario)}
                                            disabled={
                                                !scenario.input ||
                                                scenarios.length >=
                                                    HPP_SIMULATOR_MAX_SCENARIOS
                                            }
                                        >
                                            <Copy className="h-4 w-4" />
                                            Duplikat
                                        </Button>
                                        {scenarios.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="min-h-10 min-w-10"
                                                aria-label={`Hapus ${scenario.input?.name ?? `skenario ${scenarioIndex + 1}`}`}
                                                onClick={() =>
                                                    removeScenario(scenario.id)
                                                }
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`${scenario.id}-product`}>
                                        Produk / varian
                                    </Label>
                                    <select
                                        id={`${scenario.id}-product`}
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-3"
                                        value={scenario.selectedVariantId}
                                        disabled={scenario.loading}
                                        onChange={(event) =>
                                            void loadVariant(
                                                scenario.id,
                                                event.target.value,
                                            )
                                        }
                                    >
                                        <option value="">Pilih produk</option>
                                        {options.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name} · {option.skuCode} ·{' '}
                                                {option.defaultBom.name}
                                            </option>
                                        ))}
                                    </select>
                                    {scenario.loading && (
                                        <p role="status" className="text-sm text-muted-foreground">
                                            Memuat BOM dan sumber biaya…
                                        </p>
                                    )}
                                    {scenario.error && (
                                        <p role="alert" className="text-sm text-destructive">
                                            {scenario.error}
                                        </p>
                                    )}
                                </div>
                            </CardHeader>

                            {scenario.input && (
                                <CardContent className="space-y-6">
                                    <BasisSummary input={scenario.input} />

                                    <section
                                        className="space-y-3"
                                        aria-labelledby={`${scenario.id}-materials`}
                                    >
                                        <div>
                                            <h3
                                                id={`${scenario.id}-materials`}
                                                className="font-semibold"
                                            >
                                                Material & kemasan dari BOM
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Biaya baris = jumlah × biaya satuan ×
                                                (1 + scrap), lalu dibagi output BOM.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            {scenario.input.materials.map(
                                                (material, materialIndex) => (
                                                    <MaterialEditor
                                                        key={material.id}
                                                        material={material}
                                                        idPrefix={scenario.id}
                                                        metadata={
                                                            defaultsByScenario[
                                                                scenario.id
                                                            ]?.materials.find(
                                                                (item) =>
                                                                    item.id ===
                                                                    material.id,
                                                            ) ?? null
                                                        }
                                                        onChange={(next) =>
                                                            updateScenario(
                                                                scenario.id,
                                                                (current) => ({
                                                                    ...current,
                                                                    input: current.input
                                                                        ? {
                                                                              ...current.input,
                                                                              materials:
                                                                                  current.input.materials.map(
                                                                                      (
                                                                                          item,
                                                                                          index,
                                                                                      ) =>
                                                                                          index ===
                                                                                          materialIndex
                                                                                              ? next
                                                                                              : item,
                                                                                  ),
                                                                          }
                                                                        : null,
                                                                }),
                                                            )
                                                        }
                                                    />
                                                ),
                                            )}
                                        </div>
                                    </section>

                                    <section
                                        className="space-y-3"
                                        aria-labelledby={`${scenario.id}-components`}
                                    >
                                        <div>
                                            <h3
                                                id={`${scenario.id}-components`}
                                                className="font-semibold"
                                            >
                                                Tenaga kerja, konversi & overhead
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Input tenaga kerja sengaja kosong; simulator
                                                tidak membaca payroll atau histori shift.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            {scenario.input.components.map(
                                                (component, componentIndex) => (
                                                    <DynamicComponentEditor
                                                        key={component.id}
                                                        component={component}
                                                        idPrefix={scenario.id}
                                                        onChange={(next) =>
                                                            updateScenario(
                                                                scenario.id,
                                                                (current) => ({
                                                                    ...current,
                                                                    input: current.input
                                                                        ? {
                                                                              ...current.input,
                                                                              components:
                                                                                  current.input.components.map(
                                                                                      (
                                                                                          item,
                                                                                          index,
                                                                                      ) =>
                                                                                          index ===
                                                                                          componentIndex
                                                                                              ? next
                                                                                              : item,
                                                                                  ),
                                                                          }
                                                                        : null,
                                                                }),
                                                            )
                                                        }
                                                        onRemove={() =>
                                                            updateScenario(
                                                                scenario.id,
                                                                (current) => ({
                                                                    ...current,
                                                                    input: current.input
                                                                        ? {
                                                                              ...current.input,
                                                                              components:
                                                                                  current.input.components.filter(
                                                                                      (_item, index) =>
                                                                                          index !==
                                                                                          componentIndex,
                                                                                  ),
                                                                          }
                                                                        : null,
                                                                }),
                                                            )
                                                        }
                                                    />
                                                ),
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <select
                                                aria-label="Jenis komponen baru"
                                                className="border-input bg-background min-h-11 flex-1 rounded-md border px-3 text-sm"
                                                value={
                                                    formulaByScenario[
                                                        scenario.id
                                                    ] ??
                                                    'quantity-times-unit-cost'
                                                }
                                                onChange={(event) =>
                                                    setFormulaByScenario(
                                                        (current) => ({
                                                            ...current,
                                                            [scenario.id]: event
                                                                .target
                                                                .value as Formula,
                                                        }),
                                                    )
                                                }
                                            >
                                                {Object.entries(
                                                    FORMULA_LABELS,
                                                ).map(([value, label]) => (
                                                    <option key={value} value={value}>
                                                        {label}
                                                    </option>
                                                ))}
                                            </select>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="min-h-11"
                                                onClick={() =>
                                                    addComponent(scenario.id)
                                                }
                                            >
                                                <Plus className="h-4 w-4" />
                                                Tambah komponen
                                            </Button>
                                        </div>
                                    </section>

                                    <AssumptionsEditor
                                        scenario={scenario.input}
                                        onChange={(input) =>
                                            updateScenario(
                                                scenario.id,
                                                (current) => ({
                                                    ...current,
                                                    input,
                                                }),
                                            )
                                        }
                                    />

                                    <ResultSummary calculation={calculation} />
                                </CardContent>
                            )}
                        </Card>
                    );
                })}
            </div>

            <p className="text-sm text-muted-foreground">
                Maksimal {HPP_SIMULATOR_MAX_SCENARIOS} skenario aktif. Tidak ada
                perubahan ke BOM, biaya standar, persediaan, daftar harga, atau
                jurnal.
            </p>
        </div>
    );
}

function BasisSummary({ input }: { input: HppSimulatorScenarioInput }) {
    return (
        <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
                <div>
                    <p className="text-muted-foreground">BOM</p>
                    <p className="font-medium">{input.bom.name}</p>
                    <p className="break-all text-xs text-muted-foreground">
                        {input.bom.id}
                    </p>
                </div>
                <div>
                    <p className="text-muted-foreground">Output BOM</p>
                    <p className="font-medium tabular-nums">
                        {numberValue(input.bom.outputQuantity) ?? '—'}{' '}
                        {input.bom.primaryOutputUnit}
                    </p>
                </div>
                <div>
                    <p className="text-muted-foreground">Basis hasil</p>
                    <p className="font-medium">
                        per 1 {input.bom.primaryOutputUnit} utama
                    </p>
                </div>
            </div>
        </div>
    );
}

function MaterialEditor({
    material,
    idPrefix,
    metadata,
    onChange,
}: {
    material: HppSimulatorScenarioInput['materials'][number];
    idPrefix: string;
    metadata: HppPriceSimulatorMaterialDTO | null;
    onChange: (material: HppSimulatorScenarioInput['materials'][number]) => void;
}) {
    const costMetadata = material.unitCost.defaultSnapshot?.metadata;
    const source = costMetadata?.source ?? metadata?.costSource ?? 'missing';
    const candidates = costMetadata?.candidates ?? metadata?.costCandidates;
    const warnings = costMetadata?.warnings ?? metadata?.costWarnings ?? [];

    return (
        <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="font-medium">{material.name}</p>
                    <p className="text-xs text-muted-foreground">
                        Satuan bahan: {material.primaryUnit}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1">
                    <Badge variant={source === 'missing' ? 'destructive' : 'secondary'}>
                        {material.unitCost.mode === 'manual'
                            ? 'Override manual'
                            : (SOURCE_LABELS[source] ?? source)}
                    </Badge>
                    {material.unitCost.mode === 'manual' &&
                        material.unitCost.defaultSnapshot && (
                            <Badge variant="outline">
                                Default: {SOURCE_LABELS[source] ?? source}
                            </Badge>
                        )}
                    {isHppSimulatorManualZero(material.unitCost) && (
                        <Badge variant="outline">Rp0 manual</Badge>
                    )}
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                    id={`${idPrefix}-${material.id}-quantity`}
                    label={`Jumlah (${material.primaryUnit})`}
                    input={material.quantity}
                    onChange={(quantity) => onChange({ ...material, quantity })}
                />
                <NumberField
                    id={`${idPrefix}-${material.id}-scrap`}
                    label="Scrap (%)"
                    input={material.scrapPercentage}
                    onChange={(scrapPercentage) =>
                        onChange({ ...material, scrapPercentage })
                    }
                />
                <NumberField
                    id={`${idPrefix}-${material.id}-cost`}
                    label={`Biaya / ${material.primaryUnit}`}
                    input={material.unitCost}
                    onChange={(unitCost) => onChange({ ...material, unitCost })}
                />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 text-xs text-muted-foreground">
                    {warnings.map((warning) => (
                        <p key={warning} className="text-amber-700 dark:text-amber-400">
                            ⚠ {WARNING_LABELS[warning] ?? warning}
                        </p>
                    ))}
                    {candidates && (
                        <details>
                            <summary className="cursor-pointer font-medium text-foreground">
                                Lihat kandidat sumber biaya
                            </summary>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                                <li>
                                    Persediaan: {candidates.inventoryAverage.status}
                                    {candidates.inventoryAverage.reason
                                        ? ` (${candidates.inventoryAverage.reason})`
                                        : ''}
                                </li>
                                <li>
                                    Biaya standar: {candidates.standardCost.status}
                                    {candidates.standardCost.value !== null
                                        ? ` · ${formatRupiah(candidates.standardCost.value)}`
                                        : ''}
                                </li>
                                <li>
                                    Harga beli: {candidates.buyPrice.status}
                                    {candidates.buyPrice.value !== null
                                        ? ` · ${formatRupiah(candidates.buyPrice.value)}`
                                        : ''}
                                </li>
                            </ul>
                        </details>
                    )}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-10 self-start"
                    onClick={() =>
                        onChange({
                            ...material,
                            quantity: resetHppSimulatorNumber(material.quantity),
                            scrapPercentage: resetHppSimulatorNumber(
                                material.scrapPercentage,
                            ),
                            unitCost: resetHppSimulatorNumber(material.unitCost),
                        })
                    }
                >
                    <RotateCcw className="h-4 w-4" />
                    Reset default
                </Button>
            </div>
        </div>
    );
}

function hasManualZeroCost(
    component: HppSimulatorDynamicComponent,
): boolean {
    switch (component.formula) {
        case 'quantity-times-unit-cost':
            return isHppSimulatorManualZero(component.unitCost);
        case 'batch-cost-per-good-output':
            return isHppSimulatorManualZero(component.costPerBatchUnit);
        case 'fixed-per-output':
            return isHppSimulatorManualZero(component.costPerOutput);
        case 'percentage-of-pre-overhead':
            return false;
    }
}

function DynamicComponentEditor({
    component,
    idPrefix,
    onChange,
    onRemove,
}: {
    component: HppSimulatorDynamicComponent;
    idPrefix: string;
    onChange: (component: HppSimulatorDynamicComponent) => void;
    onRemove: () => void;
}) {
    const categoryEditor =
        component.formula === 'percentage-of-pre-overhead' ? null : (
            <select
                aria-label={`Kategori ${component.name}`}
                className="border-input bg-background min-h-10 rounded-md border px-2 text-sm"
                value={component.category}
                onChange={(event) =>
                    onChange({
                        ...component,
                        category: event.target.value as 'material' | 'conversion',
                    })
                }
            >
                <option value="conversion">Tenaga kerja / konversi</option>
                <option value="material">Material tambahan</option>
            </select>
        );

    return (
        <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor={`${idPrefix}-${component.id}-name`}>
                        Nama komponen
                    </Label>
                    <Input
                        id={`${idPrefix}-${component.id}-name`}
                        value={component.name}
                        onChange={(event) =>
                            onChange({ ...component, name: event.target.value })
                        }
                    />
                    <p className="text-xs text-muted-foreground">
                        {FORMULA_LABELS[component.formula]}
                    </p>
                    {hasManualZeroCost(component) && (
                        <Badge variant="outline">Rp0 manual</Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {categoryEditor}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-10 min-w-10"
                        aria-label={`Hapus ${component.name}`}
                        onClick={onRemove}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {component.formula === 'quantity-times-unit-cost' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField
                        id={`${idPrefix}-${component.id}-quantity`}
                        label="Jumlah"
                        input={component.quantity}
                        onChange={(quantity) => onChange({ ...component, quantity })}
                    />
                    <NumberField
                        id={`${idPrefix}-${component.id}-unit-cost`}
                        label="Harga satuan"
                        input={component.unitCost}
                        onChange={(unitCost) => onChange({ ...component, unitCost })}
                    />
                </div>
            )}
            {component.formula === 'batch-cost-per-good-output' && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <NumberField
                        id={`${idPrefix}-${component.id}-batch-quantity`}
                        label="Jumlah orang / unit batch"
                        input={component.batchQuantity}
                        onChange={(batchQuantity) =>
                            onChange({ ...component, batchQuantity })
                        }
                    />
                    <NumberField
                        id={`${idPrefix}-${component.id}-batch-cost`}
                        label="Upah / biaya per unit batch"
                        input={component.costPerBatchUnit}
                        onChange={(costPerBatchUnit) =>
                            onChange({ ...component, costPerBatchUnit })
                        }
                    />
                    <NumberField
                        id={`${idPrefix}-${component.id}-good-output`}
                        label="Hasil baik per shift / batch"
                        input={component.goodOutputQuantity}
                        onChange={(goodOutputQuantity) =>
                            onChange({ ...component, goodOutputQuantity })
                        }
                    />
                </div>
            )}
            {component.formula === 'fixed-per-output' && (
                <NumberField
                    id={`${idPrefix}-${component.id}-fixed`}
                    label="Biaya per unit output"
                    input={component.costPerOutput}
                    onChange={(costPerOutput) =>
                        onChange({ ...component, costPerOutput })
                    }
                />
            )}
            {component.formula === 'percentage-of-pre-overhead' && (
                <NumberField
                    id={`${idPrefix}-${component.id}-percentage`}
                    label="Persentase overhead (%)"
                    input={component.percentage}
                    onChange={(percentage) =>
                        onChange({ ...component, percentage })
                    }
                />
            )}
        </div>
    );
}

function AssumptionsEditor({
    scenario,
    onChange,
}: {
    scenario: HppSimulatorScenarioInput;
    onChange: (scenario: HppSimulatorScenarioInput) => void;
}) {
    return (
        <details className="rounded-lg border p-4" open>
            <summary className="cursor-pointer font-semibold">
                Asumsi output, margin & harga jual
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <NumberField
                    id={`${scenario.id}-output`}
                    label={`Output baik BOM (${scenario.bom.primaryOutputUnit})`}
                    input={scenario.bom.outputQuantity}
                    onChange={(outputQuantity) =>
                        onChange({
                            ...scenario,
                            bom: { ...scenario.bom, outputQuantity },
                        })
                    }
                />
                <NumberField
                    id={`${scenario.id}-margin`}
                    label="Target margin (%)"
                    input={scenario.targetMarginPercent}
                    onChange={(targetMarginPercent) =>
                        onChange({ ...scenario, targetMarginPercent })
                    }
                />
                <NumberField
                    id={`${scenario.id}-sale-price`}
                    label={`Harga jual / ${scenario.bom.primaryOutputUnit}`}
                    input={
                        scenario.salePrice ?? hppSimulatorManualNumber(null)
                    }
                    onChange={(salePrice) => onChange({ ...scenario, salePrice })}
                />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
                Margin berbeda dari markup. Harga target = HPP ÷ (1 − margin).
                Default 15% hanya asumsi simulator, bukan rekomendasi final.
            </p>
        </details>
    );
}

function NumberField({
    id,
    label,
    input,
    onChange,
}: {
    id: string;
    label: string;
    input: HppSimulatorNumberInput;
    onChange: (input: HppSimulatorNumberInput) => void;
}) {
    const value = numberValue(input);
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>{label}</Label>
                {input.defaultSnapshot && input.mode === 'manual' && (
                    <button
                        type="button"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                        onClick={() => onChange(resetHppSimulatorNumber(input))}
                    >
                        Reset
                    </button>
                )}
            </div>
            <Input
                id={id}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={value ?? ''}
                aria-invalid={value !== null && (!Number.isFinite(value) || value < 0)}
                onChange={(event) => {
                    const raw = event.target.value;
                    onChange(
                        manualValue(input, raw === '' ? null : Number(raw)),
                    );
                }}
            />
        </div>
    );
}

function ResultSummary({
    calculation,
}: {
    calculation: ScenarioCalculation;
}) {
    if (!calculation.result) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Perhitungan belum valid</AlertTitle>
                <AlertDescription>{calculation.error}</AlertDescription>
            </Alert>
        );
    }

    const result = calculation.result;
    const complete = result.status === 'complete';
    return (
        <section
            className="space-y-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4"
            aria-live="polite"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Hasil simulasi</h3>
                </div>
                <Badge variant={complete ? 'secondary' : 'destructive'}>
                    {complete ? 'Lengkap' : 'Belum lengkap'}
                </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <ResultMetric
                    label="Material / output"
                    value={formatRupiah(result.partialMaterialCostPerOutput)}
                />
                <ResultMetric
                    label="Konversi / output"
                    value={formatRupiah(result.partialConversionCostPerOutput)}
                />
                <ResultMetric
                    label="Overhead / output"
                    value={formatRupiah(result.partialOverheadCostPerOutput)}
                />
                <ResultMetric
                    label={`HPP / ${result.bom.primaryOutputUnit}`}
                    value={
                        complete
                            ? formatRupiah(result.hppPerOutput)
                            : `${formatRupiah(result.partialHppPerOutput)} (parsial)`
                    }
                    emphasized
                />
                <ResultMetric
                    label="Harga target berdasarkan margin"
                    value={
                        complete && result.targetPricePerOutput !== null
                            ? formatRupiah(result.targetPricePerOutput)
                            : '—'
                    }
                    note={
                        complete && result.targetPricePerOutput !== null
                            ? 'Simulasi, bukan rekomendasi final'
                            : 'Ditahan sampai semua biaya lengkap'
                    }
                />
                <ResultMetric
                    label="Laba / margin aktual"
                    value={
                        result.actualProfitPerOutput !== null &&
                        result.actualMarginPercent !== null
                            ? `${formatRupiah(result.actualProfitPerOutput)} · ${result.actualMarginPercent.toFixed(2)}%`
                            : '—'
                    }
                />
            </div>
            {!complete && (
                <p className="text-sm text-destructive">
                    Lengkapi: {result.missingInputs.join(', ')}. Subtotal parsial
                    tetap ditampilkan, tetapi harga target tidak dianggap final.
                </p>
            )}
        </section>
    );
}

function ResultMetric({
    label,
    value,
    note,
    emphasized = false,
}: {
    label: string;
    value: string;
    note?: string;
    emphasized?: boolean;
}) {
    return (
        <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
                className={
                    emphasized
                        ? 'mt-1 text-xl font-bold tabular-nums'
                        : 'mt-1 font-semibold tabular-nums'
                }
            >
                {value}
            </p>
            {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
    );
}

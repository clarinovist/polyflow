'use client';

import { saveOwnerHppWorkspace } from '@/actions/owner-hpp/owner-hpp';
import type { StoredOwnerHppWorkspace } from '@/actions/owner-hpp/owner-hpp-query';
import { calculateScenario } from '@/lib/owner-hpp/calculate-chain';
import type { ErpChainResult } from '@/lib/owner-hpp/erp-chain';
import { createExtrusionTemplateScenario } from '@/lib/owner-hpp/templates';
import {
    addStage,
    applyErpChain,
    createDefaultScenario,
    duplicateScenario,
    randomId,
    removeStage,
    updateStage,
} from '@/lib/owner-hpp/workspace-edit';
import {
    OWNER_HPP_LIMITS,
    parseOwnerHppWorkspace,
    type OwnerHppScenario,
    type OwnerHppStage,
    type OwnerHppWorkspace,
} from '@/lib/owner-hpp/workspace-schema';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AdvancedSection } from './AdvancedSection';
import { ErpPicker } from './ErpPicker';
import { downloadJson, readJsonFile } from './file-io';
import { ResultPanel } from './ResultPanel';
import { SaveDock } from './SaveDock';
import { ScenarioBar } from './ScenarioBar';
import { StageAdvanced } from './StageAdvanced';
import { StageEditor } from './StageEditor';
import { StageStrip } from './StageStrip';

const SAVED_AT_FORMAT = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
});

export function OwnerHppClient({
    initial,
}: {
    initial: StoredOwnerHppWorkspace;
}) {
    const [workspace, setWorkspace] = useState<OwnerHppWorkspace>(
        initial.workspace,
    );
    const [activeScenarioId, setActiveScenarioId] = useState(
        initial.workspace.scenarios[0].id,
    );
    const [activeStageId, setActiveStageId] = useState(
        initial.workspace.scenarios[0].stages[0].id,
    );
    const [savedJson, setSavedJson] = useState(() =>
        JSON.stringify(initial.workspace),
    );
    const [savedAt, setSavedAt] = useState(initial.updatedAt);
    const [isSaving, startSaving] = useTransition();

    const scenario =
        workspace.scenarios.find((entry) => entry.id === activeScenarioId) ??
        workspace.scenarios[0];
    const activeStage =
        scenario.stages.find((stage) => stage.id === activeStageId) ??
        scenario.stages[0];
    const result = useMemo(() => calculateScenario(scenario), [scenario]);
    const stageResults = useMemo(
        () => new Map(result.stages.map((stage) => [stage.stageId, stage])),
        [result],
    );
    const isDirty = useMemo(
        () => JSON.stringify(workspace) !== savedJson,
        [workspace, savedJson],
    );

    function patchScenario(
        update: (current: OwnerHppScenario) => OwnerHppScenario,
    ) {
        setWorkspace((previous) => ({
            ...previous,
            scenarios: previous.scenarios.map((entry) =>
                entry.id === scenario.id ? update(entry) : entry,
            ),
        }));
    }

    function selectScenario(next: OwnerHppScenario) {
        setActiveScenarioId(next.id);
        setActiveStageId(next.stages[0].id);
    }

    function appendScenario(next: OwnerHppScenario) {
        setWorkspace((previous) => ({
            ...previous,
            scenarios: [...previous.scenarios, next],
        }));
        selectScenario(next);
    }

    function handleAddStage() {
        const next = addStage(scenario, randomId);
        patchScenario(() => next);
        setActiveStageId(next.stages[next.stages.length - 1].id);
    }

    function handleStageChange(next: OwnerHppStage) {
        patchScenario((current) =>
            updateStage(current, activeStage.id, () => next),
        );
    }

    function handleDeleteScenario() {
        const remaining = workspace.scenarios.filter(
            (entry) => entry.id !== scenario.id,
        );
        if (remaining.length === 0) return;
        setWorkspace((previous) => ({ ...previous, scenarios: remaining }));
        selectScenario(remaining[0]);
    }

    function handleApplyChain(chain: ErpChainResult) {
        patchScenario((current) => applyErpChain(current, chain));
        setActiveStageId(chain.finalStageId);
        toast.success(
            `${chain.stages.length} tahap diisi dari ERP. Periksa harga lalu simpan.`,
        );
    }

    function handleSave() {
        const check = parseOwnerHppWorkspace(workspace);
        if (!check.success) {
            toast.error(check.error);
            return;
        }
        const snapshot = JSON.stringify(workspace);
        startSaving(async () => {
            const response = await saveOwnerHppWorkspace(workspace, savedAt);
            if (!response.success) {
                toast.error(response.error);
                return;
            }
            setSavedJson(snapshot);
            setSavedAt(response.data.updatedAt);
            toast.success('Tersimpan.');
        });
    }

    async function handleImport(file: File) {
        try {
            const parsed = parseOwnerHppWorkspace(await readJsonFile(file));
            if (!parsed.success) {
                toast.error(`Berkas tidak valid: ${parsed.error}`);
                return;
            }
            setWorkspace(parsed.data);
            selectScenario(parsed.data.scenarios[0]);
            toast.success('Diimpor. Tekan Simpan untuk menyimpannya.');
        } catch {
            toast.error('Berkas bukan JSON yang valid.');
        }
    }

    function statusText(): string {
        if (isDirty) return 'Belum disimpan';
        return savedAt
            ? `Tersimpan ${SAVED_AT_FORMAT.format(new Date(savedAt))}`
            : 'Belum pernah disimpan';
    }

    return (
        <main className="mx-auto w-full max-w-6xl space-y-4 px-3 pt-4 md:px-6 lg:pb-8">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-semibold">Kalkulator HPP</h1>
                <ErpPicker onApply={handleApplyChain} />
            </header>
            {initial.notice ? (
                <p
                    role="status"
                    className="rounded-md border p-3 text-sm text-muted-foreground"
                >
                    {initial.notice}
                </p>
            ) : null}

            <StageStrip
                scenario={scenario}
                result={result}
                activeStageId={activeStage.id}
                onSelect={setActiveStageId}
                onAdd={handleAddStage}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <StageEditor
                    scenario={scenario}
                    stage={activeStage}
                    result={stageResults.get(activeStage.id)}
                    stageResults={stageResults}
                    onChange={handleStageChange}
                />
                <ResultPanel
                    scenario={scenario}
                    result={result}
                    isDirty={isDirty}
                    isSaving={isSaving}
                    statusText={statusText()}
                    onSave={handleSave}
                    onSellPriceChange={(sellPrice) =>
                        patchScenario((current) => ({ ...current, sellPrice }))
                    }
                    onSelectStage={setActiveStageId}
                />
            </div>
            <AdvancedSection>
                <ScenarioBar
                    scenarios={workspace.scenarios}
                    activeId={scenario.id}
                    canAdd={
                        workspace.scenarios.length <
                        OWNER_HPP_LIMITS.maxScenarios
                    }
                    onSelect={(id) =>
                        selectScenario(
                            workspace.scenarios.find(
                                (entry) => entry.id === id,
                            ) ?? scenario,
                        )
                    }
                    onRename={(name) =>
                        patchScenario((current) => ({ ...current, name }))
                    }
                    onAdd={() =>
                        appendScenario(
                            createDefaultScenario(
                                randomId,
                                `Skenario ${workspace.scenarios.length + 1}`,
                            ),
                        )
                    }
                    onAddFromTemplate={() =>
                        appendScenario(
                            createExtrusionTemplateScenario(randomId),
                        )
                    }
                    onDuplicate={() =>
                        appendScenario(duplicateScenario(scenario, randomId))
                    }
                    onDelete={handleDeleteScenario}
                    onExport={() =>
                        downloadJson(
                            `kalkulator-hpp-${toBusinessDateString(new Date())}.json`,
                            workspace,
                        )
                    }
                    onImport={handleImport}
                />
                <StageAdvanced
                    scenario={scenario}
                    stage={activeStage}
                    result={stageResults.get(activeStage.id)}
                    canDelete={scenario.stages.length > 1}
                    onChange={handleStageChange}
                    onSetFinal={() =>
                        patchScenario((current) => ({
                            ...current,
                            finalStageId: activeStage.id,
                        }))
                    }
                    onDelete={() =>
                        patchScenario((current) =>
                            removeStage(current, activeStage.id),
                        )
                    }
                />
            </AdvancedSection>
            <SaveDock
                result={result}
                isDirty={isDirty}
                isSaving={isSaving}
                onSave={handleSave}
            />
        </main>
    );
}

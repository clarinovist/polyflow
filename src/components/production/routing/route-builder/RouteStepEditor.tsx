import type { Dispatch, SetStateAction } from 'react';
import type { NewStepForm, Option, RouteType } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import { ProcessPicker } from './ProcessPicker';
import { BomPicker } from './BomPicker';
import { SourceLocationPicker } from './SourceLocationPicker';
import { OutputLocationPicker } from './OutputLocationPicker';

type RouteStepEditorProps = {
    form: NewStepForm;
    setForm: Dispatch<SetStateAction<NewStepForm>>;
    selectedProcess: Option | null;
    setSelectedProcess: Dispatch<SetStateAction<Option | null>>;
    procSearch: string;
    setProcSearch: Dispatch<SetStateAction<string>>;
    processes: Option[];
    selectedBom: Option | null;
    setSelectedBom: Dispatch<SetStateAction<Option | null>>;
    bomSearch: string;
    setBomSearch: Dispatch<SetStateAction<string>>;
    boms: Option[];
    lastOutputVariantId: string | null;
    route: RouteType;
    selectedSrcLoc: Option | null;
    setSelectedSrcLoc: Dispatch<SetStateAction<Option | null>>;
    srcLocSearch: string;
    setSrcLocSearch: Dispatch<SetStateAction<string>>;
    srcLocs: Option[];
    isFirstStepTarget: boolean;
    selectedOutLoc: Option | null;
    setSelectedOutLoc: Dispatch<SetStateAction<Option | null>>;
    outLocSearch: string;
    setOutLocSearch: Dispatch<SetStateAction<string>>;
    outLocs: Option[];
    editingStepId: string | null;
    handleSaveStep: () => Promise<void>;
    handleCancelEdit: () => void;
};

export function RouteStepEditor({
    form,
    setForm,
    selectedProcess,
    setSelectedProcess,
    procSearch,
    setProcSearch,
    processes,
    selectedBom,
    setSelectedBom,
    bomSearch,
    setBomSearch,
    boms,
    lastOutputVariantId,
    route,
    selectedSrcLoc,
    setSelectedSrcLoc,
    srcLocSearch,
    setSrcLocSearch,
    srcLocs,
    isFirstStepTarget,
    selectedOutLoc,
    setSelectedOutLoc,
    outLocSearch,
    setOutLocSearch,
    outLocs,
    editingStepId,
    handleSaveStep,
    handleCancelEdit,
}: RouteStepEditorProps) {
    return (
        <div className="space-y-4">
            <Card className="sticky top-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                        {editingStepId ? 'Ubah Tahap' : 'Tambah Tahap'}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                        Tahap = Proses + BoM output + Lokasi. Output lokasi
                        wajib.
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
                                        stepCode: e.target.value.toUpperCase(),
                                    })
                                }
                                placeholder="MIX, EXTRUDE, REWIND, BALING"
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Nama Tahap</Label>
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

                    <ProcessPicker
                        form={form}
                        setForm={setForm}
                        selectedProcess={selectedProcess}
                        setSelectedProcess={setSelectedProcess}
                        procSearch={procSearch}
                        setProcSearch={setProcSearch}
                        processes={processes}
                    />

                    <BomPicker
                        form={form}
                        setForm={setForm}
                        selectedBom={selectedBom}
                        setSelectedBom={setSelectedBom}
                        bomSearch={bomSearch}
                        setBomSearch={setBomSearch}
                        boms={boms}
                        lastOutputVariantId={lastOutputVariantId}
                        route={route}
                    />

                    <div className="space-y-3 rounded border p-2.5 bg-muted/10">
                        <Label className="text-xs">Lokasi</Label>
                        <div className="space-y-2">
                            <SourceLocationPicker
                                form={form}
                                setForm={setForm}
                                selectedSrcLoc={selectedSrcLoc}
                                setSelectedSrcLoc={setSelectedSrcLoc}
                                srcLocSearch={srcLocSearch}
                                setSrcLocSearch={setSrcLocSearch}
                                srcLocs={srcLocs}
                                isFirstStepTarget={isFirstStepTarget}
                            />
                            <OutputLocationPicker
                                form={form}
                                setForm={setForm}
                                selectedOutLoc={selectedOutLoc}
                                setSelectedOutLoc={setSelectedOutLoc}
                                outLocSearch={outLocSearch}
                                setOutLocSearch={setOutLocSearch}
                                outLocs={outLocs}
                            />
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
                                        allowsPartialHandoff: e.target.checked,
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
                                        requiresQualityGate: e.target.checked,
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
                        Sistem cek: chain output-input, lokasi aktif/tidak
                        risky, mesin capable.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

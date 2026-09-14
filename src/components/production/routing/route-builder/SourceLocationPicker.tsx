import type { Dispatch, SetStateAction } from 'react';
import type { NewStepForm, Option } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type SourceLocationPickerProps = {
    form: NewStepForm;
    setForm: Dispatch<SetStateAction<NewStepForm>>;
    selectedSrcLoc: Option | null;
    setSelectedSrcLoc: Dispatch<SetStateAction<Option | null>>;
    srcLocSearch: string;
    setSrcLocSearch: Dispatch<SetStateAction<string>>;
    srcLocs: Option[];
    isFirstStepTarget: boolean;
};

export function SourceLocationPicker({
    form,
    setForm,
    selectedSrcLoc,
    setSelectedSrcLoc,
    srcLocSearch,
    setSrcLocSearch,
    srcLocs,
    isFirstStepTarget,
}: SourceLocationPickerProps) {
    return (
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
                            ({selectedSrcLoc.slug})
                        </span>
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => {
                            setSelectedSrcLoc(null);
                            setForm({
                                ...form,
                                materialSourceLocationId: '',
                            });
                        }}
                    >
                        Hapus
                    </Button>
                </div>
            ) : (
                <Badge variant="outline" className="text-[11px] font-normal">
                    {isFirstStepTarget
                        ? 'Stok umum (tidak spesifik lokasi)'
                        : 'Kosong = otomatis ikut lokasi output tahap sebelumnya'}
                </Badge>
            )}
            <Input
                value={srcLocSearch}
                onChange={(e) => setSrcLocSearch(e.target.value)}
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
                                materialSourceLocationId: l.id,
                            });
                            setSelectedSrcLoc(l);
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
    );
}

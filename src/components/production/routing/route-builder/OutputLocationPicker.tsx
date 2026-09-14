import type { Dispatch, SetStateAction } from 'react';
import type { NewStepForm, Option } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type OutputLocationPickerProps = {
    form: NewStepForm;
    setForm: Dispatch<SetStateAction<NewStepForm>>;
    selectedOutLoc: Option | null;
    setSelectedOutLoc: Dispatch<SetStateAction<Option | null>>;
    outLocSearch: string;
    setOutLocSearch: Dispatch<SetStateAction<string>>;
    outLocs: Option[];
};

export function OutputLocationPicker({
    form,
    setForm,
    selectedOutLoc,
    setSelectedOutLoc,
    outLocSearch,
    setOutLocSearch,
    outLocs,
}: OutputLocationPickerProps) {
    return (
        <div className="space-y-1">
            <div className="text-[11px] font-medium">
                Hasil tahap ditaruh ke (wajib)
            </div>
            {selectedOutLoc ? (
                <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between items-center">
                    <span>
                        {selectedOutLoc.name}{' '}
                        <span className="text-muted-foreground">
                            ({selectedOutLoc.slug})
                        </span>
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => {
                            setSelectedOutLoc(null);
                            setForm({
                                ...form,
                                outputLocationId: '',
                            });
                        }}
                    >
                        Ganti
                    </Button>
                </div>
            ) : (
                <div className="text-[11px] text-red-600 font-medium px-2 py-1 rounded border border-red-200 bg-red-50">
                    Belum dipilih — wajib sebelum publish
                </div>
            )}
            <Input
                value={outLocSearch}
                onChange={(e) => setOutLocSearch(e.target.value)}
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
                                outputLocationId: l.id,
                            });
                            setSelectedOutLoc(l);
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
    );
}

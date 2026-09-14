import type { Dispatch, SetStateAction } from 'react';
import type { NewStepForm, Option } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProcessPickerProps = {
    form: NewStepForm;
    setForm: Dispatch<SetStateAction<NewStepForm>>;
    selectedProcess: Option | null;
    setSelectedProcess: Dispatch<SetStateAction<Option | null>>;
    procSearch: string;
    setProcSearch: Dispatch<SetStateAction<string>>;
    processes: Option[];
};

export function ProcessPicker({
    form,
    setForm,
    selectedProcess,
    setSelectedProcess,
    procSearch,
    setProcSearch,
    processes,
}: ProcessPickerProps) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">Proses</Label>
            {selectedProcess && (
                <div className="text-xs p-2 rounded border bg-muted/50 flex justify-between items-center">
                    <span>
                        <strong>{selectedProcess.code}</strong>{' '}
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
                onChange={(e) => setProcSearch(e.target.value)}
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
                            Tidak ada proses. Tambah di Kelola Proses.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

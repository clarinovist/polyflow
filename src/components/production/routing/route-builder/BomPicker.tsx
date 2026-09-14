import type { Dispatch, SetStateAction } from 'react';
import type { NewStepForm, Option, RouteType } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type BomPickerProps = {
    form: NewStepForm;
    setForm: Dispatch<SetStateAction<NewStepForm>>;
    selectedBom: Option | null;
    setSelectedBom: Dispatch<SetStateAction<Option | null>>;
    bomSearch: string;
    setBomSearch: Dispatch<SetStateAction<string>>;
    boms: Option[];
    lastOutputVariantId: string | null;
    route: RouteType;
};

export function BomPicker({
    form,
    setForm,
    selectedBom,
    setSelectedBom,
    bomSearch,
    setBomSearch,
    boms,
    lastOutputVariantId,
    route,
}: BomPickerProps) {
    return (
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
                onChange={(e) => setBomSearch(e.target.value)}
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
                                {b.subtitle ? ` — ${b.subtitle}` : ''}
                            </div>
                        </button>
                    ))}
                    {boms.length === 0 && (
                        <div className="text-[11px] text-muted-foreground p-2 text-center">
                            Tidak ada BoM. Buat BoM dulu.
                        </div>
                    )}
                </div>
            )}
            <p className="text-[10px] text-muted-foreground">
                Pilih BoM yang output-nya = hasil tahap ini (bisa
                WIP/Intermediate). Tahap terakhir harus BoM dari{' '}
                {route.productVariant?.skuCode}.{' '}
                {lastOutputVariantId
                    ? 'BOM yang inputnya dari output tahap sebelumnya ditandai ✓ Nyambung.'
                    : ''}
            </p>
        </div>
    );
}

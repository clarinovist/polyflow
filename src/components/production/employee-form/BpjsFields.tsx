import type { EmployeePayType } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { FormStateProps } from './types';

type BpjsFieldsProps = FormStateProps;

export function BpjsFields({
    formData,
    setFormData,
}: BpjsFieldsProps) {
    return (
        <div className="rounded-md border border-white/10 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <Label className="text-xs font-semibold">
                        Peserta BPJS
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                        {formData.payType ===
                        ('MONTHLY' as EmployeePayType)
                            ? 'Dipotong di payslip bulanan.'
                            : 'Dipotong sekali sebulan di payroll minggu terakhir bulan berjalan.'}
                    </p>
                </div>
                <Switch
                    checked={formData.bpjsParticipant}
                    onCheckedChange={(v) =>
                        setFormData({
                            ...formData,
                            bpjsParticipant: v,
                        })
                    }
                />
            </div>
            {formData.bpjsParticipant && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Potongan Karyawan /bln (IDR)
                            </Label>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                value={
                                    formData.bpjsEmployeeDeduction
                                }
                                onChange={(e) => {
                                    const num = Number(
                                        e.target.value.replace(
                                            ',',
                                            '.',
                                        ),
                                    );
                                    setFormData({
                                        ...formData,
                                        bpjsEmployeeDeduction:
                                            isNaN(num)
                                                ? 0
                                                : num,
                                    });
                                }}
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Beban Perusahaan /bln (IDR)
                            </Label>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                value={
                                    formData.bpjsEmployerCost
                                }
                                onChange={(e) => {
                                    const num = Number(
                                        e.target.value.replace(
                                            ',',
                                            '.',
                                        ),
                                    );
                                    setFormData({
                                        ...formData,
                                        bpjsEmployerCost: isNaN(
                                            num,
                                        )
                                            ? 0
                                            : num,
                                    });
                                }}
                                className="h-9 bg-background/50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                No. Kartu BPJS Kesehatan
                            </Label>
                            <Input
                                value={formData.bpjsKesehatanNo}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        bpjsKesehatanNo:
                                            e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                No. BPJS Ketenagakerjaan
                            </Label>
                            <Input
                                value={
                                    formData.bpjsKetenagakerjaanNo
                                }
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        bpjsKetenagakerjaanNo:
                                            e.target.value,
                                    })
                                }
                                className="h-9 bg-background/50"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

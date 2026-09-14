import type { EmployeePayType } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils/utils';
import { AllowancePanel } from './AllowancePanel';
import { BpjsFields } from './BpjsFields';
import type { AllowancePanelProps, FormStateProps } from './types';

type CompensationFieldsProps = FormStateProps & AllowancePanelProps;

export function CompensationFields({
    initialData,
    formData,
    setFormData,
    allowances,
    setAllowances,
    allowancesLoading,
}: CompensationFieldsProps) {
    return (
        <>
            <div className="space-y-2">
                <Label className="text-sm font-semibold tracking-tight">
                    Skema Gaji
                </Label>
                <RadioGroup
                    value={formData.payType}
                    onValueChange={(v) =>
                        setFormData({
                            ...formData,
                            payType: v as EmployeePayType,
                        })
                    }
                    className="grid grid-cols-3 gap-2"
                >
                    <label
                        htmlFor="pay-daily"
                        className={cn(
                            'flex items-center gap-2 rounded-lg border p-3 cursor-pointer',
                            formData.payType === 'DAILY'
                                ? 'border-primary bg-primary/5'
                                : 'border-border',
                        )}
                    >
                        <RadioGroupItem
                            value="DAILY"
                            id="pay-daily"
                        />
                        <div>
                            <div className="text-sm font-medium">
                                Harian
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                Upah per hari + OT
                            </div>
                        </div>
                    </label>
                    <label
                        htmlFor="pay-piece"
                        className={cn(
                            'flex items-center gap-2 rounded-lg border p-3 cursor-pointer',
                            formData.payType === 'PIECE'
                                ? 'border-primary bg-primary/5'
                                : 'border-border',
                        )}
                    >
                        <RadioGroupItem
                            value="PIECE"
                            id="pay-piece"
                        />
                        <div>
                            <div className="text-sm font-medium">
                                Borongan /kg
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                Tarif per proses mesin
                            </div>
                        </div>
                    </label>
                    <label
                        htmlFor="pay-monthly"
                        className={cn(
                            'flex items-center gap-2 rounded-lg border p-3 cursor-pointer',
                            formData.payType ===
                                ('MONTHLY' as EmployeePayType)
                                ? 'border-primary bg-primary/5'
                                : 'border-border',
                        )}
                    >
                        <RadioGroupItem
                            value="MONTHLY"
                            id="pay-monthly"
                        />
                        <div>
                            <div className="text-sm font-medium">
                                Bulanan
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                Karyawan kantor
                            </div>
                        </div>
                    </label>
                </RadioGroup>
            </div>

            {formData.payType === ('MONTHLY' as EmployeePayType) ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                    <p className="text-sm font-semibold">
                        Gaji Bulanan — Karyawan Kantor
                    </p>
                    <div className="space-y-2">
                        <Label
                            htmlFor="monthlySalary"
                            className="text-xs font-semibold"
                        >
                            Gaji Pokok Bulanan (IDR)
                        </Label>
                        <Input
                            id="monthlySalary"
                            type="number"
                            min="0"
                            step="any"
                            value={formData.monthlySalary}
                            onChange={(e) => {
                                const num = Number(
                                    e.target.value.replace(
                                        ',',
                                        '.',
                                    ),
                                );
                                setFormData({
                                    ...formData,
                                    monthlySalary: isNaN(num)
                                        ? 0
                                        : num,
                                });
                            }}
                            placeholder="e.g. 2750000"
                            className="bg-background/50"
                        />
                    </div>
                    <AllowancePanel
                        initialData={initialData}
                        allowances={allowances}
                        setAllowances={setAllowances}
                        allowancesLoading={allowancesLoading}
                    />
                </div>
            ) : formData.payType === 'DAILY' ? (
                <>
                    <div className="space-y-2">
                        <Label
                            htmlFor="dailyRate"
                            className="text-sm font-semibold tracking-tight"
                        >
                            Upah Harian / Daily Rate (IDR)
                        </Label>
                        <Input
                            id="dailyRate"
                            type="number"
                            min="0"
                            step="any"
                            value={formData.dailyRate}
                            onChange={(e) => {
                                const normalized =
                                    e.target.value.replace(
                                        ',',
                                        '.',
                                    );
                                const num = Number(normalized);
                                setFormData({
                                    ...formData,
                                    dailyRate: isNaN(num) ? 0 : num,
                                });
                            }}
                            placeholder="e.g. 100000"
                            className="bg-background/50"
                        />
                        <p className="text-[11px] text-muted-foreground italic">
                            Upah standar untuk 1 hari kerja, dipakai
                            untuk perhitungan gaji dan costing.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label
                            htmlFor="overtimeHourlyRate"
                            className="text-sm font-semibold tracking-tight"
                        >
                            Tarif Lembur per Jam (IDR) — Opsional
                        </Label>
                        <Input
                            id="overtimeHourlyRate"
                            type="number"
                            min="0"
                            step="any"
                            value={formData.overtimeHourlyRate}
                            onChange={(e) => {
                                const normalized =
                                    e.target.value.replace(
                                        ',',
                                        '.',
                                    );
                                const num = Number(normalized);
                                setFormData({
                                    ...formData,
                                    overtimeHourlyRate: isNaN(num)
                                        ? 0
                                        : num,
                                });
                            }}
                            placeholder="e.g. 187500"
                            className="bg-background/50"
                        />
                        <p className="text-[11px] text-muted-foreground italic">
                            Kosongkan untuk otomatis = dailyRate ÷
                            jam kerja standar × 1,5.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label
                            htmlFor="standardDayHours"
                            className="text-sm font-semibold tracking-tight"
                        >
                            Jam Kerja Standar per Hari
                        </Label>
                        <Input
                            id="standardDayHours"
                            type="number"
                            min="1"
                            max="24"
                            step="0.5"
                            value={formData.standardDayHours}
                            onChange={(e) => {
                                const normalized =
                                    e.target.value.replace(
                                        ',',
                                        '.',
                                    );
                                const num = Number(normalized);
                                setFormData({
                                    ...formData,
                                    standardDayHours:
                                        isNaN(num) || num <= 0
                                            ? 8
                                            : num,
                                });
                            }}
                            placeholder="8"
                            className="bg-background/50"
                        />
                        <p className="text-[11px] text-muted-foreground italic">
                            Dasar perhitungan proporsional upah
                            harian (biasanya 8 jam).
                        </p>
                    </div>
                </>
            ) : (
                <div className="rounded-lg border border-dashed p-3 space-y-1 bg-muted/20">
                    <p className="text-sm font-medium">
                        Borongan mengikuti tarif proses mesin
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                        Rate /kg diatur di menu HRD → Tarif Borongan
                        (per tipe mesin). Absensi kiosk tetap wajib
                        — tanpa absen, output tidak dibayar. Tidak
                        ada OT.
                    </p>
                </div>
            )}

            {/* BPJS — tersedia untuk semua skema gaji */}
            <BpjsFields
                formData={formData}
                setFormData={setFormData}
            />
        </>
    );
}

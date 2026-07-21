'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Employee, EmployeeStatus, EmployeePayType } from '@prisma/client';
import { createEmployee, updateEmployee, generateNextEmployeeCode } from '@/actions/admin/employees';
import { getJobRoles, createJobRole } from '@/actions/admin/roles';
import { setEmployeePin, clearEmployeePin } from '@/actions/admin/attendance';
import { listEmployeeAllowances, replaceEmployeeAllowances } from '@/actions/hrd/payroll-monthly';
import { useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { productionComponentLabels } from '@/lib/labels';
import { MobileStickyActions, MobileStickyActionsSpacer } from '@/components/ui/mobile-sticky-actions';

type AllowanceRow = { id?: string; name: string; amount: string; isActive: boolean };

interface EmployeeFormProps {
    initialData?: Employee;
    hasPin?: boolean;
}

type PersonalData = {
    employmentStatus: 'PROBATION' | 'PERMANENT' | 'CONTRACT' | 'RESIGNED' | 'TERMINATED';
    joinDate: string;
    probationEndDate: string;
    contractEndDate: string;
    nik: string;
    npwp: string;
    birthDate: string;
    birthPlace: string;
    gender: 'MALE' | 'FEMALE' | '';
    maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | '';
    address: string;
    phone: string;
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelation: string;
};

const EMPTY_PERSONAL: PersonalData = {
    employmentStatus: 'PROBATION',
    joinDate: '', probationEndDate: '', contractEndDate: '',
    nik: '', npwp: '', birthDate: '', birthPlace: '',
    gender: '', maritalStatus: '',
    address: '', phone: '',
    bankName: '', bankAccountNo: '', bankAccountName: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
};

function toPersonalFromEmployee(e?: Employee): PersonalData {
    if (!e) return { ...EMPTY_PERSONAL };
    return {
        employmentStatus: (e.employmentStatus as PersonalData['employmentStatus']) || 'PROBATION',
        joinDate: e.joinDate ? new Date(e.joinDate).toISOString().slice(0, 10) : '',
        probationEndDate: e.probationEndDate ? new Date(e.probationEndDate).toISOString().slice(0, 10) : '',
        contractEndDate: e.contractEndDate ? new Date(e.contractEndDate).toISOString().slice(0, 10) : '',
        nik: e.nik || '', npwp: e.npwp || '',
        birthDate: e.birthDate ? new Date(e.birthDate).toISOString().slice(0, 10) : '',
        birthPlace: e.birthPlace || '',
        gender: (e.gender as PersonalData['gender']) || '',
        maritalStatus: (e.maritalStatus as PersonalData['maritalStatus']) || '',
        address: e.address || '', phone: e.phone || '',
        bankName: e.bankName || '', bankAccountNo: e.bankAccountNo || '', bankAccountName: e.bankAccountName || '',
        emergencyContactName: e.emergencyContactName || '',
        emergencyContactPhone: e.emergencyContactPhone || '',
        emergencyContactRelation: e.emergencyContactRelation || '',
    };
}

function toPersonalPayload(p: PersonalData) {
    return {
        employmentStatus: p.employmentStatus || undefined,
        joinDate: p.joinDate || undefined,
        probationEndDate: p.probationEndDate || undefined,
        contractEndDate: p.contractEndDate || undefined,
        nik: p.nik || undefined,
        npwp: p.npwp || undefined,
        birthDate: p.birthDate || undefined,
        birthPlace: p.birthPlace || undefined,
        gender: (p.gender || undefined) as 'MALE' | 'FEMALE' | undefined,
        maritalStatus: (p.maritalStatus || undefined) as 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | undefined,
        address: p.address || undefined,
        phone: p.phone || undefined,
        bankName: p.bankName || undefined,
        bankAccountNo: p.bankAccountNo || undefined,
        bankAccountName: p.bankAccountName || undefined,
        emergencyContactName: p.emergencyContactName || undefined,
        emergencyContactPhone: p.emergencyContactPhone || undefined,
        emergencyContactRelation: p.emergencyContactRelation || undefined,
    };
}

export function EmployeeForm({ initialData, hasPin: initialHasPin }: EmployeeFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
    const [openRole, setOpenRole] = useState(false);
    const [searchValue, setSearchValue] = useState('');

    // PIN state (edit mode only)
    const [hasPin, setHasPin] = useState(initialHasPin ?? false);
    const [pin, setPin] = useState('');
    const [pinLoading, setPinLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        code: initialData?.code || '',
        role: initialData?.role || '',
        status: initialData?.status || EmployeeStatus.ACTIVE,
        payType: (initialData?.payType as EmployeePayType) || EmployeePayType.DAILY,
        dailyRate: initialData?.dailyRate ? Number(initialData.dailyRate) : 0,
        overtimeHourlyRate: initialData?.overtimeHourlyRate ? Number(initialData.overtimeHourlyRate) : 0,
        standardDayHours: initialData?.standardDayHours ? Number(initialData.standardDayHours) : 8,
        // Fase 5: MONTHLY
        monthlySalary: initialData?.monthlySalary ? Number(initialData.monthlySalary) : 0,
        bpjsParticipant: initialData?.bpjsParticipant ?? false,
        bpjsEmployeeDeduction: initialData?.bpjsEmployeeDeduction ? Number(initialData.bpjsEmployeeDeduction) : 0,
        bpjsEmployerCost: initialData?.bpjsEmployerCost ? Number(initialData.bpjsEmployerCost) : 0,
        bpjsKesehatanNo: initialData?.bpjsKesehatanNo || '',
        bpjsKetenagakerjaanNo: initialData?.bpjsKetenagakerjaanNo || '',
    });

    // Fase 2: personal/HR master data
    const [personal, setPersonal] = useState<PersonalData>(() => toPersonalFromEmployee(initialData));
    const [showPersonal, setShowPersonal] = useState<boolean>(() => initialData?.payType === ('MONTHLY' as EmployeePayType) || false);

    // Fase 5: fixed allowances (edit mode only — need employee id)
    const [allowances, setAllowances] = useState<AllowanceRow[]>([]);
    const [allowancesLoading, setAllowancesLoading] = useState(false);

    useEffect(() => {
        const fetchRoles = async () => {
            const res = await getJobRoles();
            if (res.success && res.data) {
                setRoles(res.data);
            }
        };
        fetchRoles();

        const fetchAllowances = async () => {
            if (!initialData?.id) return;
            setAllowancesLoading(true);
            const res = await listEmployeeAllowances(initialData.id);
            if (res.success && res.data) {
                setAllowances(
                    res.data
                        .filter((a: { isActive: boolean }) => a.isActive)
                        .map((a: { id: string; name: string; amount: number | { toNumber(): number }; isActive: boolean }) => ({
                            id: a.id,
                            name: a.name,
                            amount: String(typeof a.amount === 'number' ? a.amount : a.amount.toNumber()),
                            isActive: a.isActive,
                        })),
                );
            }
            setAllowancesLoading(false);
        };
        fetchAllowances();

        const fetchCode = async () => {
            if (!initialData) {
                const res = await generateNextEmployeeCode();
                if (res.success && res.data) {
                    setFormData(prev => ({ ...prev, code: res.data }));
                }
            }
        };
        fetchCode();
    }, [initialData]);

    const handleCreateRole = async (name: string) => {
        const res = await createJobRole(name);
        if (res.success && res.data) {
            setRoles((prev) => [...prev, res.data]);
            setFormData({ ...formData, role: res.data.name });
            setOpenRole(false);
            setSearchValue('');
            toast.success('Peran pekerjaan berhasil dibuat.');
        } else {
            toast.error('Gagal membuat peran pekerjaan');
        }
    };

    const handleSetPin = async () => {
        if (!initialData) return;
        if (!/^\d{4,6}$/.test(pin)) {
            toast.error('PIN harus 4-6 digit angka');
            return;
        }
        setPinLoading(true);
        try {
            const res = await setEmployeePin(initialData.id, pin);
            if (res.success) {
                setHasPin(true);
                setPin('');
                toast.success('PIN berhasil disimpan');
            } else {
                toast.error(res.error || 'Gagal menyimpan PIN');
            }
        } catch {
            toast.error('Gagal menyimpan PIN');
        } finally {
            setPinLoading(false);
        }
    };

    const handleClearPin = async () => {
        if (!initialData) return;
        setPinLoading(true);
        try {
            const res = await clearEmployeePin(initialData.id);
            if (res.success) {
                setHasPin(false);
                setPin('');
                toast.success('PIN berhasil dihapus');
            } else {
                toast.error(res.error || 'Gagal menghapus PIN');
            }
        } catch {
            toast.error('Gagal menghapus PIN');
        } finally {
            setPinLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let res;
            if (initialData) {
                res = await updateEmployee(initialData.id, { ...formData, personal: toPersonalPayload(personal) });
            } else {
                res = await createEmployee({ ...formData, personal: toPersonalPayload(personal) });
            }

            if (res.success) {
                // Save allowances only for existing MONTHLY employees (need stable id).
                if (initialData && formData.payType === ('MONTHLY' as EmployeePayType)) {
                    const allowancePayload = allowances
                        .filter((a) => a.name.trim())
                        .map((a) => ({
                            id: a.id,
                            name: a.name.trim(),
                            amount: Number(a.amount) || 0,
                            isActive: true,
                        }));
                    const allRes = await replaceEmployeeAllowances(initialData.id, allowancePayload);
                    if (!allRes.success) {
                        toast.error(allRes.error || 'Gaji tersimpan, tapi tunjangan gagal disimpan');
                        setLoading(false);
                        return;
                    }
                }
                toast.success(initialData ? 'Data personel berhasil diperbarui.' : 'Personel baru berhasil ditambahkan.', {
                    description: `${formData.name} telah berhasil disimpan.`
                });
                router.push('/dashboard/employees');
                router.refresh();
            } else {
                toast.error('Kesalahan sistem', {
                    description: res.error || 'Gagal menyimpan data personel'
                });
                setLoading(false);
            }
        } catch (err) {
            console.error('[EMPLOYEE_FORM_SUBMIT_ERROR]', err);
            toast.error('Kegagalan tak terduga', {
                description: 'Gagal menyimpan. Silakan coba lagi.'
            });
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
            <div className="grid gap-6">
                <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold tracking-tight">Full Name</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="e.g. Budi Santoso"
                        className="bg-background/50"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="code" className="text-sm font-semibold tracking-tight">Worker Code (Auto-generated)</Label>
                    <Input
                        id="code"
                        value={formData.code}
                        readOnly
                        className="bg-muted text-muted-foreground cursor-not-allowed h-9 text-xs font-mono"
                        placeholder={productionComponentLabels.generating}
                    />
                </div>

                <div className="space-y-2 flex flex-col">
                    <Label className="text-sm font-semibold tracking-tight">Role</Label>
                    <Popover open={openRole} onOpenChange={setOpenRole}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openRole}
                                className="w-full justify-between bg-background/50 h-9"
                            >
                                {formData.role || 'Pilih peran...'}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                                <CommandInput
                                    placeholder={productionComponentLabels.searchRole}
                                    value={searchValue}
                                    onValueChange={setSearchValue}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        <div className="p-2 text-center text-sm text-muted-foreground">
                                            {searchValue ? (
                                                <>
                                                    <p className="mb-2">Tidak ada peran ditemukan.</p>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full h-8"
                                                        onClick={() => handleCreateRole(searchValue)}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" />
                                                        Add &quot;{searchValue}&quot;
                                                    </Button>
                                                </>
                                            ) : (
                                                <p>Tidak ada peran ditemukan.</p>
                                            )}
                                        </div>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {roles.map((role) => (
                                            <CommandItem
                                                key={role.id}
                                                value={role.name}
                                                onSelect={(currentValue: string) => {
                                                    setFormData({ ...formData, role: currentValue })
                                                    setOpenRole(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        formData.role === role.name ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {role.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="space-y-2">
                    <Label className="text-sm font-semibold tracking-tight">Skema Gaji</Label>
                    <RadioGroup
                        value={formData.payType}
                        onValueChange={(v) => setFormData({ ...formData, payType: v as EmployeePayType })}
                        className="grid grid-cols-3 gap-2"
                    >
                        <label htmlFor="pay-daily" className={cn(
                            "flex items-center gap-2 rounded-lg border p-3 cursor-pointer",
                            formData.payType === 'DAILY' ? "border-primary bg-primary/5" : "border-border"
                        )}>
                            <RadioGroupItem value="DAILY" id="pay-daily" />
                            <div>
                                <div className="text-sm font-medium">Harian</div>
                                <div className="text-[11px] text-muted-foreground">Upah per hari + OT</div>
                            </div>
                        </label>
                        <label htmlFor="pay-piece" className={cn(
                            "flex items-center gap-2 rounded-lg border p-3 cursor-pointer",
                            formData.payType === 'PIECE' ? "border-primary bg-primary/5" : "border-border"
                        )}>
                            <RadioGroupItem value="PIECE" id="pay-piece" />
                            <div>
                                <div className="text-sm font-medium">Borongan /kg</div>
                                <div className="text-[11px] text-muted-foreground">Tarif per proses mesin</div>
                            </div>
                        </label>
                        <label htmlFor="pay-monthly" className={cn(
                            "flex items-center gap-2 rounded-lg border p-3 cursor-pointer",
                            formData.payType === ('MONTHLY' as EmployeePayType) ? "border-primary bg-primary/5" : "border-border"
                        )}>
                            <RadioGroupItem value="MONTHLY" id="pay-monthly" />
                            <div>
                                <div className="text-sm font-medium">Bulanan</div>
                                <div className="text-[11px] text-muted-foreground">Karyawan kantor</div>
                            </div>
                        </label>
                    </RadioGroup>
                </div>

                {formData.payType === ('MONTHLY' as EmployeePayType) ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                    <p className="text-sm font-semibold">Gaji Bulanan — Karyawan Kantor</p>
                    <div className="space-y-2">
                        <Label htmlFor="monthlySalary" className="text-xs font-semibold">Gaji Pokok Bulanan (IDR)</Label>
                        <Input
                            id="monthlySalary"
                            type="number"
                            min="0"
                            step="any"
                            value={formData.monthlySalary}
                            onChange={(e) => {
                                const num = Number(e.target.value.replace(',', '.'));
                                setFormData({ ...formData, monthlySalary: isNaN(num) ? 0 : num });
                            }}
                            placeholder="e.g. 2750000"
                            className="bg-background/50"
                        />
                    </div>
                    <div className="space-y-2 border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold">Tunjangan tetap</p>
                                <p className="text-[10px] text-muted-foreground">
                                    {initialData
                                        ? 'Transport, makan, dll — ikut snapshot ke payslip saat generate.'
                                        : 'Simpan karyawan dulu, lalu edit ulang untuk menambah tunjangan.'}
                                </p>
                            </div>
                            {initialData && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() =>
                                        setAllowances((rows) => [
                                            ...rows,
                                            { name: '', amount: '', isActive: true },
                                        ])
                                    }
                                >
                                    <Plus className="h-3 w-3 mr-1" /> Tambah
                                </Button>
                            )}
                        </div>
                        {initialData && allowancesLoading && (
                            <p className="text-[11px] text-muted-foreground">Memuat tunjangan…</p>
                        )}
                        {initialData &&
                            allowances.map((row, idx) => (
                                <div key={row.id ?? `new-${idx}`} className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Nama</Label>
                                        <Input
                                            className="h-8 text-xs bg-background/50"
                                            value={row.name}
                                            placeholder="Tunjangan Transport"
                                            onChange={(e) => {
                                                const next = [...allowances];
                                                next[idx] = { ...row, name: e.target.value };
                                                setAllowances(next);
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Nominal</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            className="h-8 text-xs bg-background/50"
                                            value={row.amount}
                                            onChange={(e) => {
                                                const next = [...allowances];
                                                next[idx] = { ...row, amount: e.target.value };
                                                setAllowances(next);
                                            }}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-red-600"
                                        onClick={() => setAllowances(allowances.filter((_, i) => i !== idx))}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        {initialData && !allowancesLoading && allowances.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic">Belum ada tunjangan.</p>
                        )}
                    </div>
                </div>
                ) : formData.payType === 'DAILY' ? (
                <>
                <div className="space-y-2">
                    <Label htmlFor="dailyRate" className="text-sm font-semibold tracking-tight">Upah Harian / Daily Rate (IDR)</Label>
                    <Input
                        id="dailyRate"
                        type="number"
                        min="0"
                        step="any"
                        value={formData.dailyRate}
                        onChange={(e) => {
                                const normalized = e.target.value.replace(',', '.');
                                const num = Number(normalized);
                                setFormData({ ...formData, dailyRate: isNaN(num) ? 0 : num });
                            }}
                        placeholder="e.g. 100000"
                        className="bg-background/50"
                    />
                    <p className="text-[11px] text-muted-foreground italic">Upah standar untuk 1 hari kerja, dipakai untuk perhitungan gaji dan costing.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="overtimeHourlyRate" className="text-sm font-semibold tracking-tight">Tarif Lembur per Jam (IDR) — Opsional</Label>
                    <Input
                        id="overtimeHourlyRate"
                        type="number"
                        min="0"
                        step="any"
                        value={formData.overtimeHourlyRate}
                        onChange={(e) => {
                                const normalized = e.target.value.replace(',', '.');
                                const num = Number(normalized);
                                setFormData({ ...formData, overtimeHourlyRate: isNaN(num) ? 0 : num });
                            }}
                        placeholder="e.g. 187500"
                        className="bg-background/50"
                    />
                    <p className="text-[11px] text-muted-foreground italic">Kosongkan untuk otomatis = dailyRate ÷ jam kerja standar × 1,5.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="standardDayHours" className="text-sm font-semibold tracking-tight">Jam Kerja Standar per Hari</Label>
                    <Input
                        id="standardDayHours"
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        value={formData.standardDayHours}
                        onChange={(e) => {
                                const normalized = e.target.value.replace(',', '.');
                                const num = Number(normalized);
                                setFormData({ ...formData, standardDayHours: isNaN(num) || num <= 0 ? 8 : num });
                            }}
                        placeholder="8"
                        className="bg-background/50"
                    />
                    <p className="text-[11px] text-muted-foreground italic">Dasar perhitungan proporsional upah harian (biasanya 8 jam).</p>
                </div>
                </>
                ) : (
                <div className="rounded-lg border border-dashed p-3 space-y-1 bg-muted/20">
                    <p className="text-sm font-medium">Borongan mengikuti tarif proses mesin</p>
                    <p className="text-[11px] text-muted-foreground">
                        Rate /kg diatur di menu HRD → Tarif Borongan (per tipe mesin).
                        Absensi kiosk tetap wajib — tanpa absen, output tidak dibayar. Tidak ada OT.
                    </p>
                </div>
                )}

                {/* BPJS — tersedia untuk semua skema gaji */}
                <div className="rounded-md border border-white/10 bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <Label className="text-xs font-semibold">Peserta BPJS</Label>
                            <p className="text-[10px] text-muted-foreground">
                                {formData.payType === ('MONTHLY' as EmployeePayType)
                                    ? 'Dipotong di payslip bulanan.'
                                    : 'Dipotong sekali sebulan di payroll minggu terakhir bulan berjalan.'}
                            </p>
                        </div>
                        <Switch
                            checked={formData.bpjsParticipant}
                            onCheckedChange={(v) => setFormData({ ...formData, bpjsParticipant: v })}
                        />
                    </div>
                    {formData.bpjsParticipant && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Potongan Karyawan /bln (IDR)</Label>
                                    <Input
                                        type="number" min="0" step="any"
                                        value={formData.bpjsEmployeeDeduction}
                                        onChange={(e) => {
                                            const num = Number(e.target.value.replace(',', '.'));
                                            setFormData({ ...formData, bpjsEmployeeDeduction: isNaN(num) ? 0 : num });
                                        }}
                                        className="h-9 bg-background/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Beban Perusahaan /bln (IDR)</Label>
                                    <Input
                                        type="number" min="0" step="any"
                                        value={formData.bpjsEmployerCost}
                                        onChange={(e) => {
                                            const num = Number(e.target.value.replace(',', '.'));
                                            setFormData({ ...formData, bpjsEmployerCost: isNaN(num) ? 0 : num });
                                        }}
                                        className="h-9 bg-background/50"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">No. Kartu BPJS Kesehatan</Label>
                                    <Input
                                        value={formData.bpjsKesehatanNo}
                                        onChange={(e) => setFormData({ ...formData, bpjsKesehatanNo: e.target.value })}
                                        className="h-9 bg-background/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">No. BPJS Ketenagakerjaan</Label>
                                    <Input
                                        value={formData.bpjsKetenagakerjaanNo}
                                        onChange={(e) => setFormData({ ...formData, bpjsKetenagakerjaanNo: e.target.value })}
                                        className="h-9 bg-background/50"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded-lg border border-white/5">
                    <Switch
                        id="status"
                        checked={formData.status === 'ACTIVE'}
                        onCheckedChange={(checked) =>
                            setFormData({ ...formData, status: checked ? 'ACTIVE' : 'INACTIVE' })
                        }
                    />
                    <div className="flex flex-col">
                        <Label htmlFor="status" className="text-sm font-semibold tracking-tight cursor-pointer">
                            Active Status
                        </Label>
                        <span className="text-[10px] text-muted-foreground">Allow operator to be assigned to work orders.</span>
                    </div>
                </div>

                {/* Fase 2 — Data Pribadi & HR (opsional, collapsible) */}
                <div className="rounded-lg border border-dashed">
                    <button
                        type="button"
                        onClick={() => setShowPersonal(s => !s)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            {showPersonal ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <span className="text-sm font-semibold tracking-tight">Data Pribadi &amp; Kepegawaian</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">Opsional — isi bertahap</span>
                    </button>
                    {showPersonal && (
                        <div className="p-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Status Kepegawaian</Label>
                                    <Select
                                        value={personal.employmentStatus}
                                        onValueChange={(v) => setPersonal({ ...personal, employmentStatus: v as PersonalData['employmentStatus'] })}
                                    >
                                        <SelectTrigger className="h-9 bg-background/50"><SelectValue placeholder="Pilih status" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PROBATION">Probation</SelectItem>
                                            <SelectItem value="PERMANENT">Tetap</SelectItem>
                                            <SelectItem value="CONTRACT">Kontrak</SelectItem>
                                            <SelectItem value="RESIGNED">Resign</SelectItem>
                                            <SelectItem value="TERMINATED">PHK</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Tanggal Masuk</Label>
                                    <Input type="date" value={personal.joinDate} onChange={(e) => setPersonal({ ...personal, joinDate: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Akhir Probation</Label>
                                    <Input type="date" value={personal.probationEndDate} onChange={(e) => setPersonal({ ...personal, probationEndDate: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Akhir Kontrak</Label>
                                    <Input type="date" value={personal.contractEndDate} onChange={(e) => setPersonal({ ...personal, contractEndDate: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">NIK</Label>
                                    <Input value={personal.nik} onChange={(e) => setPersonal({ ...personal, nik: e.target.value })} maxLength={16} placeholder="16 digit" className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">NPWP</Label>
                                    <Input value={personal.npwp} onChange={(e) => setPersonal({ ...personal, npwp: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Tanggal Lahir</Label>
                                    <Input type="date" value={personal.birthDate} onChange={(e) => setPersonal({ ...personal, birthDate: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Tempat Lahir</Label>
                                    <Input value={personal.birthPlace} onChange={(e) => setPersonal({ ...personal, birthPlace: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Jenis Kelamin</Label>
                                    <Select value={personal.gender} onValueChange={(v) => setPersonal({ ...personal, gender: v as PersonalData['gender'] })}>
                                        <SelectTrigger className="h-9 bg-background/50"><SelectValue placeholder="Pilih" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MALE">Laki-laki</SelectItem>
                                            <SelectItem value="FEMALE">Perempuan</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Status Pernikahan</Label>
                                    <Select value={personal.maritalStatus} onValueChange={(v) => setPersonal({ ...personal, maritalStatus: v as PersonalData['maritalStatus'] })}>
                                        <SelectTrigger className="h-9 bg-background/50"><SelectValue placeholder="Pilih" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SINGLE">Belum Menikah</SelectItem>
                                            <SelectItem value="MARRIED">Menikah</SelectItem>
                                            <SelectItem value="DIVORCED">Cerai</SelectItem>
                                            <SelectItem value="WIDOWED">Janda/Duda</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Alamat</Label>
                                <Textarea value={personal.address} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} rows={2} className="bg-background/50" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">No. HP</Label>
                                    <Input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Bank</Label>
                                    <Input value={personal.bankName} onChange={(e) => setPersonal({ ...personal, bankName: e.target.value })} placeholder="BCA / Mandiri / dll" className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">No. Rekening</Label>
                                    <Input value={personal.bankAccountNo} onChange={(e) => setPersonal({ ...personal, bankAccountNo: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Nama Pemilik Rekening</Label>
                                    <Input value={personal.bankAccountName} onChange={(e) => setPersonal({ ...personal, bankAccountName: e.target.value })} className="h-9 bg-background/50" />
                                </div>
                            </div>
                            <div className="rounded-md bg-muted/20 p-2 space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">Kontak Darurat</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold">Nama</Label>
                                        <Input value={personal.emergencyContactName} onChange={(e) => setPersonal({ ...personal, emergencyContactName: e.target.value })} className="h-9 bg-background/50" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold">No. HP</Label>
                                        <Input value={personal.emergencyContactPhone} onChange={(e) => setPersonal({ ...personal, emergencyContactPhone: e.target.value })} className="h-9 bg-background/50" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Hubungan</Label>
                                    <Input value={personal.emergencyContactRelation} onChange={(e) => setPersonal({ ...personal, emergencyContactRelation: e.target.value })} placeholder="Istri / Orang Tua / dll" className="h-9 bg-background/50" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* PIN Management — edit mode only */}
                {initialData && (
                    <div className="space-y-3 bg-muted/30 p-3 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-sm font-semibold tracking-tight">PIN Kiosk</Label>
                                <p className="text-[10px] text-muted-foreground">4-6 digit untuk absensi di kiosk.</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${hasPin ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                                {hasPin ? 'Aktif' : 'Belum diset'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder={hasPin ? '••••' : '4-6 digit'}
                                maxLength={6}
                                className="h-9 text-sm font-mono tracking-widest"
                                autoComplete="off"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleSetPin}
                                disabled={pinLoading || !pin}
                                className="shrink-0"
                            >
                                {pinLoading ? '...' : 'Simpan'}
                            </Button>
                            {hasPin && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleClearPin}
                                    disabled={pinLoading}
                                    className="shrink-0 text-destructive hover:text-destructive"
                                >
                                    Hapus
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="hidden md:flex items-center gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                    Batal
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px]">
                    {loading ? 'Memproses...' : initialData ? 'Perbarui Pekerja' : 'Tambah Pekerja'}
                </Button>
            </div>

            <MobileStickyActionsSpacer />
            <MobileStickyActions>
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading} className="flex-1">
                    Batal
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Memproses...' : initialData ? 'Perbarui' : 'Tambah'}
                </Button>
            </MobileStickyActions>
        </form>
    );
}

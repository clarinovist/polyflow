'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Employee, EmployeeStatus, EmployeePayType } from '@prisma/client';
import {
    createEmployee,
    updateEmployee,
    generateNextEmployeeCode,
} from '@/actions/admin/employees';
import { getJobRoles, createJobRole } from '@/actions/admin/roles';
import { setEmployeePin, clearEmployeePin } from '@/actions/admin/attendance';
import {
    listEmployeeAllowances,
    replaceEmployeeAllowances,
} from '@/actions/hrd/payroll-monthly';
import { useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
    MobileStickyActions,
    MobileStickyActionsSpacer,
} from '@/components/ui/mobile-sticky-actions';
import { IdentityFields } from './employee-form/IdentityFields';
import { CompensationFields } from './employee-form/CompensationFields';
import { PersonalFields } from './employee-form/PersonalFields';
import { PinPanel } from './employee-form/PinPanel';
import type { AllowanceRow, PersonalData } from './employee-form/types';

interface EmployeeFormProps {
    initialData?: Employee;
    hasPin?: boolean;
    canEditSalary?: boolean;
}

const EMPTY_PERSONAL: PersonalData = {
    employmentStatus: 'PROBATION',
    joinDate: '',
    probationEndDate: '',
    contractEndDate: '',
    nik: '',
    npwp: '',
    birthDate: '',
    birthPlace: '',
    gender: '',
    maritalStatus: '',
    address: '',
    phone: '',
    bankName: '',
    bankAccountNo: '',
    bankAccountName: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
};

function toPersonalFromEmployee(e?: Employee): PersonalData {
    if (!e) return { ...EMPTY_PERSONAL };
    return {
        employmentStatus:
            (e.employmentStatus as PersonalData['employmentStatus']) ||
            'PROBATION',
        joinDate: e.joinDate
            ? new Date(e.joinDate).toISOString().slice(0, 10)
            : '',
        probationEndDate: e.probationEndDate
            ? new Date(e.probationEndDate).toISOString().slice(0, 10)
            : '',
        contractEndDate: e.contractEndDate
            ? new Date(e.contractEndDate).toISOString().slice(0, 10)
            : '',
        nik: e.nik || '',
        npwp: e.npwp || '',
        birthDate: e.birthDate
            ? new Date(e.birthDate).toISOString().slice(0, 10)
            : '',
        birthPlace: e.birthPlace || '',
        gender: (e.gender as PersonalData['gender']) || '',
        maritalStatus: (e.maritalStatus as PersonalData['maritalStatus']) || '',
        address: e.address || '',
        phone: e.phone || '',
        bankName: e.bankName || '',
        bankAccountNo: e.bankAccountNo || '',
        bankAccountName: e.bankAccountName || '',
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
        maritalStatus: (p.maritalStatus || undefined) as
            | 'SINGLE'
            | 'MARRIED'
            | 'DIVORCED'
            | 'WIDOWED'
            | undefined,
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

export function EmployeeForm({
    initialData,
    hasPin: initialHasPin,
    canEditSalary = true,
}: EmployeeFormProps) {
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
        payType:
            (initialData?.payType as EmployeePayType) || EmployeePayType.DAILY,
        dailyRate: initialData?.dailyRate ? Number(initialData.dailyRate) : 0,
        overtimeHourlyRate: initialData?.overtimeHourlyRate
            ? Number(initialData.overtimeHourlyRate)
            : 0,
        standardDayHours: initialData?.standardDayHours
            ? Number(initialData.standardDayHours)
            : 8,
        // Fase 5: MONTHLY
        monthlySalary: initialData?.monthlySalary
            ? Number(initialData.monthlySalary)
            : 0,
        bpjsParticipant: initialData?.bpjsParticipant ?? false,
        bpjsEmployeeDeduction: initialData?.bpjsEmployeeDeduction
            ? Number(initialData.bpjsEmployeeDeduction)
            : 0,
        bpjsEmployerCost: initialData?.bpjsEmployerCost
            ? Number(initialData.bpjsEmployerCost)
            : 0,
        bpjsKesehatanNo: initialData?.bpjsKesehatanNo || '',
        bpjsKetenagakerjaanNo: initialData?.bpjsKetenagakerjaanNo || '',
    });

    // Fase 2: personal/HR master data
    const [personal, setPersonal] = useState<PersonalData>(() =>
        toPersonalFromEmployee(initialData),
    );
    const [showPersonal, setShowPersonal] = useState<boolean>(
        () => initialData?.payType === ('MONTHLY' as EmployeePayType) || false,
    );

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
                        .map(
                            (a: {
                                id: string;
                                name: string;
                                amount: number | { toNumber(): number };
                                isActive: boolean;
                            }) => ({
                                id: a.id,
                                name: a.name,
                                amount: String(
                                    typeof a.amount === 'number'
                                        ? a.amount
                                        : a.amount.toNumber(),
                                ),
                                isActive: a.isActive,
                            }),
                        ),
                );
            }
            setAllowancesLoading(false);
        };
        fetchAllowances();

        const fetchCode = async () => {
            if (!initialData) {
                const res = await generateNextEmployeeCode();
                if (res.success && res.data) {
                    setFormData((prev) => ({ ...prev, code: res.data }));
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
                res = await updateEmployee(initialData.id, {
                    ...formData,
                    personal: toPersonalPayload(personal),
                });
            } else {
                res = await createEmployee({
                    ...formData,
                    personal: toPersonalPayload(personal),
                });
            }

            if (res.success) {
                // Save allowances only for existing MONTHLY employees (need stable id).
                if (
                    initialData &&
                    formData.payType === ('MONTHLY' as EmployeePayType)
                ) {
                    const allowancePayload = allowances
                        .filter((a) => a.name.trim())
                        .map((a) => ({
                            id: a.id,
                            name: a.name.trim(),
                            amount: Number(a.amount) || 0,
                            isActive: true,
                        }));
                    const allRes = await replaceEmployeeAllowances(
                        initialData.id,
                        allowancePayload,
                    );
                    if (!allRes.success) {
                        toast.error(
                            allRes.error ||
                                'Gaji tersimpan, tapi tunjangan gagal disimpan',
                        );
                        setLoading(false);
                        return;
                    }
                }
                toast.success(
                    initialData
                        ? 'Data personel berhasil diperbarui.'
                        : 'Personel baru berhasil ditambahkan.',
                    {
                        description: `${formData.name} telah berhasil disimpan.`,
                    },
                );
                router.push('/dashboard/employees');
                router.refresh();
            } else {
                toast.error('Kesalahan sistem', {
                    description: res.error || 'Gagal menyimpan data personel',
                });
                setLoading(false);
            }
        } catch (err) {
            console.error('[EMPLOYEE_FORM_SUBMIT_ERROR]', err);
            toast.error('Kegagalan tak terduga', {
                description: 'Gagal menyimpan. Silakan coba lagi.',
            });
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
            <div className="grid gap-6">
                <IdentityFields
                    formData={formData}
                    setFormData={setFormData}
                    roles={roles}
                    openRole={openRole}
                    setOpenRole={setOpenRole}
                    searchValue={searchValue}
                    setSearchValue={setSearchValue}
                    handleCreateRole={handleCreateRole}
                />

                {canEditSalary ? (
                    <CompensationFields
                        initialData={initialData}
                        formData={formData}
                        setFormData={setFormData}
                        allowances={allowances}
                        setAllowances={setAllowances}
                        allowancesLoading={allowancesLoading}
                    />
                ) : (
                    <div className="rounded-lg border border-dashed p-4 bg-muted/10 text-sm text-muted-foreground">
                        Data gaji &amp; BPJS dikelola oleh HRD/Finance. Anda
                        tidak memiliki akses untuk melihat atau mengubah
                        kompensasi karyawan ini.
                    </div>
                )}

                <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded-lg border border-white/5">
                    <Switch
                        id="status"
                        checked={formData.status === 'ACTIVE'}
                        onCheckedChange={(checked) =>
                            setFormData({
                                ...formData,
                                status: checked ? 'ACTIVE' : 'INACTIVE',
                            })
                        }
                    />
                    <div className="flex flex-col">
                        <Label
                            htmlFor="status"
                            className="text-sm font-semibold tracking-tight cursor-pointer"
                        >
                            Active Status
                        </Label>
                        <span className="text-[10px] text-muted-foreground">
                            Allow operator to be assigned to work orders.
                        </span>
                    </div>
                </div>

                {/* Fase 2 — Data Pribadi & HR (opsional, collapsible) */}
                <PersonalFields
                    personal={personal}
                    setPersonal={setPersonal}
                    showPersonal={showPersonal}
                    setShowPersonal={setShowPersonal}
                />

                {/* PIN Management — edit mode only */}
                {initialData && (
                    <PinPanel
                        hasPin={hasPin}
                        pin={pin}
                        setPin={setPin}
                        pinLoading={pinLoading}
                        handleSetPin={handleSetPin}
                        handleClearPin={handleClearPin}
                    />
                )}
            </div>

            <div className="hidden md:flex items-center gap-3 pt-4">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={loading}
                >
                    Batal
                </Button>
                <Button
                    type="submit"
                    disabled={loading}
                    className="min-w-[140px]"
                >
                    {loading
                        ? 'Memproses...'
                        : initialData
                          ? 'Perbarui Pekerja'
                          : 'Tambah Pekerja'}
                </Button>
            </div>

            <MobileStickyActionsSpacer />
            <MobileStickyActions>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={loading}
                    className="flex-1"
                >
                    Batal
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                    {loading
                        ? 'Memproses...'
                        : initialData
                          ? 'Perbarui'
                          : 'Tambah'}
                </Button>
            </MobileStickyActions>
        </form>
    );
}

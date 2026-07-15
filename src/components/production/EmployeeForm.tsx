'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Employee, EmployeeStatus } from '@prisma/client';
import { createEmployee, updateEmployee, generateNextEmployeeCode } from '@/actions/admin/employees';
import { getJobRoles, createJobRole } from '@/actions/admin/roles';
import { setEmployeePin, clearEmployeePin } from '@/actions/admin/attendance';
import { useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { productionComponentLabels } from '@/lib/labels';

interface EmployeeFormProps {
    initialData?: Employee;
    hasPin?: boolean;
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
        hourlyRate: initialData?.hourlyRate ? Number(initialData.hourlyRate) : 0,
    });

    useEffect(() => {
        const fetchRoles = async () => {
            const res = await getJobRoles();
            if (res.success && res.data) {
                setRoles(res.data);
            }
        };
        fetchRoles();

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
                res = await updateEmployee(initialData.id, formData);
            } else {
                res = await createEmployee(formData);
            }

            if (res.success) {
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
                    <Label htmlFor="hourlyRate" className="text-sm font-semibold tracking-tight">Hourly Rate (IDR)</Label>
                    <Input
                        id="hourlyRate"
                        type="number"
                        min="0"
                        step="1000"
                        value={formData.hourlyRate}
                        onChange={(e) => {
                                const normalized = e.target.value.replace(',', '.');
                                const num = Number(normalized);
                                setFormData({ ...formData, hourlyRate: isNaN(num) ? 0 : num });
                            }}
                        placeholder="e.g. 25000"
                        className="bg-background/50"
                    />
                    <p className="text-[11px] text-muted-foreground italic">Standard labor cost used for production costing.</p>
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

            <div className="flex items-center gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                    Batal
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px]">
                    {loading ? 'Memproses...' : initialData ? 'Perbarui Pekerja' : 'Tambah Pekerja'}
                </Button>
            </div>
        </form>
    );
}

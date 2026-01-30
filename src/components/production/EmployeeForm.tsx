'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Employee, EmployeeStatus } from '@prisma/client';
import { createEmployee, updateEmployee, generateNextEmployeeCode } from '@/actions/employees';
import { getJobRoles, createJobRole } from '@/actions/roles';
import { useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface EmployeeFormProps {
    initialData?: Employee;
}

export function EmployeeForm({ initialData }: EmployeeFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
    const [openRole, setOpenRole] = useState(false);
    const [searchValue, setSearchValue] = useState('');

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
                const code = await generateNextEmployeeCode();
                setFormData(prev => ({ ...prev, code }));
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
            toast.success('Job role created successfully');
        } else {
            toast.error('Failed to create job role');
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
                toast.success(initialData ? 'Personnel record updated' : 'Personnel onboarded', {
                    description: `${formData.name} has been saved successfully.`
                });
                router.push('/dashboard/employees');
                router.refresh();
            } else {
                toast.error('System Error', {
                    description: res.error || 'Failed to save personnel record'
                });
                setLoading(false);
            }
        } catch (err) {
            console.error('[EMPLOYEE_FORM_SUBMIT_ERROR]', err);
            toast.error('Unexpected failure', {
                description: 'An unexpected error occurred. Please try again later.'
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
                        placeholder="Generating..."
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
                                {formData.role || "Select role..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                                <CommandInput
                                    placeholder="Search role..."
                                    value={searchValue}
                                    onValueChange={setSearchValue}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        <div className="p-2 text-center text-sm text-muted-foreground">
                                            {searchValue ? (
                                                <>
                                                    <p className="mb-2">No role found.</p>
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
                                                <p>No role found.</p>
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
                        onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })}
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
            </div>

            <div className="flex items-center gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px]">
                    {loading ? 'Processing...' : initialData ? 'Update Worker' : 'Add Worker'}
                </Button>
            </div>
        </form>
    );
}

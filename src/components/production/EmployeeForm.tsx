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
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

interface EmployeeFormProps {
    initialData?: Employee;
}

export function EmployeeForm({ initialData }: EmployeeFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (initialData) {
                await updateEmployee(initialData.id, formData);
            } else {
                await createEmployee(formData);
            }
            router.push('/production/resources');
            router.refresh();
        } catch (_unused) {
            setError('Something went wrong. Please try again.');
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
            <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g. Budi Santoso"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="code">Worker Code (Auto-generated)</Label>
                <Input
                    id="code"
                    value={formData.code}
                    readOnly
                    className="bg-slate-100 text-slate-500"
                    placeholder="Generating..."
                />
            </div>

            <div className="space-y-2 flex flex-col">
                <Label>Role</Label>
                <Popover open={openRole} onOpenChange={setOpenRole}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openRole}
                            className="w-full justify-between"
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
                <Label htmlFor="hourlyRate">Hourly Rate (IDR)</Label>
                <Input
                    id="hourlyRate"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })}
                    placeholder="e.g. 25000"
                />
            </div>

            <div className="flex items-center space-x-2">
                <Switch
                    id="status"
                    checked={formData.status === 'ACTIVE'}
                    onCheckedChange={(checked) =>
                        setFormData({ ...formData, status: checked ? 'ACTIVE' : 'INACTIVE' })
                    }
                />
                <Label htmlFor="status">
                    Status: <Badge variant={formData.status === 'ACTIVE' ? 'default' : 'secondary'}>{formData.status}</Badge>
                </Label>
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : initialData ? 'Update Worker' : 'Add Worker'}
                </Button>
            </div>
        </form>
    );
}

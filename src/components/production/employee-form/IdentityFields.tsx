import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { productionComponentLabels } from '@/lib/labels';
import type { Dispatch, SetStateAction } from 'react';
import type { FormStateProps } from './types';

type IdentityFieldsProps = FormStateProps & {
    roles: { id: string; name: string }[];
    openRole: boolean;
    setOpenRole: Dispatch<SetStateAction<boolean>>;
    searchValue: string;
    setSearchValue: Dispatch<SetStateAction<string>>;
    handleCreateRole: (name: string) => Promise<void>;
};

export function IdentityFields({
    formData,
    setFormData,
    roles,
    openRole,
    setOpenRole,
    searchValue,
    setSearchValue,
    handleCreateRole,
}: IdentityFieldsProps) {
    return (
        <>
            <div className="space-y-2">
                <Label
                    htmlFor="name"
                    className="text-sm font-semibold tracking-tight"
                >
                    Full Name
                </Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    placeholder="e.g. Budi Santoso"
                    className="bg-background/50"
                />
            </div>

            <div className="space-y-2">
                <Label
                    htmlFor="code"
                    className="text-sm font-semibold tracking-tight"
                >
                    Worker Code (Auto-generated)
                </Label>
                <Input
                    id="code"
                    value={formData.code}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed h-9 text-xs font-mono"
                    placeholder={productionComponentLabels.generating}
                />
            </div>

            <div className="space-y-2 flex flex-col">
                <Label className="text-sm font-semibold tracking-tight">
                    Role
                </Label>
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
                                placeholder={
                                    productionComponentLabels.searchRole
                                }
                                value={searchValue}
                                onValueChange={setSearchValue}
                            />
                            <CommandList>
                                <CommandEmpty>
                                    <div className="p-2 text-center text-sm text-muted-foreground">
                                        {searchValue ? (
                                            <>
                                                <p className="mb-2">
                                                    Tidak ada peran
                                                    ditemukan.
                                                </p>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full h-8"
                                                    onClick={() =>
                                                        handleCreateRole(
                                                            searchValue,
                                                        )
                                                    }
                                                >
                                                    <Plus className="w-3 h-3 mr-1" />
                                                    Add &quot;{searchValue}
                                                    &quot;
                                                </Button>
                                            </>
                                        ) : (
                                            <p>
                                                Tidak ada peran ditemukan.
                                            </p>
                                        )}
                                    </div>
                                </CommandEmpty>
                                <CommandGroup>
                                    {roles.map((role) => (
                                        <CommandItem
                                            key={role.id}
                                            value={role.name}
                                            onSelect={(
                                                currentValue: string,
                                            ) => {
                                                setFormData({
                                                    ...formData,
                                                    role: currentValue,
                                                });
                                                setOpenRole(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    formData.role ===
                                                        role.name
                                                        ? 'opacity-100'
                                                        : 'opacity-0',
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
        </>
    );
}

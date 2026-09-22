'use client';

import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils/utils';

interface Props {
    id?: string;
    label: string;
    value: string;
    options: { id: string; name: string; description?: string }[];
    onChange: (id: string) => void;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
}

/** Search by display text, select by identity (duplicate product names remain distinct). */
export function ProductionOptionPicker({
    id,
    label,
    value,
    options,
    onChange,
    placeholder = 'Pilih…',
    disabled,
    invalid,
    describedBy,
}: Props) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const selected = options.find((option) => option.id === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    disabled={disabled}
                    className="h-auto min-h-11 w-full min-w-0 justify-between whitespace-normal text-left font-normal"
                >
                    <span
                        className={cn(
                            'min-w-0 break-words',
                            !selected && 'text-muted-foreground',
                        )}
                    >
                        {selected?.name || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
            >
                <Command>
                    <CommandInput
                        aria-label={`Cari ${label.toLowerCase()}`}
                        placeholder={`Cari ${label.toLowerCase()}…`}
                    />
                    <CommandList id={listId} className="max-h-64">
                        <CommandEmpty>
                            Tidak ada pilihan yang cocok.
                        </CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.id}
                                    value={option.id}
                                    keywords={[
                                        option.name,
                                        option.description || '',
                                    ]}
                                    className="min-h-11 items-start"
                                    onSelect={() => {
                                        onChange(option.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mt-0.5 h-4 w-4 shrink-0',
                                            value !== option.id && 'invisible',
                                        )}
                                    />
                                    <span className="min-w-0 break-words">
                                        {option.name}
                                        {option.description && (
                                            <span className="block text-xs text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

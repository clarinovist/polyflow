"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Calculator } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export interface AccountOption {
    id: string
    name: string
    code: string
    type?: string
}

interface AccountComboboxProps {
    accounts: AccountOption[]
    value: string
    onValueChange: (value: string) => void
    placeholder?: string
    emptyMessage?: string
    disabled?: boolean
    className?: string
}

export function AccountCombobox({
    accounts,
    value,
    onValueChange,
    placeholder = "Select account...",
    emptyMessage = "No account found.",
    disabled = false,
    className,
}: AccountComboboxProps) {
    const [open, setOpen] = React.useState(false)

    // Ensure we handle case where accounts might be loading or undefined
    const safeAccounts = accounts || []

    const selectedAccount = safeAccounts.find((p) => p.id === value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between font-normal min-w-0",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    {selectedAccount ? (
                        <span className="flex items-center gap-2 truncate min-w-0">
                            <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate flex-1 text-left">{selectedAccount.name}</span>
                            <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                                [{selectedAccount.code}]
                            </span>
                        </span>
                    ) : (
                        <span className="truncate">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command
                    filter={(value, search) => {
                        // Value in command is the id, so we find object first
                        const acc = safeAccounts.find((p) => p.id === value)
                        if (!acc) return 0

                        const searchLower = search.toLowerCase()
                        const nameMatch = acc.name.toLowerCase().includes(searchLower)
                        const codeMatch = acc.code.toLowerCase().includes(searchLower)
                        return nameMatch || codeMatch ? 1 : 0
                    }}
                >
                    <CommandInput placeholder="Search account..." />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {safeAccounts.map((account) => (
                                <CommandItem
                                    key={account.id}
                                    value={account.id}
                                    onSelect={(currentValue) => {
                                        onValueChange(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                    }}
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            value === account.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="truncate font-medium">{account.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {account.code} • {account.type}
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

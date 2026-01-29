"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Package } from "lucide-react"

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

export interface ProductOption {
    id: string
    name: string
    skuCode: string
    primaryUnit?: string
    isSuggested?: boolean
}

interface ProductComboboxProps {
    products: ProductOption[]
    value: string
    onValueChange: (value: string) => void
    placeholder?: string
    emptyMessage?: string
    disabled?: boolean
    className?: string
}

export function ProductCombobox({
    products,
    value,
    onValueChange,
    placeholder = "Select product...",
    emptyMessage = "No product found.",
    disabled = false,
    className,
}: ProductComboboxProps) {
    const [open, setOpen] = React.useState(false)

    const selectedProduct = products.find((p) => p.id === value)

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
                    {selectedProduct ? (
                        <span className="flex items-center gap-2 truncate min-w-0">
                            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate flex-1 text-left">{selectedProduct.name}</span>
                            <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                                [{selectedProduct.skuCode}]
                            </span>
                        </span>
                    ) : (
                        <span className="truncate">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                    filter={(value, search) => {
                        const product = products.find((p) => p.id === value)
                        if (!product) return 0
                        const searchLower = search.toLowerCase()
                        const nameMatch = product.name.toLowerCase().includes(searchLower)
                        const skuMatch = product.skuCode.toLowerCase().includes(searchLower)
                        return nameMatch || skuMatch ? 1 : 0
                    }}
                >
                    <CommandInput placeholder="Search product..." />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup heading={products.some(p => p.isSuggested) ? "Suggestions" : undefined}>
                            {products.filter(p => p.isSuggested).map((product) => (
                                <CommandItem
                                    key={product.id}
                                    value={product.id}
                                    onSelect={(currentValue) => {
                                        onValueChange(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Check
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            value === product.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate font-medium">{product.name}</span>
                                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Smart</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {product.skuCode}
                                            {product.primaryUnit && ` • ${product.primaryUnit}`}
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup heading={products.some(p => p.isSuggested) ? "All Materials" : undefined}>
                            {products.filter(p => !p.isSuggested).map((product) => (
                                <CommandItem
                                    key={product.id}
                                    value={product.id}
                                    onSelect={(currentValue) => {
                                        onValueChange(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Check
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            value === product.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="truncate font-medium">{product.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {product.skuCode}
                                            {product.primaryUnit && ` • ${product.primaryUnit}`}
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

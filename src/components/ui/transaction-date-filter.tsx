"use client"

import * as React from "react"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, isSameDay } from "date-fns"
import { id } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

interface TransactionDateFilterProps {
    className?: string
    date?: DateRange
    onDateChange?: (date: DateRange | undefined) => void
    defaultPreset?: 'today' | 'this_week' | 'this_month' | 'all'
    showAll?: boolean
    align?: "start" | "center" | "end"
}

export function TransactionDateFilter({
    className,
    date,
    onDateChange,
    defaultPreset,
    showAll = true,
    align = "start"
}: TransactionDateFilterProps) {
    const [isOpen, setIsOpen] = React.useState(false)

    // Helper to check active preset
    const getActivePreset = React.useCallback(() => {
        if (!date?.from) return showAll ? 'all' : undefined

        const now = new Date()
        const todayStart = startOfDay(now)
        const todayEnd = endOfDay(now)
        const weekStart = startOfWeek(now, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)

        if (date.to && isSameDay(date.from, todayStart) && isSameDay(date.to, todayEnd)) return 'today'
        if (date.to && isSameDay(date.from, weekStart) && isSameDay(date.to, weekEnd)) return 'this_week'
        if (date.to && isSameDay(date.from, monthStart) && isSameDay(date.to, monthEnd)) return 'this_month'

        return 'custom'
    }, [date, showAll])

    const activePreset = getActivePreset()

    const handlePreset = (preset: 'today' | 'this_week' | 'this_month' | 'all') => {
        const now = new Date()
        switch (preset) {
            case 'today':
                onDateChange?.({ from: startOfDay(now), to: endOfDay(now) })
                setIsOpen(false)
                break
            case 'this_week':
                onDateChange?.({ from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) })
                setIsOpen(false)
                break
            case 'this_month':
                onDateChange?.({ from: startOfMonth(now), to: endOfMonth(now) })
                setIsOpen(false)
                break
            case 'all':
                onDateChange?.(undefined)
                setIsOpen(false)
                break
        }
    }

    // Apply default preset on mount if date is undefined and defaultPreset is provided
    React.useEffect(() => {
        if (!date?.from && defaultPreset) {
            handlePreset(defaultPreset)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-fit justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                                isSameDay(date.from, date.to) ? (
                                    format(date.from, "PPP", { locale: id })
                                ) : (
                                    <>
                                        {format(date.from, "LLL dd, y", { locale: id })} -{" "}
                                        {format(date.to, "LLL dd, y", { locale: id })}
                                    </>
                                )
                            ) : (
                                format(date.from, "MMM dd, y", { locale: id })
                            )
                        ) : (
                            <span>Semua Waktu</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align={align}>
                    <div className="flex flex-col p-2 gap-2">
                        <div className="flex items-center justify-between gap-2 px-1">
                            <span className="text-xs font-semibold text-muted-foreground">Pilih Filter</span>
                            {showAll && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={() => handlePreset('all')}
                                >
                                    Reset
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-1 justify-between">
                            <Button
                                variant={activePreset === 'today' ? "secondary" : "ghost"}
                                size="sm"
                                className="flex-1 text-xs"
                                onClick={() => handlePreset('today')}
                            >
                                Hari Ini
                            </Button>
                            <Button
                                variant={activePreset === 'this_week' ? "secondary" : "ghost"}
                                size="sm"
                                className="flex-1 text-xs"
                                onClick={() => handlePreset('this_week')}
                            >
                                Minggu Ini
                            </Button>
                            <Button
                                variant={activePreset === 'this_month' ? "secondary" : "ghost"}
                                size="sm"
                                className="flex-1 text-xs"
                                onClick={() => handlePreset('this_month')}
                            >
                                Bulan Ini
                            </Button>
                        </div>
                    </div>
                    <Separator />
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={onDateChange}
                        numberOfMonths={2}
                        locale={id}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}

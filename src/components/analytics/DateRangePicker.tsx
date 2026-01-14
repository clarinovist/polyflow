"use client"

import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"

interface DateRangePickerProps {
    from: Date | string
    to: Date | string
    className?: string
}

export function DateRangePicker({
    from,
    to,
    className,
}: DateRangePickerProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const handleValueChange = (value: string) => {
        const now = new Date()
        let newFrom: Date | undefined
        let newTo: Date | undefined

        switch (value) {
            case 'today':
                newFrom = startOfDay(now)
                newTo = endOfDay(now)
                break
            case 'yesterday':
                const yesterday = subDays(now, 1)
                newFrom = startOfDay(yesterday)
                newTo = endOfDay(yesterday)
                break
            case 'last7':
                newFrom = subDays(now, 7)
                newTo = now
                break
            case 'last30':
                newFrom = subDays(now, 30)
                newTo = now
                break
            case 'thisMonth':
                newFrom = startOfMonth(now)
                newTo = endOfMonth(now)
                break
            case 'lastMonth':
                const lastMonth = subMonths(now, 1)
                newFrom = startOfMonth(lastMonth)
                newTo = endOfMonth(lastMonth)
                break
            default:
                break
        }

        if (newFrom && newTo) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('from', newFrom.toISOString())
            params.set('to', newTo.toISOString())
            router.push(`?${params.toString()}`, { scroll: false })
        }
    }

    // Determine current preset value based on props (optional but good for UI state)
    // For now, we can leave it uncontrolled or try to match. 
    // Let's use a placeholder "Select Period" which is simpler than reverse-matching dates.

    return (
        <div className={cn("grid gap-2", className)}>
            <Select onValueChange={handleValueChange}>
                <SelectTrigger className="w-[200px]">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7">Last 7 Days</SelectItem>
                    <SelectItem value="last30">Last 30 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

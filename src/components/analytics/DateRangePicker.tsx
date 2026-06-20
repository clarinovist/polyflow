"use client"

import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"
import { analyticsLabels } from "@/lib/labels"

interface DateRangePickerProps {
    from: Date | string
    to: Date | string
    className?: string
}

export function DateRangePicker({
    from: _from,
    to: _to,
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

    return (
        <div className={cn("grid gap-2", className)}>
            <Select onValueChange={handleValueChange}>
                <SelectTrigger className="w-[200px]">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={analyticsLabels.selectPeriod} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="today">{analyticsLabels.today}</SelectItem>
                    <SelectItem value="yesterday">{analyticsLabels.yesterday}</SelectItem>
                    <SelectItem value="last7">{analyticsLabels.last7Days}</SelectItem>
                    <SelectItem value="last30">{analyticsLabels.last30Days}</SelectItem>
                    <SelectItem value="thisMonth">{analyticsLabels.thisMonth}</SelectItem>
                    <SelectItem value="lastMonth">{analyticsLabels.lastMonth}</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

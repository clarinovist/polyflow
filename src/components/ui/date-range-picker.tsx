"use client"

import * as React from "react"
import { DateRange } from "react-day-picker"
import { TransactionDateFilter } from "@/components/ui/transaction-date-filter"

interface DatePickerWithRangeProps {
    className?: string
    date?: DateRange
    onDateChange?: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
    className,
    date,
    onDateChange,
}: DatePickerWithRangeProps) {
    return (
        <TransactionDateFilter
            className={className}
            date={date}
            onDateChange={onDateChange}
            defaultPreset="this_month" // Default behavior for reports usually
        />
    )
}

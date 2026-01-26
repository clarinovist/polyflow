"use client"

import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    const defaultClassNames = getDefaultClassNames();

    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                ...defaultClassNames,
                months: cn(defaultClassNames.months, "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0"),
                month: cn(defaultClassNames.month, "space-y-4"),
                month_caption: cn(defaultClassNames.month_caption, "flex justify-center pt-1 relative items-center"),
                caption_label: cn(defaultClassNames.caption_label, "text-sm font-medium", props.captionLayout === "dropdown" && "hidden"),
                nav: cn(defaultClassNames.nav, "space-x-1 flex items-center"),
                button_previous: cn(
                    defaultClassNames.button_previous,
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
                ),
                button_next: cn(
                    defaultClassNames.button_next,
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
                ),
                month_grid: cn(defaultClassNames.month_grid, "w-full border-collapse space-y-1"),
                weekdays: cn(defaultClassNames.weekdays, "flex"),
                weekday: cn(defaultClassNames.weekday, "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]"),
                week: cn(defaultClassNames.week, "flex w-full mt-2"),
                day: cn(
                    defaultClassNames.day,
                    "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20"
                ),
                day_button: cn(
                    defaultClassNames.day_button,
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                ),
                range_end: "day-range-end",
                selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                today: "bg-accent text-accent-foreground",
                outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                disabled: "text-muted-foreground opacity-50",
                range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                hidden: "invisible",
                dropdown: cn(defaultClassNames.dropdown, "px-2 py-1 rounded-md border bg-background text-sm font-medium"),
                dropdown_root: cn(defaultClassNames.dropdown_root, "relative inline-flex items-center"),
                dropdowns: "flex items-center gap-2",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, ...props }) => {
                    const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
                    return <Icon className="h-4 w-4" {...props} />;
                },
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }

"use client"

import React from 'react'
import { DateRangePicker } from './DateRangePicker'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import Papa from 'papaparse'
import { QualityControlSummary } from '@/types/analytics'

interface AnalyticsToolbarProps {
    dateRange: { from: Date | string; to: Date | string }
    data: {
        productionRealization: unknown[]
        materialVariance: unknown[]
        machinePerformance: unknown[]
        operatorLeaderboard: unknown[]
        qualitySummary: QualityControlSummary
    }
    activeTab: string
}

export function AnalyticsToolbar({ dateRange, data, activeTab }: AnalyticsToolbarProps) {

    const handleExport = () => {
        let exportData: unknown[] = []
        let filename = `analytics-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`

        // Select data based on active tab
        switch (activeTab) {
            case 'production':
                exportData = data.productionRealization
                break
            case 'materials':
                exportData = data.materialVariance
                break
            case 'machines':
                exportData = data.machinePerformance
                break
            case 'operators':
                exportData = data.operatorLeaderboard
                break
            case 'quality':
                // Quality summary is nested. We can export inspections or scrap.
                // Let's flatten straightforwardly or export inspections
                if (data.qualitySummary) {
                    const { scrapByReason } = data.qualitySummary
                    // Provide a combined view or just inspections?
                    // Let's export scrap reason mix as it is list-based
                    exportData = scrapByReason || []
                    filename = `analytics-quality-scrap-${new Date().toISOString().split('T')[0]}.csv`
                }
                break
            default:
                exportData = []
        }

        if (!exportData || exportData.length === 0) {
            alert("No data to export for this view.")
            return
        }

        const csv = Papa.unparse(exportData)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', filename)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className="flex items-center gap-3">
            <DateRangePicker from={dateRange.from} to={dateRange.to} />
            <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
            </Button>
        </div>
    )
}

'use client';

import SpecialProductionForm from '../SpecialProductionForm';
import type { DailyReportFormProps } from '../daily-report-entry';

export default function HdProductionForm(props: DailyReportFormProps) {
    return <SpecialProductionForm variant="hd" {...props} />;
}

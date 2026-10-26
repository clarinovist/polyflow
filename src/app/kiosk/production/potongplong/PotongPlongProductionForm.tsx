'use client';

import SpecialProductionForm from '../SpecialProductionForm';
import type { DailyReportFormProps } from '../daily-report-entry';

export default function PotongPlongProductionForm(props: DailyReportFormProps) {
    return <SpecialProductionForm variant="potongplong" {...props} />;
}

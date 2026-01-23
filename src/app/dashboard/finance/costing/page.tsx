import { Metadata } from 'next';
import { CostingDashboardClient } from './components/CostingDashboardClient';

export const metadata: Metadata = {
    title: 'Cost Accounting | PolyFlow Finance',
    description: 'Manufacturing Cost Analysis and Reports'
};

export default function CostingDashboardPage() {
    return <CostingDashboardClient />;
}

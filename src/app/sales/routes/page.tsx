import 'leaflet/dist/leaflet.css';
import { getRouteWeekBoard } from '@/actions/sales/route-plans';
import { getCustomers } from '@/actions/sales/customer';
import { getSalesTeamAction } from '@/actions/sales/sales-team';
import {
    WeeklyRouteBoard,
    type Rep,
    type RouteCustomer,
    type RouteWeekBoard,
} from '@/components/sales/routes/WeeklyRouteBoard';
import { PageHeader } from '@/components/ui/page-header';
import { serializeData } from '@/lib/utils/utils';
import { getMondayOfWeek } from '@/lib/sales/route-compliance';

const EMPTY_BOARD: RouteWeekBoard = {
    days: [],
    coverage: { activeCustomers: 0, scheduledThisWeek: 0 },
    overdue: [],
    conflicts: [],
    lastVisits: [],
};

export default async function SalesRoutesPage() {
    const weekStart = getMondayOfWeek(new Date()).toISOString().split('T')[0];

    const [teamRes, customersRes] = await Promise.all([
        getSalesTeamAction(),
        getCustomers(),
    ]);

    const team: Rep[] =
        teamRes?.success && teamRes.data ? (teamRes.data as Rep[]) : [];
    const customers: RouteCustomer[] =
        customersRes?.success && customersRes.data
            ? serializeData(customersRes.data)
            : [];

    const userIds = team.map((t) => t.id);
    const boardRes = await getRouteWeekBoard(weekStart, userIds);
    const initialBoard: RouteWeekBoard =
        boardRes?.success && boardRes.data
            ? (boardRes.data as RouteWeekBoard)
            : EMPTY_BOARD;

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <PageHeader
                title="Papan Rute Mingguan"
                description="Rencanakan rute kunjungan mingguan untuk semua sales rep, pantau cakupan dan kepatuhan kunjungan."
            />
            <WeeklyRouteBoard
                team={team}
                customers={customers}
                initialWeekStart={weekStart}
                initialBoard={initialBoard}
            />
        </div>
    );
}

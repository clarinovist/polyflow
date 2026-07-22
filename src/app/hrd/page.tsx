import { getHrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import { HrdShiftBoardComponent } from '@/components/hrd/HrdShiftBoard';

export const dynamic = 'force-dynamic';

export default async function HrdDashboardPage() {
  const boardRes = await getHrdShiftBoard().catch(() => null);
  const board = boardRes?.success && boardRes.data
    ? boardRes.data
    : {
        counts: {
          presentToday: 0,
          leavePending: 0,
          loanOutstanding: 0,
          loanActiveCount: 0,
          openPayrollPeriods: 0,
          bpjsParticipants: 0,
          hrAlertsUnread: 0,
          absentYesterday: 0,
          periodsNeedGenerate: 0,
        },
        attention: {
          pendingLeaves: [],
          hrAlerts: [],
          openPeriods: [],
          absentYesterday: [],
        },
        today: new Date().toISOString().slice(0, 10),
      };

  return <HrdShiftBoardComponent data={board} />;
}

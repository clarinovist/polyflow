import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/core/prisma';
import { hasAnyRole } from '@/lib/auth/roles';
import { AlertTriangle, Bell, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { ScanRemindersButton } from '@/components/hrd/ScanRemindersButton';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default async function AlertsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) redirect('/dashboard');

  const userId = session.user.id;

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: ['HRD_PROBATION_ENDING', 'HRD_CONTRACT_EXPIRING'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const fmt = (d: Date) => format(d, 'dd MMM yyyy, HH:mm', { locale: id });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">Peringatan HR</h1>
            <p className="text-sm text-muted-foreground">Kontrak &amp; probation yang habis segera</p>
          </div>
        </div>
        <ScanRemindersButton />
      </div>

      {notifications.length === 0 ? (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Tidak ada peringatan saat ini.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="bg-card rounded-xl border p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
              <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{n.title}</span>
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{fmt(n.createdAt)}</p>
              </div>
              {n.link && (
                <Link href={n.link} className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1">
                  Lihat <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

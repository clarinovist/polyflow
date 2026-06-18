import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

export default async function SupportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">Support Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Virtual CS Polyflow</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Tanyakan data operasional pabrik dan panduan SOP pemakaian. Untuk perubahan data, lakukan langsung lewat menu Polyflow.
          </p>
        </div>

        <PolyflowChatPanel embedded />
      </div>
    </div>
  );
}

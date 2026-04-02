import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

export default async function SupportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Support Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Virtual CS Polyflow</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tanyakan data operasional pabrik dan panduan SOP pemakaian. Untuk perubahan data, lakukan langsung lewat menu Polyflow.
          </p>
        </div>

        <PolyflowChatPanel embedded />
      </div>
    </div>
  );
}

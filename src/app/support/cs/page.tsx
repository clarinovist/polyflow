import { redirect } from 'next/navigation';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

export default async function SupportCsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const tab = typeof params.tab === 'string' ? params.tab : undefined;
  // Legacy ?tab=howto or ?tab=troubleshoot → canonical routes
  if (tab === 'howto') redirect('/support');
  if (tab === 'troubleshoot') redirect('/support/troubleshooting');

  const q = typeof params.q === 'string' ? params.q.slice(0, 500) : undefined;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Bantuan</span>
            <span>›</span>
            <span className="text-foreground">Tanya Virtual CS</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tanya Virtual CS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tanya cara pakai atau cek data operasional — jawaban grounded pakai artikel bila ada.
          </p>
        </div>

        <PolyflowChatPanel embedded initialQuestion={q} />
      </div>
    </div>
  );
}

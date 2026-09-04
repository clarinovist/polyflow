import { PageHeader } from '@/components/ui/page-header';
import { CeoNotesClient } from '@/components/ceo-notes/CeoNotesClient';
import { listMyNotes, listDraftNotes } from '@/actions/ceo-notes/note-actions';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Catatan CEO | PolyFlow',
    description:
        'Instruksi kerja dari CEO berdasarkan temuan sistem.',
};

export default async function CeoNotesPage() {
    const [activeRes, draftRes] = await Promise.all([
        listMyNotes(),
        listDraftNotes().catch(() => ({ success: false as const, data: [] })),
    ]);
    const initialNotes =
        activeRes.success && activeRes.data ? activeRes.data : [];
    const initialDrafts =
        draftRes.success && draftRes.data ? draftRes.data : [];

    return (
        <div className="p-6 space-y-6">
            <PageHeader
                title="Catatan CEO"
                description="Instruksi kerja berdasarkan temuan sistem — klaim, kerjakan, atau laporkan kendala."
            />
            <CeoNotesClient
                initialNotes={initialNotes}
                initialDrafts={initialDrafts}
                canModerate={draftRes.success}
            />
        </div>
    );
}

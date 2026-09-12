import { JournalListClient } from '@/components/finance/journals/JournalListClient';

export default function JournalsPage() {
    return (
        <div>
            <h1 className="sr-only">Jurnal</h1>
            <JournalListClient />
        </div>
    );
}

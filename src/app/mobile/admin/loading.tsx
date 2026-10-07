import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Admin Command Center</h1>
            <MobileLoadingState message="Memuat Admin Command Center…" />
        </>
    );
}

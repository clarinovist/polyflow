import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Sales lapangan</h1>
            <MobileLoadingState message="Memuat Sales lapangan…" />
        </>
    );
}

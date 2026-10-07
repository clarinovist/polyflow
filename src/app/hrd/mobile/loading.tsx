import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat HRD Mobile</h1>
            <MobileLoadingState message="Memuat HRD Mobile…" />
        </>
    );
}

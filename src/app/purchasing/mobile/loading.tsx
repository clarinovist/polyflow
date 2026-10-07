import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Purchasing Mobile</h1>
            <MobileLoadingState message="Memuat Purchasing Mobile…" />
        </>
    );
}

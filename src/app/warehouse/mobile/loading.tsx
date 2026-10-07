import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Gudang Mobile</h1>
            <MobileLoadingState message="Memuat Gudang Mobile…" />
        </>
    );
}

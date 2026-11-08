import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Portal Karyawan</h1>
            <MobileLoadingState message="Memuat data Anda…" />
        </>
    );
}

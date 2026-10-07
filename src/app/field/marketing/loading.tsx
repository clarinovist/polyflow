import { MobileLoadingState } from '@/components/mobile';

export default function Loading() {
    return (
        <>
            <h1 className="sr-only">Memuat Marketing Supervisor</h1>
            <MobileLoadingState message="Memuat ringkasan tim sales…" />
        </>
    );
}

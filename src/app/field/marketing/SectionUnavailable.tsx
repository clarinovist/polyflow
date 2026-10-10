export function SectionUnavailable({ label }: { label: string }) {
    return (
        <div
            role="status"
            className="rounded-xl border border-dashed bg-muted/30 p-4"
        >
            <p className="text-sm font-medium">{label} tidak tersedia</p>
            <p className="mt-1 text-xs text-muted-foreground">
                Data gagal dimuat dan tidak dihitung sebagai nol.
            </p>
        </div>
    );
}

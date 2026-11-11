import type { ReactNode } from 'react';

/** Kartu ringkasan angka (Karyawan, Total Jam, dst). */
export function SummaryCard({
    icon,
    label,
    value,
    accent,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div
            className={`rounded-xl border p-3 ${accent ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
        >
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1">
                {icon}
                {label}
            </div>
            <p
                className={`text-lg font-bold ${accent ? 'text-primary' : 'text-foreground'}`}
            >
                {value}
            </p>
        </div>
    );
}

/** Kartu pesan sederhana untuk state memuat / data kosong. */
export function RecapMessageCard({ children }: { children: ReactNode }) {
    return (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
            {children}
        </div>
    );
}

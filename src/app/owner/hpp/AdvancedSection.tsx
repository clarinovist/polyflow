import type { ReactNode } from 'react';

/** One collapsed page-level section for everything the simple screen hides. */
export function AdvancedSection({ children }: { children: ReactNode }) {
    return (
        <details className="rounded-lg border border-dashed p-3 lg:p-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
                Lanjutan
            </summary>
            <div className="space-y-6 pt-3">
                <p className="text-xs text-muted-foreground">
                    Skenario, ekspor/impor, dan pengaturan rinci tahap. Datanya
                    tetap tersimpan; hanya disembunyikan dari layar utama.
                </p>
                {children}
            </div>
        </details>
    );
}

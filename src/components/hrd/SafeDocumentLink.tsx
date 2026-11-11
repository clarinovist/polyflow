import type { ReactNode } from 'react';
import { isSafeDocumentUrl } from '@/lib/hrd/document-url';

interface Props {
    url: string;
    className?: string;
    children: ReactNode;
}

/** Renders a document link only for safe urls; legacy unsafe data stays inert. */
export function SafeDocumentLink({ url, className, children }: Props) {
    if (!isSafeDocumentUrl(url)) {
        return (
            <span className="text-xs text-muted-foreground">
                Tautan tidak valid
            </span>
        );
    }
    return (
        <a href={url} target="_blank" rel="noreferrer" className={className}>
            {children}
        </a>
    );
}

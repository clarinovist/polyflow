'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { PhotoPreview } from './attendance-recap-types';

interface Props {
    preview: PhotoPreview | null;
    onClose: () => void;
}

/** Lightbox selfie absensi (masuk/pulang). */
export function SelfieLightbox({ preview, onClose }: Props) {
    return (
        <Dialog open={!!preview} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{preview?.title ?? 'Selfie'}</DialogTitle>
                </DialogHeader>
                {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={preview.url}
                        alt={preview.title}
                        className="w-full max-h-[70vh] object-contain rounded-lg bg-black"
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

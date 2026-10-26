import { X } from 'lucide-react';
import { DialogClose } from '@/components/ui/dialog';
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from './kiosk-button';

/** A 48px close button; the shared dialog's own close icon is too small for gloves. */
export function KioskDialogClose() {
    return (
        <DialogClose
            aria-label={kioskLabels.dialogClose}
            className={kioskButton({ tone: 'ghost', className: 'shrink-0' })}
        >
            <X aria-hidden="true" />
        </DialogClose>
    );
}

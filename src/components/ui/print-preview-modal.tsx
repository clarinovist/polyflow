'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';

/**
 * Print layout for the open preview dialog.
 *
 * Everything outside the dialog is removed from layout with `display: none`
 * (not `visibility: hidden`, which keeps the page behind it tall and adds
 * blank pages). The dialog itself is made static: Radix positions it with
 * `position: fixed` plus a translate, and Chrome repeats fixed elements on
 * every printed page, starting from the middle of the page. The scroll lock
 * Radix puts on html/body is lifted so the content can paginate.
 * `translate` is reset separately because Tailwind v4 emits it as an
 * individual property that `transform: none` does not cancel.
 */
const PRINT_PREVIEW_CSS = `
@media print {
  body > *:not(:has([data-print-preview-root])) {
    display: none !important;
  }
  html,
  body,
  body[data-scroll-locked] {
    overflow: visible !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  [data-slot='dialog-overlay'] {
    display: none !important;
  }
  [data-slot='dialog-content'] {
    position: static !important;
    inset: auto !important;
    translate: none !important;
    transform: none !important;
    animation: none !important;
    display: block !important;
    width: auto !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
    opacity: 1 !important;
    background: transparent !important;
  }
  [data-print-preview-root] {
    border: 0 !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
}
`;

interface PrintPreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
    /** Use wider modal for landscape print layouts */
    landscape?: boolean;
}

export function PrintPreviewModal({
    open,
    onOpenChange,
    title,
    children,
    landscape = false,
}: PrintPreviewModalProps) {
    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`${landscape ? 'max-w-[1200px]' : 'max-w-4xl'} max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible`}
            >
                <DialogHeader className="no-print">
                    <DialogTitle className="flex items-center gap-2">
                        <Printer className="h-5 w-5" />
                        {title}
                    </DialogTitle>
                </DialogHeader>

                <div
                    data-print-preview-root
                    className="border rounded-lg overflow-hidden bg-white print:border-none print:rounded-none"
                >
                    {children}
                </div>

                <DialogFooter className="gap-2 no-print">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="mr-2 h-4 w-4" />
                        Batal
                    </Button>
                    <Button variant="outline" onClick={handlePrint}>
                        📄 Export PDF
                    </Button>
                    <Button onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" />
                        Cetak Sekarang
                    </Button>
                </DialogFooter>
            </DialogContent>
            {open && <style>{PRINT_PREVIEW_CSS}</style>}
        </Dialog>
    );
}

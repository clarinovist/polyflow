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
      <DialogContent className={`${landscape ? 'max-w-[1200px]' : 'max-w-4xl'} max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible`}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
      {open && (
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }

            [data-print-preview-root],
            [data-print-preview-root] * {
              visibility: visible !important;
            }

            [data-print-preview-root] {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              border: 0 !important;
              overflow: visible !important;
            }
          }
        `}</style>
      )}
    </Dialog>
  );
}

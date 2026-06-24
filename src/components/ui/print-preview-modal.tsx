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
}

export function PrintPreviewModal({
  open,
  onOpenChange,
  title,
  children,
}: PrintPreviewModalProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg overflow-hidden bg-white print:border-none print:rounded-none">
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
    </Dialog>
  );
}

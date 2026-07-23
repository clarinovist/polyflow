"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface RiskyOutputConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputName: string;
  onConfirm: () => void;
}

export function RiskyOutputConfirmDialog({
  open,
  onOpenChange,
  outputName,
  onConfirm,
}: RiskyOutputConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Lokasi Output Berisiko
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Output diarahkan ke <span className="font-semibold">{outputName}</span> yang
                merupakan gudang bahan baku atau lokasi nonaktif.
              </p>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                <p className="font-medium">Risiko:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Transfer material staging bisa gagal (asal = tujuan)</li>
                  <li>Backflush bisa salah arah</li>
                  <li>Stok gudang bahan baku terganggu</li>
                </ul>
              </div>
              <p className="text-muted-foreground">
                Disarankan memilih lokasi WIP, FG, atau Packing Area.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Kembali
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Tetap Gunakan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

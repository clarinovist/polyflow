import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { Dispatch, SetStateAction } from 'react';

type CustomItemDialogProps = {
    customItemIndex: number | null;
    setCustomItemIndex: Dispatch<SetStateAction<number | null>>;
    customItemName: string;
    setCustomItemName: Dispatch<SetStateAction<string>>;
    customItemPrice: string;
    setCustomItemPrice: Dispatch<SetStateAction<string>>;
    confirmCustomItem: () => void;
};

export function CustomItemDialog({
    customItemIndex,
    setCustomItemIndex,
    customItemName,
    setCustomItemName,
    customItemPrice,
    setCustomItemPrice,
    confirmCustomItem,
}: CustomItemDialogProps) {
    return (
        <Dialog
            open={customItemIndex !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setCustomItemIndex(null);
                    setCustomItemName('');
                    setCustomItemPrice('');
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ketik Nama Produk</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="custom-item-name">Nama Produk *</Label>
                        <Input
                            id="custom-item-name"
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            placeholder="Contoh: Plastik OPP 8 micron"
                            autoFocus
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    customItemName.trim()
                                ) {
                                    e.preventDefault();
                                    confirmCustomItem();
                                }
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="custom-item-price">Harga (Rp)</Label>
                        <Input
                            id="custom-item-price"
                            type="number"
                            min="0"
                            step="100"
                            value={customItemPrice}
                            onChange={(e) => setCustomItemPrice(e.target.value)}
                            placeholder="0 (harga nego, bisa diisi nanti)"
                        />
                        <p className="text-xs text-muted-foreground">
                            Kosongkan atau isi 0 jika harga masih nego. Bisa
                            diubah setelah order dibuat.
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setCustomItemIndex(null);
                                setCustomItemName('');
                                setCustomItemPrice('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={confirmCustomItem}
                            disabled={!customItemName.trim()}
                        >
                            Pilih Produk Ini
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

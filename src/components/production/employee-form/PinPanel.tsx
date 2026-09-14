import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PinPanelProps = {
    hasPin: boolean;
    pin: string;
    setPin: Dispatch<SetStateAction<string>>;
    pinLoading: boolean;
    handleSetPin: () => Promise<void>;
    handleClearPin: () => Promise<void>;
};

export function PinPanel({
    hasPin,
    pin,
    setPin,
    pinLoading,
    handleSetPin,
    handleClearPin,
}: PinPanelProps) {
    return (
        <div className="space-y-3 bg-muted/30 p-3 rounded-lg border border-white/5">
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-sm font-semibold tracking-tight">
                        PIN Kiosk
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                        4-6 digit untuk absensi di kiosk.
                    </p>
                </div>
                <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${hasPin ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}
                >
                    {hasPin ? 'Aktif' : 'Belum diset'}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <Input
                    type="password"
                    value={pin}
                    onChange={(e) =>
                        setPin(
                            e.target.value
                                .replace(/\D/g, '')
                                .slice(0, 6),
                        )
                    }
                    placeholder={hasPin ? '••••' : '4-6 digit'}
                    maxLength={6}
                    className="h-9 text-sm font-mono tracking-widest"
                    autoComplete="off"
                />
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSetPin}
                    disabled={pinLoading || !pin}
                    className="shrink-0"
                >
                    {pinLoading ? '...' : 'Simpan'}
                </Button>
                {hasPin && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleClearPin}
                        disabled={pinLoading}
                        className="shrink-0 text-destructive hover:text-destructive"
                    >
                        Hapus
                    </Button>
                )}
            </div>
        </div>
    );
}

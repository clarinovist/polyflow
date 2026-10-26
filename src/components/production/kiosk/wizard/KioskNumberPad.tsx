import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const KEY_CLASS = cn(kioskButton({ size: 'xl' }), 'text-2xl tabular-nums');

/** On-screen keypad for gloved hands; edits the same string the input shows. */
export function KioskNumberPad({
    value,
    onChange,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
}) {
    const press = (key: string) => {
        if (key === 'back') return onChange(value.slice(0, -1));
        if (key === ',') {
            if (/[.,]/.test(value)) return;
            return onChange(`${value || '0'},`);
        }
        onChange(value === '0' ? key : value + key);
    };

    return (
        <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
                <button
                    key={key}
                    type="button"
                    className={KEY_CLASS}
                    aria-label={
                        key === 'back'
                            ? 'Hapus satu angka'
                            : key === ','
                              ? 'Koma desimal'
                              : undefined
                    }
                    onClick={() => press(key)}
                >
                    {key === 'back' ? <Delete aria-hidden="true" /> : key}
                </button>
            ))}
        </div>
    );
}

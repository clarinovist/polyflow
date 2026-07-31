'use client';

import { useState, useRef } from 'react';
import { Loader2, X, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { parseDecimalInput } from '@/lib/utils/decimal-input';
import { formatQuantity } from '@/lib/utils/utils';
import { cn } from '@/lib/utils/utils';

export interface OpnameEntryView {
    id: string;
    quantity: number;
    label?: string | null;
    status: 'saved' | 'pending' | 'failed';
}

interface OpnameEntryEditorProps {
    entries: OpnameEntryView[];
    unit: string;
    readOnly?: boolean;
    onAdd: (quantity: number, label?: string) => void;
    onRemove: (entryId: string) => void;
    onRetry: (entryId: string) => void;
}

export function OpnameEntryEditor({
    entries,
    unit,
    readOnly,
    onAdd,
    onRemove,
    onRetry,
}: OpnameEntryEditorProps) {
    const [rawInput, setRawInput] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const total = entries.reduce((sum, e) => sum + e.quantity, 0);

    function handleAdd() {
        const parsed = parseDecimalInput(rawInput);
        if (parsed === null || parsed <= 0) {
            setInputError('Jumlah tidak valid');
            return;
        }
        setInputError(null);
        onAdd(parsed);
        setRawInput('');
        // Fokus balik supaya operator bisa nembak angka berturut-turut tanpa pindah tangan
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    }

    return (
        <div className="space-y-3">
            {/* Ringkasan */}
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span data-testid="entry-summary">
                    {entries.length} entri · {formatQuantity(total)} {unit}
                </span>
            </div>

            {/* Input bar */}
            {!readOnly && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <Input
                                ref={inputRef}
                                data-testid="entry-input"
                                inputMode="decimal"
                                placeholder="Jumlah"
                                value={rawInput}
                                onChange={(e) => {
                                    setRawInput(e.target.value);
                                    if (inputError) setInputError(null);
                                }}
                                onKeyDown={handleKeyDown}
                                aria-invalid={inputError ? true : undefined}
                                className={cn(inputError && 'border-destructive')}
                            />
                        </div>
                        <Button
                            type="button"
                            data-testid="add-button"
                            onClick={handleAdd}
                        >
                            Tambah
                        </Button>
                    </div>
                    {inputError && (
                        <p
                            data-testid="input-error"
                            className="text-xs text-destructive"
                        >
                            {inputError}
                        </p>
                    )}
                </div>
            )}

            {/* Daftar entri */}
            <div className="space-y-2" data-testid="entry-list">
                {entries.length === 0 && (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                        Belum ada entri
                    </p>
                )}
                {entries.map((entry, idx) => (
                    <div
                        key={entry.id}
                        data-testid={`entry-row-${entry.id}`}
                        data-entry-status={entry.status}
                        className={cn(
                            'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                            entry.status === 'pending' && 'opacity-60',
                            entry.status === 'failed' &&
                                'border-destructive bg-destructive/5',
                        )}
                    >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="w-6 shrink-0 text-xs text-muted-foreground">
                                {idx + 1}.
                            </span>
                            <span className="font-mono font-medium">
                                {formatQuantity(entry.quantity)} {unit}
                            </span>
                            {entry.label && (
                                <span className="truncate text-xs text-muted-foreground">
                                    {entry.label}
                                </span>
                            )}
                            {entry.status === 'pending' && (
                                <Loader2
                                    data-testid="pending-spinner"
                                    className="h-4 w-4 animate-spin text-muted-foreground"
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {entry.status === 'failed' && !readOnly && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    data-testid={`retry-button-${entry.id}`}
                                    onClick={() => onRetry(entry.id)}
                                    className="h-8 gap-1"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                    Coba lagi
                                </Button>
                            )}

                            {!readOnly && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`remove-button-${entry.id}`}
                                    onClick={() => onRemove(entry.id)}
                                    className="h-11 w-11 shrink-0"
                                    aria-label={`Hapus entri ${idx + 1}`}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

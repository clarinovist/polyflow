'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OwnerHppScenario } from '@/lib/owner-hpp/workspace-schema';
import { Copy, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { SELECT_CLASS } from './ui-classes';

interface ScenarioBarProps {
    scenarios: readonly OwnerHppScenario[];
    activeId: string;
    canAdd: boolean;
    isDirty: boolean;
    isSaving: boolean;
    statusText: string;
    onSelect: (id: string) => void;
    onRename: (name: string) => void;
    onAdd: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSave: () => void;
    onExport: () => void;
    onImport: (file: File) => void;
}

export function ScenarioBar(props: ScenarioBarProps) {
    const { scenarios, activeId, canAdd, isDirty, isSaving, statusText } =
        props;
    const active =
        scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
    const fileInput = useRef<HTMLInputElement>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex w-full flex-col gap-1 sm:w-56">
                    <span className="text-xs text-muted-foreground">
                        Skenario
                    </span>
                    <select
                        aria-label="Skenario"
                        className={SELECT_CLASS}
                        value={active.id}
                        onChange={(event) => {
                            setIsConfirmingDelete(false);
                            props.onSelect(event.target.value);
                        }}
                    >
                        {scenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                                {scenario.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        Nama skenario
                    </span>
                    <Input
                        maxLength={80}
                        value={active.name}
                        onChange={(event) => props.onRename(event.target.value)}
                    />
                </label>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Skenario baru"
                    disabled={!canAdd}
                    onClick={props.onAdd}
                >
                    <Plus />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Gandakan skenario"
                    disabled={!canAdd}
                    onClick={props.onDuplicate}
                >
                    <Copy />
                </Button>
                {isConfirmingDelete ? (
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                            setIsConfirmingDelete(false);
                            props.onDelete();
                        }}
                    >
                        Hapus skenario ini?
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Hapus skenario"
                        disabled={scenarios.length <= 1}
                        onClick={() => setIsConfirmingDelete(true)}
                    >
                        <Trash2 />
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    onClick={props.onSave}
                    disabled={isSaving || !isDirty}
                >
                    <Save /> {isSaving ? 'Menyimpan…' : 'Simpan'}
                </Button>
                <span
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                    suppressHydrationWarning
                >
                    {statusText}
                </span>
                <div className="ml-auto flex gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={props.onExport}
                    >
                        <Download /> Ekspor
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInput.current?.click()}
                    >
                        <Upload /> Impor
                    </Button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="sr-only"
                        aria-label="Impor berkas JSON"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) props.onImport(file);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

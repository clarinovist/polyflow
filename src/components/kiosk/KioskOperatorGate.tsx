'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, LogIn } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { startKioskOperatorSession } from '@/actions/production/kiosk-operator-session';
import { KioskOperatorPin, PIN_MIN_LENGTH } from './KioskOperatorPin';

interface Employee {
    id: string;
    name: string;
    machineIds?: string[];
    machineNames?: string[];
}

interface KioskOperatorGateProps {
    employees: Employee[];
    machines: Array<{ id: string; name: string }>;
    /** Called only after the server accepted the operator's PIN. */
    onSelect: (operatorId: string, operatorName: string) => void;
}

export function KioskOperatorGate({
    employees,
    machines,
    onSelect,
}: KioskOperatorGateProps) {
    const [selected, setSelected] = useState<Employee | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const choose = (employee: Employee | null) => {
        setSelected(employee);
        setPin('');
        setError('');
    };

    const submitPin = async () => {
        if (!selected || pin.length < PIN_MIN_LENGTH) return;
        setIsSubmitting(true);
        setError('');
        try {
            const result = await startKioskOperatorSession(selected.id, pin);
            if (result.success) {
                onSelect(selected.id, result.data.name);
                return;
            }
            setError(result.error || kioskLabels.pinCheckFailed);
        } catch {
            setError(kioskLabels.pinCheckFailed);
        } finally {
            setIsSubmitting(false);
        }
        setPin('');
    };

    if (selected) {
        return (
            <KioskOperatorPin
                operatorName={selected.name}
                pin={pin}
                error={error}
                isSubmitting={isSubmitting}
                onPinChange={setPin}
                onSubmit={submitPin}
                onCancel={() => choose(null)}
            />
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-in fade-in zoom-in duration-300">
            <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Users className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase">
                {kioskLabels.operatorGateTitle}
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
                {kioskLabels.operatorGateDesc}
            </p>

            {employees.length === 0 && (
                <p className="max-w-md rounded-xl border border-dashed p-6 text-muted-foreground">
                    {kioskLabels.operatorGateEmpty}
                </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
                {employees.map((emp) => (
                    <Button
                        key={emp.id}
                        variant="outline"
                        size="lg"
                        className="h-24 text-xl font-bold border-2 hover:border-primary hover:bg-primary/5 active:scale-95 transition-all text-left justify-start px-6 gap-4"
                        onClick={() => choose(emp)}
                    >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm">
                            {emp.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                            <span className="truncate">{emp.name}</span>
                            {emp.machineIds && emp.machineIds.length > 0 && (
                                <span className="text-xs text-muted-foreground font-normal">
                                    {emp.machineIds.length === 1
                                        ? machines.find(
                                              (m) =>
                                                  m.id === emp.machineIds![0],
                                          )?.name || 'Mesin ditugaskan'
                                        : `${emp.machineIds.length} mesin`}
                                </span>
                            )}
                        </div>
                    </Button>
                ))}
            </div>

            <p className="mt-12 text-sm text-muted-foreground flex items-center gap-2">
                <LogIn className="h-4 w-4" /> {kioskLabels.operatorGateHint}
            </p>
        </div>
    );
}

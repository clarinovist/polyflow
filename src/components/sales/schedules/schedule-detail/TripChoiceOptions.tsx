import type { Trip } from './types';

interface TripChoiceOptionsProps {
    matchingTrips: Trip[];
    tripChoice: string;
    setTripChoice: (value: string) => void;
}

export function TripChoiceOptions({
    matchingTrips,
    tripChoice,
    setTripChoice,
}: TripChoiceOptionsProps) {
    return (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/40">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Opsi Trip Ditemukan
            </label>
            <div className="space-y-2">
                {matchingTrips.map((t, idx) => {
                    const stopCount =
                        t.orders.length;
                    return (
                        <label
                            key={t.id}
                            className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                        >
                            <input
                                type="radio"
                                name="tripChoice"
                                value={t.id}
                                checked={
                                    tripChoice ===
                                    t.id
                                }
                                onChange={() =>
                                    setTripChoice(
                                        t.id,
                                    )
                                }
                                className="h-4 w-4"
                            />
                            <span>
                                Gabung ke{' '}
                                <strong>
                                    Trip #
                                    {idx + 1}
                                </strong>{' '}
                                ({stopCount} SO
                                terdaftar)
                            </span>
                        </label>
                    );
                })}
                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                    <input
                        type="radio"
                        name="tripChoice"
                        value="new"
                        checked={
                            tripChoice === 'new'
                        }
                        onChange={() =>
                            setTripChoice('new')
                        }
                        className="h-4 w-4"
                    />
                    <span>
                        Buat trip baru (truk
                        jalan 2x hari ini)
                    </span>
                </label>
            </div>
        </div>
    );
}

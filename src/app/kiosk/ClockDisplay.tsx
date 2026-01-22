'use client';

import { useEffect, useState } from 'react';

export function ClockDisplay() {
    const [time, setTime] = useState<Date | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTime(new Date());
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!time) return null;

    return (
        <span>
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
    );
}

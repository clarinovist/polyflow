'use client';

import { useEffect, useState } from 'react';

const WIB_TIME = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
});

/** Factory clock: hours and minutes in WIB, the same format as the rest of the kiosk. */
export function ClockDisplay() {
    const [time, setTime] = useState<Date | null>(null);

    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => setTime(new Date()), 10_000);
        return () => clearInterval(timer);
    }, []);

    if (!time) return null;

    return <span>{WIB_TIME.format(time)} WIB</span>;
}

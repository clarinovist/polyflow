import { useEffect } from 'react';

/**
 * useBarcodeScanner
 * Acculumates keypresses and detects "Enter" to trigger a scan action.
 * Ideal for USB/Bluetooth HID scanners that act as a keyboard.
 */
export function useBarcodeScanner(onScan: (code: string) => void, minLength = 3) {

    useEffect(() => {
        let buffer = '';
        let lastKeyTime = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            const currentTime = Date.now();

            // If time between keystrokes is too long (>100ms), assume manual typing and clear buffer
            // Scanners usually send keys very fast (e.g. <20ms)
            if (currentTime - lastKeyTime > 100) {
                buffer = '';
            }
            lastKeyTime = currentTime;

            if (e.key === 'Enter') {
                if (buffer.length >= minLength) {
                    onScan(buffer);
                    buffer = ''; // Clear after scan
                }
            } else if (e.key.length === 1) {
                // Only alphanumeric? Or just any printable char
                buffer += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onScan, minLength]);
}

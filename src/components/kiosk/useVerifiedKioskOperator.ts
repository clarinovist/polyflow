'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    endKioskOperatorSession,
    getKioskOperatorSessionInfo,
} from '@/actions/production/kiosk-operator-session';

export const KIOSK_OPERATOR_STORAGE_KEY = 'kiosk_operator_id';

interface VerifiedOperatorState {
    operatorId: string | null;
    operatorName: string | null;
    isReady: boolean;
    /** A stored operator was dropped because its PIN session is gone. */
    expired: boolean;
}

/**
 * The operator stored on this tablet, kept only while its PIN session is
 * still valid on the server. Tablets that picked an operator before PINs
 * were required fall back to the gate instead of failing on every save.
 */
export function useVerifiedKioskOperator() {
    const [state, setState] = useState<VerifiedOperatorState>({
        operatorId: null,
        operatorName: null,
        isReady: false,
        expired: false,
    });

    useEffect(() => {
        const saved = sessionStorage.getItem(KIOSK_OPERATOR_STORAGE_KEY);
        if (!saved) {
            setState((s) => ({ ...s, isReady: true }));
            return;
        }
        let active = true;
        getKioskOperatorSessionInfo()
            .then((result) => {
                if (!active) return;
                const session = result.success ? result.data : null;
                const valid = session?.id === saved;
                if (!valid)
                    sessionStorage.removeItem(KIOSK_OPERATOR_STORAGE_KEY);
                setState({
                    operatorId: valid ? saved : null,
                    operatorName: valid ? (session?.name ?? null) : null,
                    isReady: true,
                    expired: !valid,
                });
            })
            .catch(() => {
                // The check could not run (offline). Keep the operator; the
                // server still rejects mutations without a PIN session.
                if (active) {
                    setState({
                        operatorId: saved,
                        operatorName: null,
                        isReady: true,
                        expired: false,
                    });
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const select = useCallback((operatorId: string, operatorName: string) => {
        sessionStorage.setItem(KIOSK_OPERATOR_STORAGE_KEY, operatorId);
        setState({ operatorId, operatorName, isReady: true, expired: false });
    }, []);

    const forget = useCallback(() => {
        sessionStorage.removeItem(KIOSK_OPERATOR_STORAGE_KEY);
        setState({
            operatorId: null,
            operatorName: null,
            isReady: true,
            expired: false,
        });
        void endKioskOperatorSession().catch(() => undefined);
    }, []);

    return { ...state, select, forget };
}

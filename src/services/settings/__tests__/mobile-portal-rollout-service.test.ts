import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    isEnabledAppSetting,
    PLANNED_MOBILE_PORTAL_ROLLOUTS,
    readMobilePortalRollouts,
} from '../mobile-portal-rollout-service';
const findMany = vi.fn();
const settings = { findMany };

describe('mobile portal rollout reader', () => {
    beforeEach(() => vi.clearAllMocks());

    it('defines rollout keys for the planned portal batches', () => {
        expect(PLANNED_MOBILE_PORTAL_ROLLOUTS).toEqual({
            admin: 'mobile.portal.admin.enabled',
            marketing: 'mobile.portal.marketing.enabled',
            distribution: 'mobile.portal.distribution.enabled',
            maklon: 'mobile.portal.maklon.enabled',
        });
    });

    it.each([
        ['true', true],
        ['false', false],
        ['TRUE', false],
        ['yes', false],
        [undefined, false],
    ])('parses %s fail-closed', (value, expected) => {
        expect(isEnabledAppSetting(value)).toBe(expected);
    });

    it('batches unique keys and defaults missing values to false', async () => {
        findMany.mockResolvedValue([
            { key: 'mobile.portal.admin.enabled', value: 'true' },
        ] as never);
        await expect(
            readMobilePortalRollouts([
                'mobile.portal.admin.enabled',
                'mobile.portal.marketing.enabled',
                'mobile.portal.admin.enabled',
            ],
                settings,
            ),
        ).resolves.toEqual({
            'mobile.portal.admin.enabled': true,
            'mobile.portal.marketing.enabled': false,
        });
        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith({
            where: {
                key: {
                    in: [
                        'mobile.portal.admin.enabled',
                        'mobile.portal.marketing.enabled',
                    ],
                },
            },
            select: { key: true, value: true },
        });
    });

    it('fails closed when the tenant setting query fails', async () => {
        findMany.mockRejectedValue(
            new Error('Synthetic read failure'),
        );
        await expect(
            readMobilePortalRollouts(
                ['mobile.portal.admin.enabled'],
                settings,
            ),
        ).resolves.toEqual({ 'mobile.portal.admin.enabled': false });
    });

    it('does not query when no portal needs rollout', async () => {
        await expect(readMobilePortalRollouts([], settings)).resolves.toEqual({});
        expect(findMany).not.toHaveBeenCalled();
    });
});

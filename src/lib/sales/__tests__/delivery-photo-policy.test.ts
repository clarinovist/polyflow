import { describe, it, expect } from 'vitest';
import {
  canAttachDeliveryPhoto,
  getAllowedDeliveryPhotoStatuses,
  getDeliveryPhotoStatusErrorMessage,
  VEHICLE_PHOTO_STATUS_LIST,
  POD_PHOTO_STATUS_LIST,
} from '../delivery-photo-policy';

const ALL_STATUSES = [
  'PENDING',
  'LOADING',
  'SHIPPED',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const;

describe('delivery-photo-policy', () => {
  describe('vehicle photo lifecycle', () => {
    it('allows vehicle photo at PENDING, LOADING, SHIPPED', () => {
      for (const status of ['PENDING', 'LOADING', 'SHIPPED']) {
        expect(canAttachDeliveryPhoto(status, 'vehicle')).toBe(true);
      }
    });

    it('denies vehicle photo for every other status', () => {
      for (const status of [
        'IN_TRANSIT',
        'ARRIVED',
        'DELIVERED',
        'RETURNED',
        'CANCELLED',
      ]) {
        expect(canAttachDeliveryPhoto(status, 'vehicle')).toBe(false);
      }
    });

    it('exposes the full vehicle allowed-status list', () => {
      expect(VEHICLE_PHOTO_STATUS_LIST).toEqual([
        'PENDING',
        'LOADING',
        'SHIPPED',
      ]);
    });
  });

  describe('proof_of_delivery photo lifecycle', () => {
    it('allows POD at SHIPPED, IN_TRANSIT, ARRIVED, DELIVERED', () => {
      for (const status of [
        'SHIPPED',
        'IN_TRANSIT',
        'ARRIVED',
        'DELIVERED',
      ]) {
        expect(canAttachDeliveryPhoto(status, 'proof_of_delivery')).toBe(true);
      }
    });

    it('denies POD for every other status', () => {
      for (const status of ['PENDING', 'LOADING', 'RETURNED', 'CANCELLED']) {
        expect(canAttachDeliveryPhoto(status, 'proof_of_delivery')).toBe(false);
      }
    });

    it('exposes the full POD allowed-status list', () => {
      expect(POD_PHOTO_STATUS_LIST).toEqual([
        'SHIPPED',
        'IN_TRANSIT',
        'ARRIVED',
        'DELIVERED',
      ]);
    });
  });

  describe('getAllowedDeliveryPhotoStatuses', () => {
    it('returns the vehicle list for vehicle type', () => {
      expect(getAllowedDeliveryPhotoStatuses('vehicle')).toEqual(
        VEHICLE_PHOTO_STATUS_LIST,
      );
    });

    it('returns the POD list for proof_of_delivery type', () => {
      expect(getAllowedDeliveryPhotoStatuses('proof_of_delivery')).toEqual(
        POD_PHOTO_STATUS_LIST,
      );
    });

    it('every status is classified by exactly one list per type', () => {
      for (const status of ALL_STATUSES) {
        const vehicle = VEHICLE_PHOTO_STATUS_LIST.includes(status);
        const pod = POD_PHOTO_STATUS_LIST.includes(status);
        expect(canAttachDeliveryPhoto(status, 'vehicle')).toBe(vehicle);
        expect(canAttachDeliveryPhoto(status, 'proof_of_delivery')).toBe(pod);
      }
    });
  });

  describe('getDeliveryPhotoStatusErrorMessage', () => {
    it('lists allowed statuses in the message for vehicle', () => {
      const msg = getDeliveryPhotoStatusErrorMessage('IN_TRANSIT', 'vehicle');
      expect(msg).toContain('Foto truk');
      expect(msg).toContain('PENDING/LOADING/SHIPPED');
      expect(msg).toContain('IN_TRANSIT');
    });

    it('lists allowed statuses in the message for POD', () => {
      const msg = getDeliveryPhotoStatusErrorMessage(
        'PENDING',
        'proof_of_delivery',
      );
      expect(msg).toContain('Bukti terima');
      expect(msg).toContain('SHIPPED/IN_TRANSIT/ARRIVED/DELIVERED');
      expect(msg).toContain('PENDING');
    });
  });
});

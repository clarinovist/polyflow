/**
 * Delivery Order status transition state machine.
 * Pure helpers — no DB, no side effects. Fully testable.
 */

import type { DeliveryStatus } from '@prisma/client';

/**
 * Allowed transitions (MVP).
 * Terminal states (DELIVERED, RETURNED, CANCELLED) have no outgoing transitions.
 */
export const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['LOADING', 'SHIPPED', 'CANCELLED'],
  LOADING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'RETURNED'],
  IN_TRANSIT: ['ARRIVED', 'DELIVERED', 'RETURNED'],
  ARRIVED: ['DELIVERED', 'RETURNED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

/**
 * Check if a status transition is allowed.
 */
export function canTransition(from: string, to: string): boolean {
  return DELIVERY_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Status yang masih "aktif" (belum terminal).
 * Dipakai untuk filter DO aktif di business rules.
 */
export const OPEN_DELIVERY_STATUSES: DeliveryStatus[] = [
  'PENDING',
  'LOADING',
  'SHIPPED',
  'IN_TRANSIT',
  'ARRIVED',
];

/**
 * Terminal statuses — no further transitions.
 */
export const TERMINAL_DELIVERY_STATUSES: DeliveryStatus[] = [
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
];

/**
 * Get the human-readable label for a delivery status (Bahasa Indonesia).
 */
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  LOADING: 'Sedang Dimuat',
  SHIPPED: 'Dikirim',
  IN_TRANSIT: 'Dalam Perjalanan',
  ARRIVED: 'Sampai Tujuan',
  DELIVERED: 'Terkirim',
  RETURNED: 'Diretur',
  CANCELLED: 'Dibatalkan',
};

/**
 * Get label for a delivery status.
 */
export function getDeliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status] ?? status;
}

/**
 * Primary next-step button labels for each status.
 * Returns null if status is terminal.
 */
export const NEXT_STEP_LABELS: Record<string, { to: string; label: string } | null> = {
  PENDING: { to: 'LOADING', label: 'Mulai Muat' },
  LOADING: { to: 'SHIPPED', label: 'Tandai Dikirim' },
  SHIPPED: { to: 'IN_TRANSIT', label: 'Dalam Perjalanan' },
  IN_TRANSIT: { to: 'ARRIVED', label: 'Sampai Tujuan' },
  ARRIVED: { to: 'DELIVERED', label: 'Tandai Terkirim' },
  DELIVERED: null,
  RETURNED: null,
  CANCELLED: null,
};

/** Re-export billing helper so consumers import from delivery-status, not delivery-pricing. */
export { isBillableDeliveryStatus } from '@/lib/sales/delivery-pricing';

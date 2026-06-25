export const PAYMENT_TERMS = [
  { value: 0, label: "COD (Cash on Delivery)" },
  { value: 14, label: "Net 14" },
  { value: 30, label: "Net 30" },
  { value: 60, label: "Net 60" },
  { value: 90, label: "Net 90" },
  { value: -1, label: "Lainnya..." },
] as const;

export const DEFAULT_PAYMENT_TERM_DAYS = 30;

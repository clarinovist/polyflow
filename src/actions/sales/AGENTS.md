# Sales Module

## Purpose

Server actions for sales orders, customers, deliveries, returns, vehicles, and sales reporting.

Quotations are not a separate module: since the unified SO + quotation lifecycle
migration, a quotation is a `SalesOrder` in a `QUOTATION*` status. Its actions
live in `sales.ts` (`sendQuotationOrder`, `acceptQuotationOrder`, …) and its
status helpers in `src/lib/sales/order-phase.ts`.

## Key Files

| File                         | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `sales.ts`                   | Sales order CRUD, status management |
| `customer.ts`                | Customer management                 |
| `customer-360.ts`            | 360° customer view                  |
| `customer-product-prices.ts` | Customer-specific pricing           |
| `delivery-schedules.ts`      | Delivery scheduling                 |
| `delivery-photos.ts`         | Delivery proof photos               |
| `sales-returns.ts`           | Sales return processing             |
| `sales-reports.ts`           | Sales reporting                     |
| `vehicles.ts`                | Vehicle management                  |
| `vehicle-tariffs.ts`         | Delivery tariff management          |
| `visits.ts`                  | Sales visit tracking                |
| `shipping-reports.ts`        | Shipping reports                    |

## Patterns

### Action Structure

**Jangan pakai `requireAuth()` polos di action baru.** `withTenant` bukan
gerbang auth — untuk pemanggil tanpa session ia fallback ke `SYSTEM_USER_ID`
dan tetap menjalankan action (`src/lib/core/tenant.ts`). `requireAuth()`
hanya memastikan ada session, tidak memfilter role — artinya staf HRD/gudang/
kasir bisa memanggil action penjualan apa pun. Pakai helper dari
`@/lib/auth/sales-access` sesuai tabel di bawah.

```typescript
'use server';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, NotFoundError } from '@/lib/errors/errors';
import { requireSalesAccess } from '@/lib/auth/sales-access';

export const myAction = withTenant(async function myAction(data: InputType) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        // ... business logic
        revalidatePath('/sales');
        return result;
    });
});
```

**Matriks guard** (`src/lib/auth/sales-access.ts`):

| Kelompok action                                                    | Guard                     | Role                               |
| ------------------------------------------------------------------ | ------------------------- | ---------------------------------- |
| Baca/tulis data sales (list, detail, laporan, CRUD SO/return/rute) | `requireSalesAccess()`    | ADMIN, SALES, MARKETING            |
| Destruktif/override (cancel, delete, force ops)                    | `requireSalesApprover()`  | ADMIN                              |
| Assign/unassign customer, verifikasi prospek                       | `requireSalesManager()`   | ADMIN, MARKETING                   |
| Invoice & piutang sisi sales                                       | `requireSalesFinance()`   | ADMIN, FINANCE                     |
| Jadwal kirim & daftar muatan (dibaca portal gudang)                | `requireDeliveryAccess()` | ADMIN, SALES, MARKETING, WAREHOUSE |

Exception terdokumentasi (JANGAN naikkan ke guard di atas — dipakai
lintas-portal di luar `/sales/**`): `getCustomers` (`customer.ts`) dan
`getSalesOrderById` (`sales.ts`) tetap `requireAuth()` polos karena dipanggil
dari halaman finance/warehouse/maklon. Kalau menambah action baru yang juga
dipanggil lintas-portal, grep dulu:
`grep -rn "from '@/actions/sales/" src/app src/components | grep -v "app/sales\|app/field/sales\|components/sales"`
sebelum memutuskan guard-nya.

### Sales Order Types

- `MAKE_TO_STOCK` — Standard order from inventory
- `MAKE_TO_ORDER` — Custom production order
- `MAKLON_JASA` — Toll manufacturing order

### Order Lifecycle

```
DRAFT → CONFIRMED → PROCESSING → READY → SHIPPED → DELIVERED
                                      ↓
                                  CANCELLED
```

### Delivery Flow

1. Create delivery from sales order
2. Assign vehicle and driver
3. Capture delivery photos (proof)
4. Mark as delivered

## Gotchas

| Issue                   | Solution                                            |
| ----------------------- | --------------------------------------------------- |
| Order won't confirm     | Check customer credit limit in `credit-service.ts`  |
| Delivery pricing wrong  | Check `delivery-pricing.ts` for tariff rules        |
| Return not linking      | Ensure return references original order/invoice     |
| Quotation expired       | Check `validUntil` date                             |
| Vehicle tariff mismatch | Tariffs are per-vehicle, check `vehicle-tariffs.ts` |

## Service Layer

Business logic lives in `src/services/sales/`:

- `sales-service.ts` — Core sales logic
- `orders-service.ts` — Order management, incl. quotation-phase transitions
- `credit-service.ts` — Credit limit checking
- `delivery-fulfillment-service.ts` — Delivery processing
- `fulfillment-service.ts` — Order fulfillment
- `returns-service.ts` — Return processing

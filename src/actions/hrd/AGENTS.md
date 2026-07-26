# HRD Module

## Purpose
Server actions for employee management, attendance, payroll, piece rates, disciplinary records, and HRD reporting.

## Key Files

| File | Purpose |
|------|---------|
| `payroll.ts` | Payroll processing |
| `payroll-monthly.ts` | Monthly payroll batch |
| `attendance-employee.ts` | Employee attendance tracking |
| `piece-rates.ts` | Piece-rate wage calculation |
| `disciplinary-leave.ts` | Disciplinary records and leave |
| `employee-document.ts` | Employee document management |
| `employment-reminder.ts` | Employment reminders (contracts, etc.) |
| `bpjs-recap.ts` | BPJS (social security) recap |
| `dashboard-kpis.ts` | HRD KPIs |
| `salary-history.ts` | Salary change tracking |
| `executions-employee.ts` | Employee execution tracking |
| `payslips-employee.ts` | Payslip generation |

## Patterns

### Action Structure
```typescript
"use server";
import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";

export const myAction = withTenant(async function myAction(data: InputType) {
  return safeAction(async () => {
    const session = await requireAuth();
    // ... business logic
    revalidatePath("/hrd");
    return result;
  });
});
```

### Payroll Flow
1. Calculate attendance hours
2. Calculate piece-rate wages (if applicable)
3. Apply deductions (BPJS, loans, etc.)
4. Generate payslips
5. Process payment

### Attendance Rules
- Clock-in/out via PIN or face recognition
- Shift-based scheduling
- Overtime calculation based on rules

## Gotchas

| Issue | Solution |
|-------|----------|
| Payroll calculation wrong | Check `payroll-service.ts` for formula |
| Attendance not recording | Check shift assignment in `shift-window.ts` |
| Piece rate mismatch | Validate against `piece-rate-helpers.test.ts` |
| BPJS calculation | Use `bpjs-recap-service.ts` for recap |
| Leave balance wrong | Check `disciplinary-leave-service.ts` |

## Service Layer
Business logic lives in `src/services/hrd/`:
- `payroll-service.ts` — Core payroll logic
- `payroll-monthly-service.ts` — Monthly batch processing
- `attendance-service.ts` — Attendance processing (78 symbols — complex!)
- `piece-rate-helpers.ts` — Piece-rate calculations
- `disciplinary-leave-service.ts` — Leave management
- `shift-window.ts` — Shift scheduling
- `bpjs-recap-service.ts` — BPJS calculations

# Fix: Fiscal Period Display and Generation Implementation Plan

**Goal:** Fix the issue where newly generated fiscal periods or periods for different years do not appear in the UI due to stale client-side state and lack of support for year selection in the server component.

**Architecture:** 
1.  **Server-Side Data Fetching**: Update the `PeriodsPage` to read the desired year from URL search parameters, allowing the server to fetch the correct data for any year.
2.  **Client-Side Navigation**: Update `PeriodManagementClient` to synchronize the year selection with the URL using `router.push`.
3.  **State Management**: Remove redundant client-side state for `periods` and use the server-provided props directly to ensure they are always in sync after a `router.refresh()`.

**Tech Stack:** Next.js (searchParams, useRouter), React.

---

## Proposed Changes

### [Finance Pages]

#### [MODIFY] [src/app/finance/periods/page.tsx](file:///Users/nugroho/Documents/polyflow/src/app/finance/periods/page.tsx)
- Add `searchParams` to the `PeriodsPage` props.
- Extract `year` from `searchParams`, defaulting to the current year.
- Pass the parsed `year` to `getFiscalPeriods`.

### [Finance Components]

#### [MODIFY] [src/components/finance/periods/PeriodManagementClient.tsx](file:///Users/nugroho/Documents/polyflow/src/components/finance/periods/PeriodManagementClient.tsx)
- Remove `const [periods] = useState(initialPeriods)`.
- Use `initialPeriods` directly in the table rendering.
- Update the `Select`'s `onValueChange` to trigger a `router.push` with the new year as a query parameter.
- Ensure `year` state is initialized from the prop if possible, or just use the current year logic.

---

## Verification Plan

### Manual Verification
1.  **Year Switching**:
    - Navigate to `Finance > Fiscal Periods`.
    - Change the year in the dropdown from 2025 to 2026.
    - **Observation**: The URL should update to `?year=2026` and the table should refresh to show 2026 periods (or "No periods found").
2.  **Generation Visibility**:
    - Switch to a year with no periods (e.g., 2027 if available in dropdown).
    - Click **Generate Periods**.
    - **Observation**: After generation, the table should immediately populate with the 12 months for that year without a manual page reload.
3.  **Baseline Consistency**:
    - Ensure closing/reopening periods still works and reflects immediately in the UI.

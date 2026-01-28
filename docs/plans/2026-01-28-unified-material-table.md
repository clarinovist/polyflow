# Material Requirements UI Refinement: Unified Rich Table
**Goal:** Reduce UI redundancy by removing the separate Variance Analysis chart and integrating variance indicators directly into the Material Requirements table.
**Architecture:** Enhance the existing table in `ProductionOrderDetail` with variance columns and progress bars. Remove `VarianceAnalysis` component usage.
**Tech Stack:** React, Tailwind CSS, Lucide React.

### Task 1: Update Production Order Detail
**Files:**
- Modify: `src/app/[locale]/planning/orders/[id]/production-order-detail.tsx`

**Step 1: Remove VarianceAnalysis**
- Remove `<VarianceAnalysis />` component and its import.
- Remove the data transformation logic used for `VarianceAnalysis` props.

**Step 2: Enhance Materials Table Columns**
Add new columns/visuals to the existing table:
- **Planned**: Display quantity + unit.
- **Issued**: Display quantity + visual progress bar (green/red/yellow based on variance).
- **Variance**: Display numeric difference (+/-) and percentage badge.

**Step 3: Styling & Logic**
- Logic: `variance = issued - required`
- Logic: `variancePercent = (variance / required) * 100`
- Styling:
  - Over-issued (> 5%): Red text/bar.
  - Under-issued (< -5%): Yellow/Amber text/bar.
  - On Target (+/- 5%): Green text/bar.

**Step 4: Verify**
- Check "Materials" tab in Production Order Detail.
- Ensure Substitute materials are still handled correctly (displayed as "Unplanned Issue").

### Task 2: Verify & Clean up
- Run `npm run lint` to ensure no unused imports remain.

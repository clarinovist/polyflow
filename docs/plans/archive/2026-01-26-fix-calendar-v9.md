# Calendar V9 UI Fix Implementation Plan

**Goal:** Restore the Calendar component's functionality and visual integrity following a regression caused by react-day-picker v9 incompatibility.

**Architecture:** We will refine the `Calendar` component to properly support `react-day-picker` v9 without UI duplication and alignment issues. We will also ensure `SalesOrderForm` uses a robust date selection method.

**Tech Stack:** React, Tailwind CSS, react-day-picker v9, Lucide React.

### Task 1: Audit and Normalize Calendar Component

**Files:**
- Modify: `src/components/ui/calendar.tsx`

**Step 1: Fix Class Name Mapping for v9**
Ensure all class names are correctly mapped. In v9, `caption_label` should be hidden when `captionLayout="dropdown"`. I will use a more robust way to target it.

**Step 2: Fix Dropdown Alignment**
The screenshot shows dropdowns and labels together, and broken layout. I will:
- Set `caption_label` to `hidden` when dropdowns are active.
- Center the `caption_dropdowns` and ensure they are well-spaced.
- Fix the `nav` buttons absolute positioning to not interfere with dropdowns.

**Step 3: Fix Weekday and Day alignment**
The screenshot shows headers shifted. I will ensure `head_cell` and `cell` are properly aligned.

### Task 2: Update Sales Order Form

**Files:**
- Modify: `src/components/sales/SalesOrderForm.tsx`

**Step 1: Refine Calendar Props**
Ensure `captionLayout="dropdown"` is used correctly and `fromYear`/`toYear` are appropriate.

### Task 3: Global Verification

**Step 1: Test across workspaces**
Verify that the fix works in Sales, Inventory, and Finance.

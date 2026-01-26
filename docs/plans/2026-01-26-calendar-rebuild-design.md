# Calendar Component Rebuild Design

**Goal:** Provide a robust, visually consistent, and functional date picking experience across the PolyFlow ERP, resolving the current layout issues with `react-day-picker` v9.

## Current Issues
- **Dropdown Duplication**: Enabling dropdowns in v9 renders both labels and select elements unless explicitly hidden.
- **Header Alignment**: The weekday headers (`Su Mo Tu...`) are not properly mapped to the grid columns in our current Tailwind overrides.
- **Navigation Placement**: Absolute positioning of arrows conflicts with the widening of the header when dropdowns are active.
- **Brittle Styling**: Relying on complex Tailwind overrides for a component whose internal structure changed in v9.

## Proposed Approaches

### Approach 1: Native HTML5 Date Input (The "Inventory" Model)
Uses the browser's native date picker, styled to match the ERP.
- **Pros**: 100% robust, built-in mobile support, zero layout bugs, zero third-party styling conflicts.
- **Cons**: Less "premium" look on some browsers, less control over the specific calendar UI aesthetics.

### Approach 2: Robust react-day-picker v9 Integration
Rebuild the `Calendar` component using v9's native components and minimal Tailwind classes. We will use the `components` prop to explicitly render the Month and Year dropdowns, which gives us better control than just hiding labels via CSS.
- **Pros**: Matches shadcn-ui aesthetics, full control over design, consistent with existing components.
- **Cons**: Requires careful mapping of v9's new class system and structure.

### Approach 3: Dual Select + Optional Grid
Two selects for Month and Year (like the Finance module) but inside a popover that also shows a simple date grid.
- **Pros**: Impossible to fail at selecting month/year, very clear UX.
- **Cons**: More complex component logic.

## Recommendation
I recommend **Approach 2** for standardizing across the entire application. 

**Why it's best for standardization:**
- **Visual Cohesion**: It maintains the premium, modern ERP look consistently everywhere. Native inputs (Approach 1) look different on every browser/OS.
- **Functional Breadth**: `react-day-picker` supports complex features like date ranges, multiple months, and custom modifiers (holidays, weekends) which are essential for Production and Sales scheduling.
- **Future Proofing**: By fixing the core `Calendar` component properly for v9, all other components (like `DateRangePicker`) will benefit immediately.

Does this look right so far? Shall I proceed with implementing this robust v9 integration?

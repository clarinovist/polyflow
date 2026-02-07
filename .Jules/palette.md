## 2026-02-06 - Icon-Only Button Accessibility
**Learning:** The sidebar and navigation components (`SidebarNav`, `PortalSidebarBase`, `AdminBackButton`) frequently use icon-only buttons (Menu, Close, Theme, Logout) without `aria-label` attributes, relying only on visual icons or hover `title` tooltips which are insufficient for screen readers.
**Action:** When working on navigation components, always verify that icon-only buttons have an explicit `aria-label` describing the action (e.g., "Toggle theme", "Sign out", "Open sidebar").

## 2026-02-18 - Dashboard Refresh UX
**Learning:** `router.refresh()` in Next.js is effective for manual data updates but can be too fast to notice. Adding a minimum visual duration (e.g., 1s spinner) improves perceived responsiveness and "delight".
**Action:** When adding manual refresh actions, wrap the router call with a stateful delay to ensure users see the feedback.

## 2026-02-18 - Semantic Link Buttons
**Learning:** Wrapping a `<Button>` inside a `<Link>` creates invalid HTML (button inside anchor). Using `asChild` on the Button component allows the Link to inherit button styles while remaining a semantic anchor tag.
**Action:** Always use `<Button asChild><Link ...>...</Link></Button>` for navigation actions that look like buttons.

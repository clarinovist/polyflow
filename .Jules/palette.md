## 2026-02-06 - Icon-Only Button Accessibility
**Learning:** The sidebar and navigation components (`SidebarNav`, `PortalSidebarBase`, `AdminBackButton`) frequently use icon-only buttons (Menu, Close, Theme, Logout) without `aria-label` attributes, relying only on visual icons or hover `title` tooltips which are insufficient for screen readers.
**Action:** When working on navigation components, always verify that icon-only buttons have an explicit `aria-label` describing the action (e.g., "Toggle theme", "Sign out", "Open sidebar").

# UAT: Mobile Operational Suite

## Overview

Testing matrix untuk mobile operational suite — portal selector, Sales Field, Warehouse Mobile, Production Kiosk, dan fitur offline/telemetry terkait.

## Device/Viewport Matrix

| # | Device | Viewport | Browser |
|---|--------|----------|---------|
| 1 | iPhone SE (320×568) | 320px | Safari |
| 2 | iPhone 12/13 (375×812) | 375px | Safari |
| 3 | iPhone 14 Pro (390×844) | 390px | Safari |
| 4 | Pixel 5 (412×915) | 412px | Chrome Android |
| 5 | Galaxy S21 (360×800) | 360px | Chrome Android |
| 6 | Samsung Galaxy A12 (360×720) | 360px | Chrome Android |
| 7 | iPad Mini (768×1024) | 768px | Safari |
| 8 | Desktop (1280×720) | 1280px | Chrome |

## Network States

| # | State | Condition |
|---|-------|-----------|
| N1 | Online normal | WiFi/4G normal |
| N2 | Slow 4G | Throttled to 2 Mbps down, 1 Mbps up |
| N3 | Offline before action | Airplane mode before submitting |
| N4 | Connection lost during submit | Disconnect mid-request |
| N5 | Reconnect and retry | Reconnect after failure |
| N6 | Duplicate tap/retry | Double-tap submit button |

## Role Matrix

| # | Role | Expected Portals |
|---|------|-------------------|
| R1 | SALES | Sales Field (`/field/sales`) |
| R2 | SALES + MARKETING | No mobile portal (excluded) |
| R3 | WAREHOUSE | Warehouse Mobile (`/warehouse/mobile`) |
| R4 | PRODUCTION | Kiosk (`/kiosk`) |
| R5 | PRODUCTION + PLANNING | Kiosk only |
| R6 | SALES + WAREHOUSE | Portal selector (`/mobile`) |
| R7 | SALES + PRODUCTION | Portal selector (`/mobile`) |
| R8 | WAREHOUSE + PRODUCTION | Portal selector (`/mobile`) |
| R9 | FINANCE | No mobile portal → desktop required |
| R10 | HRD | No mobile portal → desktop required |
| R11 | PROCUREMENT | No mobile portal → desktop required |
| R12 | ADMIN | Bypass mobile gate (desktop preview) |
| R13 | Multi-role (SALES+WAREHOUSE+PRODUCTION) | Portal selector |
| R14 | User without permission | Desktop required page |

## Test Scenarios

### Phase 1: Portal Registry & Access

#### T1.1 — Mobile UA Detection
- [ ] iPhone Safari → detected as mobile
- [ ] Android Chrome → detected as mobile
- [ ] Desktop Chrome → not detected as mobile
- [ ] Null/empty UA → not detected as mobile

#### T1.2 — Portal Selector (`/mobile`)
- [ ] SALES-only user → redirected to `/field/sales`
- [ ] WAREHOUSE-only user → redirected to `/warehouse/mobile`
- [ ] PRODUCTION-only user → redirected to `/kiosk`
- [ ] Multi-role user → shows portal selector with correct options
- [ ] FINANCE/HRD/PROCUREMENT user → redirected to `/device/desktop-required`
- [ ] ADMIN with bypass cookie → sees portal selector

#### T1.3 — Mobile Allowlist
- [ ] `/field/sales` → accessible on mobile
- [ ] `/sales/mobile` → accessible (legacy, redirects)
- [ ] `/warehouse/mobile` → accessible on mobile
- [ ] `/kiosk` → accessible on mobile
- [ ] `/my` → accessible on mobile
- [ ] `/dashboard` → blocked, redirects to mobile home
- [ ] `/sales/orders` → blocked for SALES-only mobile
- [ ] `/finance` → blocked
- [ ] `/production` → blocked (redirects to kiosk)

#### T1.4 — Legacy Redirect
- [ ] `/sales/mobile` → `/field/sales`
- [ ] `/sales/mobile/orders` → `/field/sales/orders`
- [ ] `/sales/mobile/customers/123` → `/field/sales/customers/123`
- [ ] Query string preserved: `/sales/mobile?tab=orders` → `/field/sales?tab=orders`
- [ ] No redirect loop (desktop + mobile)

#### T1.5 — Permission Alias
- [ ] User with permission `/sales/mobile` can access `/field/sales`
- [ ] User with permission `/field/sales` can access `/field/sales`
- [ ] Direct route without permission → 403/redirect

### Phase 2: Sales Field Hardening

#### T2.1 — Sales Field Portal
- [ ] Home page loads with today's route/shift summary
- [ ] Bottom navigation works: Home, Customers, Orders, Visits, Stock
- [ ] Customer list loads and search works
- [ ] Customer detail shows visit history
- [ ] Order list loads
- [ ] Order detail loads
- [ ] Create order flow works
- [ ] Visit check-in works
- [ ] Stock lookup works
- [ ] Receivables list loads

#### T2.2 — Responsive Layout
- [ ] 320px: no horizontal overflow
- [ ] 375px: standard layout correct
- [ ] 390px: standard layout correct
- [ ] 412px: Android layout correct
- [ ] Bottom nav doesn't overlap sticky actions
- [ ] Tap targets ≥ 44×44px
- [ ] Safe area respected (notch, home indicator)

#### T2.3 — Loading/Empty/Error States
- [ ] Loading spinner shows during data fetch
- [ ] Empty state shows when no data
- [ ] Error state shows with retry button
- [ ] Offline banner shows when connection lost
- [ ] Retry works after reconnection

### Phase 3: Warehouse Mobile

#### T3.1 — Warehouse Mobile Portal
- [ ] Home page loads with today's shift summary
- [ ] Bottom nav works: Home, Incoming, Outgoing, Materials, Stock
- [ ] Incoming receipt flow works
- [ ] Outgoing/loading flow works
- [ ] Stock opname works
- [ ] Scan barcode works

### Phase 4: Production Kiosk

#### T4.1 — Kiosk Focus Mode
- [ ] Kiosk loads in focus mode (no bottom nav shell)
- [ ] Attendance flow works
- [ ] SPK list loads
- [ ] SPK execution works
- [ ] Output recording works
- [ ] Scrap/downtime recording works

### Phase 5: Cross-cutting

#### T5.1 — Offline Behavior (Sales Visit)
- [ ] Visit check-in queued when offline
- [ ] Queue persists across page refresh
- [ ] Queue syncs when reconnected
- [ ] Duplicate retry doesn't create duplicate visit
- [ ] Permanent error shows reason and allows discard

#### T5.2 — Telemetry
- [ ] Page view tracked with correct `portalId`
- [ ] Task started/completed tracked
- [ ] No sensitive data in telemetry payload
- [ ] Source is `MOBILE_WEB` for mobile portals

#### T5.3 — Auth & Security
- [ ] Unauthenticated → login redirect
- [ ] Direct URL without permission → blocked
- [ ] Tenant isolation: user A doesn't see user B's data
- [ ] Admin bypass works on mobile
- [ ] Session expiry works on mobile

## Sign-off

| Phase | Tester | Date | Pass/Fail | Notes |
|-------|--------|------|-----------|-------|
| Phase 1 | | | | |
| Phase 2 | | | | |
| Phase 3 | | | | |
| Phase 4 | | | | |
| Phase 5 | | | | |

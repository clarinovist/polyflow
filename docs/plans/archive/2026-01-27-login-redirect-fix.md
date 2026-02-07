# Brainstorming: Login Redirect & Blank Page Fix

## Root Cause Analysis
The issue stems from a conflict between the **Server Action Redirect Logic** and the **Internationalization (i18n) Configuration**.

1.  **Configuration**: Your `src/i18n/config.ts` is set to `localePrefix = 'always'`. This means **every** URL must have a language code (e.g., `/en/dashboard`).
2.  **Implementation**: In `src/actions/auth.actions.ts`, the code removes the prefix for the default locale (English):
    ```typescript
    // returns empty string for 'en'
    const localePrefix = locale && locale !== defaultLocale ? `/${locale}` : '';
    ```
3.  **Resulting Behavior**:
    *   User logs in.
    *   Action redirects user to `/dashboard` (No prefix).
    *   **Browser loads `/dashboard`**.
    *   Middleware (`proxy.ts`) intercepts, sees no prefix, and enforces `always`.
    *   **Middleware redirects (307) to `/en/dashboard`**.
    *   **Browser loads `/en/dashboard`**.

This rapid "Double Redirect" (POST -> 303 -> 307 -> 200) often causes race conditions in hydration or cookie setting, appearing as a blank page until a hard refresh stabilizes the state.

---

## Proposed Approaches

### Approach A: Synchronize Action with Config (Recommended)
Modify `auth.actions.ts` to respect the `always` prefix rule. We will import the logic directly or replicate it so the Action sends the user to the *correct* final URL immediately.

*   **Changes**: Update `src/actions/auth.actions.ts` to always append the locale, or use `radix-ui` / `next-intl` navigation helpers if available (or just manual logic).
*   **Pros**:
    *   Eliminates the middleware redirect.
    *   Faster login (1 roundtrip less).
    *   Fixes the root cause without changing URL structure.
*   **Cons**:
    *   None significant.

### Approach B: Relax URL Requirement
Change the configuration to `as-needed`. This means the default language (English) will *not* have a prefix, making `/dashboard` the valid, final URL.

*   **Changes**: Update `src/i18n/config.ts` to set `localePrefix = 'as-needed'`.
*   **Pros**:
    *   Cleaner URLs (`/dashboard` instead of `/en/dashboard`).
    *   Matches current `auth.actions.ts` logic.
*   **Cons**:
    *   Inconsistent URL structure (some have `/id/`, some have nothing).
    *   Might affect SEO or other hardcoded links expecting strict prefixes.

### Approach C: Client-Side Navigation
Instead of dealing with `redirect()` on the server, the Server Action returns a `{ success: true, url: '...' }` object, and the React Component (`LoginForm`) uses `router.push()` to navigate.

*   **Changes**: removing `redirect` from Action, updating `LoginForm.tsx`.
*   **Pros**:
    *   Smoothest transition (no full page reload feeling).
    *    easier to handle loading states.
*   **Cons**:
    *   Refactor required in both Front & Back.
    *   Cookie set timing must be handled carefully (usually fine with Server Actions).

## Recommendation
**Approach A** is the safest and quickest fix that maintains your current strict URL structure (`/en/...`) while solving the performance/blank page glitch.

# Localization Implementation Checklist

## Phase 7A: Foundation Setup
- [x] Install and configure `next-intl` library
- [x] Create i18n configuration files
  - [x] `src/i18n/config.ts`
  - [x] `src/i18n/request.ts`
- [x] Create locale folder structure
  - [x] `src/messages/id.json`
  - [x] `src/messages/en.json`
- [x] Setup middleware for locale detection (combining with NextAuth)
- [x] Refactor App Router Structure (Move pages to `[locale]`)
  - [x] Move `layout.tsx` logic
  - [x] Move top-level pages
- [ ] Create `useTranslations` hook wrapper (optional, or just use direct)
- [ ] Add language switcher component

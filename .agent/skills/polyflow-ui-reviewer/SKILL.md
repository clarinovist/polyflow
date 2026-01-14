---
name: polyflow-ui-reviewer
description: Reviews UI/UX implementation against the PolyFlow Design System. Use when checking React components, CSS files, or dashboard layouts to ensure Zinc-neutral consistency and accessibility.
---

# PolyFlow UI/UX Reviewer

This skill ensures that every UI element aligns with the **PolyFlow Design System** and follows the professional aesthetic required for an ERP system.

## Core Design Principles
- **Clean & Modern**: Minimalist design with intentional white space.
- **Professional**: Business-focused aesthetic using the Zinc/Gray color palette.
- **Accessible**: High contrast and readable typography using Geist Sans.

## Review Checklist

### 1. Colors & Theming (Zinc-First)
- **Core Palette**: Ensure use of `zinc-900` (#18181b) for primary actions and `zinc-500` (#71717a) for secondary text.
- **Semantic Colors**: Use predefined tokens for status:
  - **Success**: `#22c55e`
  - **Warning**: `#f59e0b`
  - **Error/Destructive**: `#dc2626`
- **Token Usage**: Flag any hardcoded hex values; suggest using semantic tokens from `design-tokens.ts` (e.g., `colors.primary.DEFAULT`).

### 2. Spacing & Layout
- **Grid**: All spacing must be multiples of **4px** (Tailwind default).
- **Padding**: Standard cards should typically use `p-6` (24px).
- **Container Radius**: 
  - Inputs/Buttons: `rounded-lg` (8px).
  - Cards: `rounded-xl` (10px).

### 3. Components & Typography
- **Buttons**:
  - Default height: `h-9` (36px).
  - Large/Auth height: `h-12` (48px).
- **Inputs**: Standard height should be `h-12` with `zinc-200` borders.
- **Typography**: Check for
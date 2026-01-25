# PolyFlow Design System

A comprehensive design system for PolyFlow ERP, ensuring visual consistency across all pages and components.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Colors](#colors)
3. [Typography](#typography)
4. [Spacing](#spacing)
5. [Border Radius](#border-radius)
6. [Shadows](#shadows)
7. [Components](#components)
8. [Patterns](#patterns)
9. [Icons](#icons)
10. [Animations](#animations)

---

## Design Principles

### Core Values

| Principle | Description |
|-----------|-------------|
| **Clean & Modern** | Minimalist design with plenty of white space |
| **Professional** | Business-focused aesthetic suitable for ERP |
| **Accessible** | High contrast, readable typography |
| **Consistent** | Unified visual language across all pages |
| **Responsive** | Works seamlessly on desktop, tablet, and mobile |

### Visual Style

- **Primary Style**: Modern, neutral-focused with zinc/gray tones
- **Accent Usage**: Minimal, purposeful color accents
- **Dark Mode**: Full support with carefully balanced contrast

---

## Colors

PolyFlow uses a **neutral-first** color palette based on Zinc tones, with semantic colors for specific purposes.

### Core Palette

#### Light Mode

| Token | OKLCH Value | Hex Approx | Usage |
|-------|-------------|------------|-------|
| `--background` | `oklch(1 0 0)` | `#ffffff` | Page background |
| `--foreground` | `oklch(0.145 0 0)` | `#18181b` | Primary text |
| `--primary` | `oklch(0.205 0 0)` | `#18181b` | Primary buttons, links |
| `--primary-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text on primary |
| `--secondary` | `oklch(0.97 0 0)` | `#f4f4f5` | Secondary backgrounds |
| `--muted` | `oklch(0.97 0 0)` | `#f4f4f5` | Subtle backgrounds |
| `--muted-foreground` | `oklch(0.556 0 0)` | `#71717a` | Secondary text |
| `--border` | `oklch(0.922 0 0)` | `#e4e4e7` | Borders |
| `--input` | `oklch(0.922 0 0)` | `#e4e4e7` | Input borders |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#dc2626` | Error states |

#### Dark Mode

| Token | OKLCH Value | Hex Approx | Usage |
|-------|-------------|------------|-------|
| `--background` | `oklch(0.145 0 0)` | `#18181b` | Page background |
| `--foreground` | `oklch(0.985 0 0)` | `#fafafa` | Primary text |
| `--primary` | `oklch(0.922 0 0)` | `#e4e4e7` | Primary buttons |
| `--card` | `oklch(0.205 0 0)` | `#27272a` | Card backgrounds |
| `--muted` | `oklch(0.269 0 0)` | `#3f3f46` | Subtle backgrounds |
| `--border` | `oklch(1 0 0 / 10%)` | `rgba(255,255,255,0.1)` | Borders |

### Semantic Colors

```css
/* Status Colors */
--success: #22c55e;    /* Green - Success states */
--warning: #f59e0b;    /* Amber - Warning states */
--error: #dc2626;      /* Red - Error states */
--info: #3b82f6;       /* Blue - Info states */
```

### Usage Guidelines

```tsx
// ✅ Correct - Use semantic tokens
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// ❌ Avoid - Hardcoded colors
<div className="bg-white text-black">
<Button className="bg-zinc-900 text-white">
```

---

## Typography

### Font Family

```css
--font-sans: var(--font-geist-sans);  /* Primary */
--font-mono: var(--font-geist-mono);  /* Code */
```

### Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| **Display** | `text-4xl` (36px) | `font-bold` | 1.1 | Hero headings |
| **H1** | `text-3xl` (30px) | `font-bold` | 1.2 | Page titles |
| **H2** | `text-2xl` (24px) | `font-semibold` | 1.3 | Section headings |
| **H3** | `text-xl` (20px) | `font-semibold` | 1.4 | Subsections |
| **H4** | `text-lg` (18px) | `font-medium` | 1.5 | Card titles |
| **Body** | `text-base` (16px) | `font-normal` | 1.6 | Default text |
| **Small** | `text-sm` (14px) | `font-normal` | 1.5 | Secondary text |
| **XSmall** | `text-xs` (12px) | `font-medium` | 1.4 | Labels, captions |

### Text Colors

| Class | Usage |
|-------|-------|
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary/helper text |
| `text-zinc-400` | Placeholder text |
| `text-destructive` | Error text |

---

## Spacing

Based on a **4px base unit** (Tailwind default).

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing |
| `space-2` | 8px | Between related elements |
| `space-3` | 12px | Small gaps |
| `space-4` | 16px | Default spacing |
| `space-5` | 20px | Medium spacing |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Large gaps |
| `space-10` | 40px | Extra large gaps |
| `space-12` | 48px | Page sections |

### Common Patterns

```tsx
// Card internal padding
<div className="p-6">

// Form field spacing
<div className="space-y-4">

// Section spacing
<section className="py-12">

// Input/Button height
<input className="h-12">  // 48px for touch targets
<button className="h-9">  // 36px default
```

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, badges |
| `--radius-md` | 8px | Inputs, small buttons |
| `--radius-lg` | 10px | Cards, containers |
| `--radius-xl` | 14px | Large cards |
| `--radius-2xl` | 18px | Feature cards |
| `--radius-full` | 9999px | Avatars, pills |

### Usage

```tsx
// Standard card
<div className="rounded-xl">

// Input fields
<input className="rounded-lg">

// Buttons
<button className="rounded-lg">

// Avatars
<div className="rounded-full">
```

---

### Industrial Glassmorphism (Brand Design System)

The core aesthetic of PolyFlow "Mother Office" is based on high-end industrial glassmorphism. This is formalized in the `BrandCard` component.

#### Brand Tokens

| Token | Description | Value |
|-------|-------------|-------|
| `--color-brand-glass` | Semi-transparent background | `oklch(1 0 0 / 40%)` |
| `--color-brand-glass-heavy` | Near-opaque background | `oklch(1 0 0 / 95%)` |
| `--color-brand-border` | Subtle glass border | `oklch(1 0 0 / 10%)` |
| `--blur-brand` | Standard backdrop blur | `20px` |
| `--shadow-brand` | Deep industrial shadow | Custom 50px spread |

#### Usage with BrandCard

```tsx
import { BrandCard, BrandCardContent, BrandCardHeader, BrandGradientText } from '@/components/brand/BrandCard';

// Standard Glass Panel
<BrandCard>
  <BrandCardHeader>...</BrandCardHeader>
  <BrandCardContent>...</BrandCardContent>
</BrandCard>

// Heavy Panel (for Dialogs/Modals)
<BrandCard variant="heavy">...</BrandCard>

// Hero Text with Animated Gradient
<BrandGradientText className="text-4xl font-black">
  Master Recipes
</BrandGradientText>
```

---

## Components

### Buttons

#### Variants

| Variant | Class | Usage |
|---------|-------|-------|
| **Primary** | `bg-zinc-900 text-white` | Main actions |
| **Secondary** | `bg-secondary text-secondary-foreground` | Secondary actions |
| **Outline** | `border bg-background` | Tertiary actions |
| **Ghost** | `hover:bg-accent` | Subtle actions |
| **Destructive** | `bg-destructive text-white` | Dangerous actions |

#### Sizes

| Size | Height | Class |
|------|--------|-------|
| **SM** | 32px | `h-8` |
| **Default** | 36px | `h-9` |
| **LG** | 40px | `h-10` |
| **XL** | 48px | `h-12` |

#### Primary Button Example

```tsx
<Button className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-lg transition-all duration-200 active:scale-[0.98]">
    Sign in
</Button>
```

---

### Inputs

#### Standard Input

```tsx
<Input className="h-12 bg-white border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
```

#### Input with Icon

```tsx
<div className="relative">
    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
    <Input className="pl-10 h-12" placeholder="Email" />
</div>
```

---

### Cards

#### Standard Card

```tsx
<Card className="rounded-xl border shadow-sm">
    <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
    </CardHeader>
    <CardContent>Content</CardContent>
</Card>
```

#### Dark Feature Card

```tsx
<div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6">
    <h3 className="text-white font-semibold text-lg mb-2">Title</h3>
    <p className="text-zinc-400 text-sm">Description</p>
</div>
```

---

### Avatar Stack

For displaying multiple users:

```tsx
<div className="flex -space-x-2">
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-zinc-900 flex items-center justify-center text-white text-xs font-medium">
        JD
    </div>
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-zinc-900">
        AK
    </div>
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-zinc-900">
        +5
    </div>
</div>
```

---

## Patterns

### Split Screen Layout (Auth Pages)

Two-panel layout for authentication pages:

```tsx
<main className="flex min-h-screen">
    {/* Left Panel - Form (white) */}
    <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-white">
        <LoginForm />
    </div>
    
    {/* Right Panel - Brand (dark) */}
    <div className="hidden lg:flex lg:w-1/2 bg-zinc-950">
        <BrandContent />
    </div>
</main>
```

### Subtle Background Pattern

```tsx
<div className="bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50" />
```

### 3D Layered Effect

For decorative background elements:

```tsx
<div className="absolute opacity-15">
    {/* Layer 1 - Back */}
    <div className="transform translate-x-6 translate-y-6">
        <svg>...</svg>
    </div>
    {/* Layer 2 - Middle */}
    <div className="transform translate-x-3 translate-y-3">
        <svg>...</svg>
    </div>
    {/* Layer 3 - Front */}
    <div>
        <svg>...</svg>
    </div>
</div>
```

---

## Icons

### Library

We use **Lucide React** for icons.

```tsx
import { Mail, Lock, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
```

### Sizes

| Size | Class | Usage |
|------|-------|-------|
| **SM** | `h-4 w-4` | In buttons, inline |
| **MD** | `h-5 w-5` | Input icons, lists |
| **LG** | `h-6 w-6` | Standalone icons |
| **XL** | `h-8 w-8` | Feature icons |

### Input Icon Pattern

```tsx
<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
```

---

## Animations

### Transitions

| Type | Duration | Usage |
|------|----------|-------|
| **Fast** | `duration-150` | Hover states |
| **Normal** | `duration-200` | Button presses |
| **Slow** | `duration-300` | Page transitions |

### Common Effects

```tsx
// Button hover & active
className="transition-all duration-200 hover:bg-zinc-800 active:scale-[0.98]"

// Focus ring
className="focus:ring-2 focus:ring-zinc-900/10"

// Fade in animation
className="animate-in fade-in"

// Slide in animation
className="animate-in slide-in-from-top-1"
```

### Loading States

```tsx
<Loader2 className="h-5 w-5 animate-spin" />
```

---

## File Reference

### Core Files

| File | Purpose |
|------|---------|
| [globals.css](file:///Users/nugroho/Documents/polyflow/src/app/globals.css) | CSS variables, theme tokens |
| [button.tsx](file:///Users/nugroho/Documents/polyflow/src/components/ui/button.tsx) | Button component |
| [input.tsx](file:///Users/nugroho/Documents/polyflow/src/components/ui/input.tsx) | Input component |
| [card.tsx](file:///Users/nugroho/Documents/polyflow/src/components/ui/card.tsx) | Card components |

### Auth Components

| File | Purpose |
|------|---------|
| [polyflow-logo.tsx](file:///Users/nugroho/Documents/polyflow/src/components/auth/polyflow-logo.tsx) | Logo component |
| [brand-panel.tsx](file:///Users/nugroho/Documents/polyflow/src/components/auth/brand-panel.tsx) | Dark branded panel |
| [login-form.tsx](file:///Users/nugroho/Documents/polyflow/src/components/auth/login-form.tsx) | Login form |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│  POLYFLOW DESIGN SYSTEM - QUICK REFERENCE               │
├─────────────────────────────────────────────────────────┤
│  Colors                                                 │
│  • Primary: zinc-900 (#18181b)                          │
│  • Background: white / zinc-950                         │
│  • Text: foreground / muted-foreground                  │
│  • Border: zinc-200 / zinc-800                          │
├─────────────────────────────────────────────────────────┤
│  Sizing                                                 │
│  • Button height: h-9 (default), h-12 (large)           │
│  • Input height: h-12                                   │
│  • Border radius: rounded-lg (inputs), rounded-xl (cards)│
├─────────────────────────────────────────────────────────┤
│  Typography                                             │
│  • Headings: font-bold / font-semibold                  │
│  • Body: text-sm or text-base                           │
│  • Muted: text-zinc-400 / text-muted-foreground         │
├─────────────────────────────────────────────────────────┤
│  Spacing                                                │
│  • Card padding: p-6                                    │
│  • Form spacing: space-y-4 or space-y-5                 │
│  • Section gap: py-10 or py-12                          │
└─────────────────────────────────────────────────────────┘
```

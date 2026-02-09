# Accounting Module for Non-Accountants — Brainstorming & Design Ideas

**Goal:** Make PolyFlow's accounting module usable by non-accounting staff (e.g., operations managers, warehouse leads, admin assistants) without compromising data integrity.

**Context:** Polyflow is a manufacturing ERP for plastic production. Current accounting module has 33+ pages covering journals, COA, reports, budgets, invoices, assets, payments, and more. The UX currently assumes accounting knowledge (debit/credit, account codes, trial balance jargon).

---

## 🔴 Pain Points Identified (Current State)

| Pain Point | Where | Why It's Hard |
|---|---|---|
| **Debit/Credit columns** | Manual Journal Form | Non-accountants don't understand double-entry |
| **Raw account codes** (e.g., 13100, 51000) | Account Combobox | Meaningless numbers without context |
| **Only 3 templates** | `accounting-templates.ts` | Salary, Rent, Depreciation — missing most daily ops |
| **Technical report names** | Reports pages | "Trial Balance", "Income Statement" — jargon-heavy |
| **No guided workflows** | All journal creation | User must know *which* accounts to use |
| **No validation guardrails** | Manual Journal Form | Only checks if balanced, not if accounts make sense |
| **Fiscal periods** | Periods page | "Close fiscal period" is scary for non-accountants |

---

## 💡 Ideas & Approaches

### Approach 1: "Transaction Wizard" (Recommended ⭐)

**Concept:** Replace raw journal entry with a **natural language transaction form**.

Instead of:
```
Account: 51000 (COGS-RM)  |  Debit: 5,000,000  |  Credit: 0
Account: 13100 (Inv-RM)   |  Debit: 0          |  Credit: 5,000,000
```

The user sees:
```
What happened?  → [I used raw materials for production]
Amount?         → [Rp 5,000,000]
From where?     → [Raw Material Warehouse]
For what?       → [Work Order WO-260207-MIX99]
```

**Trade-offs:**
- ✅ Zero accounting knowledge required
- ✅ System auto-generates correct debit/credit entries behind the scenes
- ⚠️ Requires defining all possible transaction types upfront
- ⚠️ Power users (actual accountants) might find it restrictive

**Implementation idea:**
- Create a `TransactionType` enum with categories: `PURCHASE`, `MATERIAL_ISSUE`, `PRODUCTION_OUTPUT`, `SALE`, `EXPENSE_PAYMENT`, `SALARY`, etc.
- Each type has a pre-mapped debit/credit rule (already partially exists in `accounting-templates.ts`)
- Wizard UI with step-by-step form instead of table
- Advanced mode toggle for accountants who want raw journal entry

---

### Approach 2: "Smart Templates" with Massive Expansion

**Concept:** Keep the current journal form but dramatically expand templates and add **category-based grouping + search**.

Current state: 3 templates. Proposed: **20-30 templates** organized by department:

| Category | Templates |
|---|---|
| **🏭 Production** | Material Issue, Production Output, Scrap Recording, Regrind Usage |
| **📦 Inventory** | Purchase Receipt, Stock Adjustment, Transfer Between Warehouses |
| **💰 Sales** | Sales Invoice, Sales Return, Delivery Cost |
| **💳 Payments** | Supplier Payment, Customer Receipt, Petty Cash |
| **🏢 Operations** | Rent, Utilities, Equipment Maintenance, Cleaning Supplies |
| **👥 Payroll** | Monthly Salary, Overtime, THR/Bonus, BPJS |
| **📊 Period-End** | Depreciation, Inventory Count Adjustment, Accruals |

**Trade-offs:**
- ✅ Minimal code changes — extends existing system
- ✅ Accountants still have full control
- ⚠️ Users still see debit/credit (just pre-filled)
- ⚠️ Need to understand which template to pick

---

### Approach 3: "Dual Mode" UI

**Concept:** Two distinct interfaces that generate the same data:

1. **Simple Mode** (default for non-accountants):
   - Card-based UI with big icons per transaction type
   - "Record a Purchase", "Record a Sale", "Pay a Bill"
   - Simple form: Amount, Date, Description, Reference
   - No debit/credit visible at all
   - Color-coded: 🟢 Money In, 🔴 Money Out

2. **Professional Mode** (for accountants):
   - Current manual journal form
   - Full COA access, debit/credit columns
   - Balance sheet / trial balance reports

**Trade-offs:**
- ✅ Best of both worlds
- ✅ Non-accountants never see confusing terms
- ⚠️ Two UIs to maintain
- ⚠️ Need a toggle or role-based visibility

---

## 🎯 Additional UX Improvements (Can Complement Any Approach)

### 1. Friendly Report Names & Descriptions
Instead of just "Trial Balance", show:
- **"Account Summary"** — *See all your accounts and their current balances*
- **"Profit & Loss"** — *How much you earned vs spent this period*
- **"Financial Position"** — *What you own, owe, and your net worth*

### 2. Accounting Glossary Tooltips
Add `(?)` tooltips next to every accounting term:
- "Debit" → *"The left side of a transaction. For assets & expenses, debit means increase."*
- "Credit" → *"The right side. For revenue & liabilities, credit means increase."*
- "Posting" → *"Making this entry official and permanent in the books."*

### 3. Visual Balance Indicator
Replace the text "Balanced / Unbalanced" with a **visual scale animation** that tips left/right as user enters amounts, becoming level when balanced.

### 4. Dashboard for Non-Accountants
A simplified finance dashboard showing:
- 💰 "Cash Available" (not "Cash & Cash Equivalents Balance")
- 📈 "Monthly Income" (not "Net Income from Operations")
- 📉 "Monthly Expenses" (not "Total Operating Expenditure")
- 🏦 "Outstanding Bills" (not "Accounts Payable Aging")
- 📊 Simple trend charts with plain-language captions

### 5. Contextual Auto-Journals
Make other modules (Production, Inventory, Sales) automatically create journals:
- ✅ Already partially implemented via `inventory-link-service.ts`
- Expand to cover: Sales Order → Invoice → Payment flow
- Non-accountant never touches the journal — just does their job

### 6. Role-Based Page Visibility
Hide advanced finance pages from non-accounting roles:
- **Everyone sees:** Dashboard, Invoices (simplified), Payments
- **Finance team sees:** COA, Manual Journals, Reports, Periods, Budgets
- **Admin sees:** Everything

### 7. Indonesian Language Support for Accounting Terms
Since Polyflow targets Indonesian manufacturers:
- Show Indonesian term alongside English: "Laba Rugi (Profit & Loss)"
- Templates with Indonesian descriptions
- Currency always in Rupiah format (already done via `formatRupiah`)

---

## 📋 Prioritization Recommendation

| Priority | Item | Effort | Impact |
|---|---|---|---|
| **P0** | Expand templates to 20+ (Approach 2) | Low | High |
| **P0** | Contextual auto-journals from Inventory/Production | Medium | Very High |
| **P1** | Friendly report names + tooltips | Low | Medium |
| **P1** | Transaction Wizard simple mode (Approach 1/3) | High | Very High |
| **P1** | Non-accountant dashboard | Medium | High |
| **P2** | Role-based page visibility | Medium | Medium |
| **P2** | Visual balance indicator | Low | Low |
| **P2** | Indonesian terminology | Low | Medium |

---

## Next Steps

> [!IMPORTANT]
> This is a brainstorming document for discussion. Before implementing, we should:
> 1. Pick which approach(es) you want to pursue
> 2. Identify which transaction types are most common in your daily operations
> 3. Decide if role-based visibility is needed now or later
> 4. Create a detailed implementation plan for the chosen approach

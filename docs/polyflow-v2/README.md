# PolyFlow v2 Documentation Hub

**Status:** Official documentation hub for the PolyFlow v2 architecture and implementation track.

Folder ini menjadi pusat dokumen untuk pengembangan PolyFlow v2 supaya roadmap, phase plan, module guide, risk review, dan implementation notes tidak tercecer di root `docs/` atau `docs/plans/`.

---

## Documents

| Document | Purpose |
|---|---|
| [`architecture-roadmap.md`](./architecture-roadmap.md) | Master roadmap arsitektur PolyFlow v2: modular monolith, tenant safety, ledger-first inventory, Finance & Accounting, reporting, AI guardrails. |

---

## Folder Rules

Simpan dokumen PolyFlow v2 baru di folder ini.

Recommended naming:

```txt
phase-0-baseline-checklist.md
phase-1-module-boundary-pilot.md
tenant-ops-hardening-plan.md
inventory-ledger-design.md
finance-accounting-event-engine.md
production-state-machine.md
reporting-read-models.md
ai-assistant-guardrails.md
adr-<topic>.md
```

Gunakan `docs/plans/` hanya untuk local/temporary planning notes. Folder itu di-ignore oleh git, jadi bukan tempat ideal untuk dokumen resmi.

---

## Related Implementation Template

Official module scaffold template lives in:

```txt
src/modules/_template/
```

Template tersebut dipakai saat membuat module baru atau saat migrasi bertahap dari struktur lama ke `src/modules/<domain>/`.

---

## Current Recommended Next Documents

1. `phase-0-baseline-checklist.md`
2. `script-risk-audit.md`
3. `tenant-ops-hardening-plan.md`
4. `inventory-ledger-design.md`
5. `finance-accounting-event-engine.md`

# Evaluasi Input Produksi: WhatsApp (WATI) vs Custom App

**Tanggal:** 2026-06-08  
**Konteks:** Ganti form kertas & kiosk untuk pekerja produksi  
**Status:** Draft untuk diskusi lanjutan

---

## Latar Belakang
- Saat ini: form kertas (ditulis manual) + kiosk (kurang efektif)
- Tujuan: Adaptasi mudah, data bersih, audit trail, biaya terjangkau
- Skala: ~50 pekerja produksi, multi-shift

---

## Perbandingan Ringkas

| Faktor | WhatsApp (via BSP: WATI/Qontak) | Custom App (Play Store) |
|--------|----------------------------------|-------------------------|
| **Adopsi hari-1** | ✅ 100% — sudah terinstall | ❌ Butuh install + onboarding |
| **Biaya setup** | ~$200–500 | ~$8k–15k (2–3 dev × 6–8 minggu) |
| **Biaya bulanan** | $100–300 (per message) | $50–100 (server + push) |
| **Total 12 bln** | **$1.5k–4k** | **$14k–27k** |
| **Scan barcode/QR** | ❌ Terbatas (via chat) | ✅ Native camera + ML Kit |
| **Offline** | ❌ Tidak native | ✅ SQLite local + sync |
| **Hardware integrasi** | ❌ Tidak | ✅ Bluetooth scale, Zebra, printer |
| **Update deploy** | ✅ Server-side instan | ❌ Review Play Store (1–3 hari) |
| **Data ownership** | ⚠️ Server Meta/BSP | ✅ Server sendiri penuh |
| **Pekerja ganti HP** | ✅ Login WA → data ikut | ❌ Install ulang + login |

---

## Risiko WhatsApp yang Harus Ditangani

| Risiko | Mitigasi Minimal |
|--------|------------------|
| Format data kacau (teks bebas) | **Template terstruktur** (quick reply / list message / button) |
| Salah field (qty ke batch) | Validasi server-side + konfirmasi balik |
| Tidak ada audit trail | Log otomatis: `user_id + timestamp + raw_msg + parsed_json` |
| Spam / salah kirim | **State machine** — bot hanya terima input saat state cocok |
| No accountability | **Konfirmasi balik** ("Terima: 5 dus SKU-A batch #123 — balas ✅") |
| Sinyal lemah / HP mati | Offline queue butuh app pendamping (WA Business API gak native) |
| PII / data bocor | Pakai **BSP resmi** (WATI/Qontak/Twilio) — **bukan** WA pribadi |

---

## Rekomendasi: Hybrid Pragmatis

```
Bulan 1–3:  WA (WATI) → validasi flow, kumpulkan data real, latih pekerja
    │
    ├── Kalau adopsi >80% & data bersih → lanjut WA, tambah fitur via BSP
    └── Kalau butuh scan barcode/offline/hardware → bangun app native (React Native / Flutter)
           │
           └── App nanti bisa *juga* kirim notif via WA (best of both worlds)
```

**Alasan:**
- Risiko terendah — tidak *locked in* ke satu tech
- Budget terkontrol — bayar dev app *sesudah* bukti butuh
- Pekerja tidak kaget — WA dulu, nanti app (bisa deep-link dari WA ke app)

---

## Conversation Flow Contoh (WA Terstruktur)

```
Bot: "Input Produksi - Pilih Shift" → [Quick Reply: Pagi / Siang / Malam]
User: "Pagi"
Bot: "SKU?" → [List Message: SKU-A, SKU-B, SKU-C]
User: "SKU-A"
Bot: "Qty (angka saja):" → [User ketik: 50]
Bot: "Batch # (scan/tulis):" → [User kirim foto / ketik]
Bot: "✅ Konfirmasi: Shift Pagi | SKU-A | 50 pcs | Batch #123\nBalas ✅ kalau benar, ❌ kalau salah"
```

**Integrasi ke PolyFlow:**  
Webhook WA → validasi → `POST /api/production/entries` (idempotent key: `wa_msg_id`)

---

## Next Steps (Jika Setuju Pilot WA)

1. **Setup WATI trial** (1 hari) — template message + webhook ke staging
2. **Desain conversation flow** lengkap per shift/line
3. **Pilot 1 line / 1 shift** — 2 minggu, logging penuh, interview pekerja
4. **Evaluasi** — adopsi, error rate, feedback → lanjut / pivot ke app

---

## Referensi BSP Indonesia (Untuk Banding Harga)

| BSP | Keunggulan | Estimasi Bulanan |
|-----|------------|------------------|
| **WATI** | UI bagus, template management, multi-agent | ~$100–200 |
| **Qontak (Mekari)** | Integrasi ERP/CRM Mekari, support ID | ~$150–300 |
| **KirimWA** | Murah, sederhana, API standar | ~$50–150 |
| **Twilio** | Global, enterprise-grade, mahal | ~$200–500+ |

---

## Catatan Tambahan

- **Jangan pakai WA pribadi / WA Business App biasa** — tidak punya audit log, webhook terstruktur, compliance PDPA
- **Fallback kertas tetep disediakan** — untuk hari sinyal mati / HP rusak / pekerja baru belum onboarding
- **Training & change management** butuh 2–3 hari di lantai produksi

---

## Keputusan Tertunda

- [ ] Setuju pilot WA (WATI) 1 line 2 minggu?
- [ ] Siapa PIC di lantai untuk training & support?
- [ ] Budget approval untuk BSP fee 3 bulan pertama?
- [ ] Timeline evaluasi hasil pilot → lanjut / pivot app?

---

*Document ini untuk referensi diskusi lanjutan. Update saat ada keputusan baru.*
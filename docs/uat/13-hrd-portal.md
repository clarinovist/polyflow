# UAT: Portal HRD — Command Board & IA

**Date:** 2026-07-22  
**Surface:** `/hrd`  
**Status:** Ready for testing

---

## TC-HRD-HOME-001: Board KPI + attention

**Preconditions:** User with HRD access logged in.  
**Steps:**
1. Navigate to `/hrd`
2. Verify 6 KPI cards visible: Hadir hari ini, Cuti pending, Kasbon outstanding, Periode OPEN, Peserta BPJS, Alert HR unread
3. Verify "Butuh Perhatian" section visible with 3 columns: Cuti/izin menunggu, Alert kontrak/probation, Periode gaji terbuka

**Expected:**
- KPI cards show real counts
- Attention lists show top 5 items each (or empty state message)
- Each attention item has deep link

---

## TC-HRD-HOME-002: Cuti pending deep link approve

**Preconditions:** At least 1 leave request with PENDING status.  
**Steps:**
1. Navigate to `/hrd`
2. In "Cuti/izin menunggu" attention section, click on a leave request row
3. Verify navigation to `/hrd/leave`

**Expected:**
- Click navigates to leave page
- Leave request is visible in the list for processing

---

## TC-HRD-HOME-003: Alert unread list

**Preconditions:** At least 1 unread HRD_PROBATION_ENDING or HRD_CONTRACT_EXPIRING notification.  
**Steps:**
1. Navigate to `/hrd`
2. In "Alert kontrak/probation" attention section, verify alert items visible
3. Click on an alert row
4. Verify navigation to `/hrd/alerts`

**Expected:**
- Alert shows title and type (Probation/Kontrak)
- Click navigates to alerts page

---

## TC-HRD-HOME-004: Open period → payroll monthly

**Preconditions:** At least 1 payroll period with OPEN status.  
**Steps:**
1. Navigate to `/hrd`
2. In "Periode gaji terbuka" attention section, verify period items visible
3. Click on a period row
4. Verify navigation to `/hrd/payroll-monthly`

**Expected:**
- Period shows label (e.g., "Juli 2026") and OPEN status
- Click navigates to payroll monthly page

---

## TC-HRD-PAY-001: Guidance dual payroll jelas

**Steps:**
1. Navigate to `/hrd`
2. Verify "Panduan Gaji" section visible
3. Verify guidance text: "Borongan/harian → Gaji Mingguan" and "Bulanan/kantor → Gaji Bulanan + BPJS"
4. Verify links to `/hrd/payroll` and `/hrd/payroll-monthly`

**Expected:**
- Guidance section visible with amber background
- Both links are clickable and navigate correctly

---

## TC-HRD-ATT-001: Hadir hari ini = PRESENT count

**Steps:**
1. Navigate to `/hrd`
2. Check "Hadir hari ini" KPI value
3. Navigate to `/hrd/attendance` and verify the count matches unique PRESENT employees

**Expected:**
- KPI shows count of unique employees with PRESENT status today
- Count matches attendance recap

---

## TC-HRD-ATT-002: Absent yesterday attention

**Preconditions:** At least 1 employee was marked ABSENT yesterday.  
**Steps:**
1. Navigate to `/hrd`
2. In "Tanpa kabar kemarin" attention section, verify absent employees visible
3. Click on an employee row
4. Verify navigation to `/hrd/attendance`

**Expected:**
- Shows employees who were ABSENT yesterday
- Each shows employee name and code
- Click navigates to attendance recap

---

## TC-HRD-PAY-002: Period needs generate heuristic

**Preconditions:** At least 1 OPEN payroll period with 0 payslips.  
**Steps:**
1. Navigate to `/hrd`
2. Check "Periode OPEN" KPI subtitle shows "X perlu generate"
3. In "Periode gaji terbuka" attention section, verify period shows "Perlu generate" badge

**Expected:**
- KPI subtitle shows count of periods needing generation
- Attention list highlights periods without payslips

---

## TC-HRD-SIDEBAR-001: Sidebar labels

**Steps:**
1. Navigate to `/hrd`
2. Verify sidebar shows:
   - "Hari Ini" group with "Hari Ini" item
   - "Kehadiran" group with "Rekap Kehadiran" and "Alert HR"
   - "Penggajian" group with "Gaji Mingguan (Borongan)", "Gaji Bulanan", etc.
   - "Kepegawaian" group with "Karyawan", "Cuti & Izin", "Sanksi Disiplin"

**Expected:**
- All labels in Bahasa Indonesia
- "Hari Ini" is highlighted when on `/hrd`
- Portal name shows "Portal HRD"

---

## TC-HRD-QUICK-001: Quick actions

**Steps:**
1. Navigate to `/hrd`
2. Verify "Cepat" section visible with 4 buttons: Rekap Absensi, Gaji Mingguan, Gaji Bulanan, Karyawan
3. Click each button and verify navigation

**Expected:**
- All 4 quick action buttons visible
- Each navigates to correct page

---

## TC-HRD-MENU-001: Semua menu compact

**Steps:**
1. Navigate to `/hrd`
2. Verify "Semua Menu" section visible at bottom
3. Verify all 10 menu items listed in compact grid format

**Expected:**
- 10 menu items visible: Rekap Kehadiran, Alert HR, Gaji Mingguan, Gaji Bulanan, Rekap BPJS, Tarif Borongan, Kasbon, Karyawan, Cuti & Izin, Sanksi Disiplin
- Each item has icon and label
- Grid layout responsive (2-4 columns depending on screen width)

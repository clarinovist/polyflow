BEGIN;

WITH staging (name, code, email, phone, address, tax_id, payment_term_days, bank_name, bank_account, notes, is_active, source_sheet) AS (
VALUES
  ('AGUNG JAYA', 'SUP-AGUNGJAY', '', '', 'Jaten, Karanganyar', '', '', '', '', 'Shipping address: Jaten, Karanganyar', 'true', 'DATA SUPPLIER'),
  ('AGUS SUPRIYANTO', 'SUP-AGUSSUPR', '', '6281395346708', 'JL AMD RAWA GABUS NO 166 RT. 016 RW. 011 , RT 000, RW 000, KAPUK, CENGKARENG, KOTA ADM. JAKARTA BARAT, DKI JAKARTA 11720', '3173011608730007', '', 'BCA JAKARTA', '7015393602', 'PIC: AGUS SUPRIYANTO | Shipping address: JL AMD RAWA GABUS NO 166 RT. 016 RW. 011 , RT 000, RW 000, KAPUK, CENGKARENG, KOTA ADM. JAKARTA BARAT, DKI JAKARTA 11720 | Bank account holder: AGUS SUPRIYANTO', 'true', 'DATA SUPPLIER'),
  ('AMAN', 'SUP-AMAN', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('AMANAA CONSULTING', 'SUP-AMANAACO', 'putri.dkusuma@gmail.com', '81804203298', 'BANJEMGAN RT.03 RW.04 BANYUDONO DUKUN MAGELANG JAWA TENGAH 56482', '259076594524000', '', 'MAGELANG', '1040296758', 'PIC: PUTRI DWI KUSUMA HAPSARI, S.Pd | Bank account holder: PUTRI DWI KUSUMA HAPSARI, S.Pd', 'true', 'DATA SUPPLIER'),
  ('ASURANSI MITRA PELINDUNGI MUSTIKA, PT', 'SUP-ASURANSI', '', '62 822 2681 888; 1 500 676', 'AKR TOWER LANTAI 22 JL. PANJANG NO.5 KEBON JERUK JAKARTA BARAT 11530', '32230914031000', '', 'KEM TOWER KEMAYORAN', '6840388555', 'PIC: Supriyono | Shipping address: AKR TOWER LANTAI 22 JL. PANJANG NO.5 KEBON JERUK JAKARTA BARAT 11530 | Bank account holder: ASURANSI MITRA PELINDUNGI', 'true', 'DATA SUPPLIER'),
  ('BAHANA BUANABOX, PT', 'SUP-BAHANABU', '', '0816 675 896; 024 70796333', 'JL RAYA SEMARANG - DEMAK KM.16 DESA BATU KECAMATAN KARANG TENGAH KABUPATEN DEMAK 59561', '16758328511000', '', 'KCP LIK KALIGAWE SEMARANG', '3530269255', 'PIC: Bapak Andy Hiendiarto | Shipping address: JL RAYA SEMARANG - DEMAK KM.16 DESA BATU KECAMATAN KARANG TENGAH KABUPATEN DEMAK 59561 | Bank account holder: BAHANA BUANABOX', 'true', 'DATA SUPPLIER'),
  ('BARUARA RAYA MANDIRI, PT', 'SUP-BARUARAR', '', '0813 2700 0988;0821 3823 9488', 'JL. VIENA TENGAH NO.09 RT.002 RW.003 MADEGONDO GROGOL SUKOHARJO JAWA TENGAH 57552', '32929465532000', '', 'SUKOHARJO', '7851085177', 'PIC: Bapak Erick | Shipping address: JL. VIENA TENGAH NO.09 RT.002 RW.003 MADEGONDO GROGOL SUKOHARJO JAWA TENGAH 57552 | Bank account holder: BARUARA RAYA MANDIRI', 'true', 'DATA SUPPLIER'),
  ('CIPTA PLASTIK NUSANTARA, PT', 'SUP-CIPTAPLA', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('CIPTA SURYA PLASTINDO, PT', 'SUP-CIPTASUR', 'finance.cplast@gmail.com, cipta.suryaplastindo@gmail.com', '0822 2034 5757; 031 99703509', 'Jl. Simpang Darmo Permai Selatan, Ruko Sarmo Villa Blok B No 8 Rt 004 Rw 007, Surabaya', '802177980618000', '', 'SIMPANG DARMO PERMAI SELATAN', '7260312868', 'PIC: Ibu Shilvia Taurisca | Shipping address: Jl. Simpang Darmo Permai Selatan, Ruko Sarmo Villa Blok B No 8 Rt 004 Rw 007, Surabaya | Bank account holder: PT. CIPTA SURYA PLASTINDO', 'true', 'DATA SUPPLIER'),
  ('CITRA MANDIRI AMANAH', 'SUP-CITRAMAN', '', '', 'KARTASURA', '', '', '', '', 'Shipping address: KARTASURA', 'true', 'DATA SUPPLIER'),
  ('CV CAHAYA CEMERLANG ISTIMEWA', 'SUP-CVCAHAYA', '', 'TELP. (0271) 636757', 'JL. SURYOPRANOTO NO.12 SURAKARTA 57129', '', '', 'SOLO', '3940155818', 'Shipping address: JL. SURYOPRANOTO NO.12 SURAKARTA 57129 | Bank account holder: YANI ROVITA HARIYONO', 'true', 'DATA SUPPLIER'),
  ('DNM', 'SUP-DNM', '', '', 'Sukoharjo', '', '', '', '', 'Shipping address: Sukoharjo', 'true', 'DATA SUPPLIER'),
  ('FADILA', 'SUP-FADILA', '', '', 'Karanganyar', '', '', '', '', 'Shipping address: Karanganyar', 'true', 'DATA SUPPLIER'),
  ('FAJAR', 'SUP-FAJAR', '', '0812 1510 232', 'PUTAT 2 9 PONDOK KARANGANOM KLATEN 57475', '', '', '', '', 'Shipping address: PUTAT 2 9 PONDOK KARANGANOM KLATEN 57475', 'true', 'DATA SUPPLIER'),
  ('HS. MULYO / NARTO BENGKEL MOBIL', 'SUP-HSMULYON', '', '0813 9347 3030', 'PONDOK ASRI 4 4 DEMAKAN MOJOLABAN SUKOHARJO JAWA TENGAH 57554', '', '', '', '', 'PIC: Bapak Narto | Shipping address: PONDOK ASRI 4 4 DEMAKAN MOJOLABAN SUKOHARJO JAWA TENGAH 57554', 'true', 'DATA SUPPLIER'),
  ('INDOPOLY SWAKARSA INDUSTRY, TBK', 'SUP-INDOPOLY', '', '0811 1808 870; 021 2510088', 'WISMA INDOCEMENT LT.5 JL. JEND SUDIRMAN KAV 70-71 SETIABUDI JAKARTA SELATAN 12910', '10710051054000', '', 'SETIABUDI', '4593000063', 'PIC: Alvin | Shipping address: WISMA INDOCEMENT LT.5 JL. JEND SUDIRMAN KAV 70-71 SETIABUDI JAKARTA SELATAN 12910 | Bank account holder: PT INDOPOLY SWAKARSA INDUSTRY', 'true', 'DATA SUPPLIER'),
  ('INTERA LESTARI POLIMER, PT', 'SUP-INTERALE', '', '0859 4333 0720', 'JL YOS SUDARSO KP RAWA BAMBAN 0 2 7 JURUMUDI BARU BENDA TANGERANG BANTEN 15124', '808542260402000', '', 'RUNGKUT SURABAYA', '8220987567', 'PIC: Bapak Dani | Shipping address: JL YOS SUDARSO KP RAWA BAMBAN 0 2 7 JURUMUDI BARU BENDA TANGERANG BANTEN 15124 | Bank account holder: INTERA LESTARI POLIMER', 'true', 'DATA SUPPLIER'),
  ('JANTAN, TOKO', 'SUP-JANTANTO', '', '', 'SURAKARTA', '', '', '', '', 'PIC: Bapak Iwan | Shipping address: SURAKARTA', 'true', 'DATA SUPPLIER'),
  ('JOGLOSEMARCCTV', 'SUP-JOGLOSEM', 'admjmedia04@gmail.com', '0815 6780 8881; 0271 631999', 'JL. RONGGOWARSITO NO.10 KAMPUNGBARU SOLO', '', '', 'SOLO', '157776600', 'PIC: Bapak Dana | Shipping address: JL. RONGGOWARSITO NO.10 KAMPUNGBARU SOLO | Bank account holder: JOGLOSEMAR MEDIA TECHNOLOGY', 'true', 'DATA SUPPLIER'),
  ('KARYA INDAH MESINDO, PT', 'SUP-KARYAIND', 'karyaindahmesindo@yahoo.co.id', '0812 1990 8177; 021 29208008', 'JURUMUDI ROAD 15 15 6 KALIDERES BENDA TANGERANG BANTEN 15124', '', '', 'KCP DUTA GARDENIA', '7020985288', 'Shipping address: JURUMUDI ROAD 15 15 6 KALIDERES BENDA TANGERANG BANTEN 15124 | Bank account holder: LYU BIN ATAU CIE HIAN', 'true', 'DATA SUPPLIER'),
  ('KEISHA CHEMICLAS, CV', 'SUP-KEISHACH', '', '031 8015648', 'PERUM PURI SURYA JAYA B5 5 2 11 GEDANGAN GEDANGAN SIDOARJO JAWA TIMUR 0', '25161365643000', '', 'GEDANGAN SIDOARJO', '3250559991', 'Shipping address: PERUM PURI SURYA JAYA B5 5 2 11 GEDANGAN GEDANGAN SIDOARJO JAWA TIMUR 0', 'true', 'DATA SUPPLIER'),
  ('MARGINI', 'SUP-MARGINI', '', '', 'KARANGANYAR', '', '', '', '', 'Shipping address: KARANGANYAR | Bank account holder: MARGINI', 'true', 'DATA SUPPLIER'),
  ('NAGA PRINT', 'SUP-NAGAPRIN', '', '0271-6546135', 'JL. IR. JUANDA 168 C JEBRES KAMPUNG SEWU SOLO', '', '', 'SOLO', '3940188856', 'PIC: INGRID W | Shipping address: JL. IR. JUANDA 168 C JEBRES KAMPUNG SEWU SOLO | Bank account holder: DANIEL YUWONO', 'true', 'DATA SUPPLIER'),
  ('PANCA BUDI PRATAMA', 'SUP-PANCABUD-2', '', '021 5436-5563', 'KAWASAN PUSAT NIAGA TERPADU, Jl. DAAN MOGOT RAYA KM 19.6 D NO.8A-D, KOTA TANGERANG', '15422306415000', '', '', '', 'Shipping address: KAWASAN PUSAT NIAGA TERPADU, Jl. DAAN MOGOT RAYA KM 19.6 D NO.8A-D, KOTA TANGERANG', 'true', 'DATA SUPPLIER'),
  ('PANCA BUDI PRATAMA, PT', 'SUP-PANCABUD', 'arpbp1@pancabudi.com', '85743107965', 'RESINMART SOLO', '15422306415000', '', 'ASEMKA JAKARTA', '53277002936', 'PIC: ANGELINA | Shipping address: JL MAYOR ACHMADI MOJOSONGO JEBRES SURAKARTA | Bank account holder: PANCA BUDI PRATAMA, PT', 'true', 'DATA SUPPLIER'),
  ('PAPYRUSS', 'SUP-PAPYRUSS', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('PELANGI PLASTIC', 'SUP-PELANGIP', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('PODOMORO', 'SUP-PODOMORO', '', '0812 8025 0385; 0271 821550', 'Jl. Raya Palur No.36 Kedung Aron, Palur, Kec. Mojolaban, Kabupaten Sukoharjo, Jawa Tengah 57554', '', '', '', '', 'PIC: Bapak Sandimo | Shipping address: Jl. Raya Palur No.36 Kedung Aron, Palur, Kec. Mojolaban, Kabupaten Sukoharjo, Jawa Tengah 57554', 'true', 'DATA SUPPLIER'),
  ('PT GUWATIRTA SEJAHTERA', 'SUP-PTGUWATI', '', '', 'JL RAYA SOLO-SRAGEN KM 7,5 KARANGANYAR', '', '', '', '', 'Shipping address: JL RAYA SOLO-SRAGEN KM 7,5 KARANGANYAR', 'true', 'DATA SUPPLIER'),
  ('PT KARYA INDAH MESINDO', 'SUP-PTKARYAI', 'karyaindahmesindo@yahoo.co.id', '021-29208008, 021-54370039', 'Jurumudi no.15, Tangerang, Indonesia', '', '', 'BCA KCP DUTA GARDENIA', '7020 985 288', 'Shipping address: Jurumudi no.15, Tangerang, Indonesia | Bank account holder: LYU BIN ATAU CIE HIAN', 'true', 'DATA SUPPLIER'),
  ('PT SOLO MULTIPACK', 'SUP-PTSOLOMU', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('RINALDI EDO', 'SUP-RINALDIE', '', '0812 2531 1188', 'SURAKARTA', '', '', 'SURAKARTA', '157667878', 'PIC: Bapak Rinaldi Edo | Shipping address: SURAKARTA | Bank account holder: RINALDI EDO', 'true', 'DATA SUPPLIER'),
  ('RIZKY PLASTIK', 'SUP-RIZKYPLA', '', '', 'SURAKARTA', '', '', 'SOLO', '8265197716', 'PIC: NUR RIZKY ERIKA | Shipping address: SURAKARTA | Bank account holder: NUR RIZKY ERIKA', 'true', 'DATA SUPPLIER'),
  ('RUKUN SEJAHTERA, CV', 'SUP-RUKUNSEJ', '', '62 821 3893 793', 'JL IR SOEKARNO, RUKO SOLO BARU JC 23 1 4 MADEGONDO GROGOL SUKOHARJO JAWA TENGAH 57552', '740943428532000', '', '', '', 'PIC: Bapak Ko Afong | Shipping address: JL IR SOEKARNO, RUKO SOLO BARU JC 23 1 4 MADEGONDO GROGOL SUKOHARJO JAWA TENGAH 57552', 'true', 'DATA SUPPLIER'),
  ('SAHABAT ABADI, CV', 'SUP-SAHABATA', '', '0811 1001 0293; 0271 8203776', 'DSN SAWAHAN NO.1 RT.005 RW.006 JATEN JATEN KARANGANYAR JAWA TENGAH 57771', '29511623528000', '', 'PALUR KARANGANYAR', '153939397', 'PIC: Ibu Kristin | Shipping address: DSN SAWAHAN NO.1 RT.005 RW.006 JATEN JATEN KARANGANYAR JAWA TENGAH 57771 | Bank account holder: SAHABAT ABADI', 'true', 'DATA SUPPLIER'),
  ('SANTOSA FIRE PROTECTION', 'SUP-SANTOSAF', '', '0851 0750 0800', 'Jl. Kapten Pattimura No.31, Danukusuman, Kec. Serengan, Kota Surakarta, Jawa Tengah 57156', '', '', '', '153810173', 'PIC: Bapak Santoso | Shipping address: Jl. Kapten Pattimura No.31, Danukusuman, Kec. Serengan, Kota Surakarta, Jawa Tengah 57156 | Bank account holder: LIEM SWIE TJOE', 'true', 'DATA SUPPLIER'),
  ('SANTOSO JAYA PLASTIK, PT', 'SUP-SANTOSOJ', 'sjppt20@gmail.com, benyamin020378@gmail.com', '0812 1509 823', 'JL SOLO SRAGEN KM.9 RT.001 RW.006 JETIS JATEN KARANGANYAR JAWA TENGAH 57771', '969484351528000', '', '', '', 'PIC: Bapak Ko Jum Giyatno | Shipping address: JL SOLO SRAGEN KM.9 RT.001 RW.006 JETIS JATEN KARANGANYAR JAWA TENGAH 57771', 'true', 'DATA SUPPLIER'),
  ('SAUDIN', 'SUP-SAUDIN', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('SB', 'SUP-SB', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('SB PLAST / CHANDRA', 'SUP-SBPLASTC', '', '0812 6228 2784', 'VILA TAMAN BANDARA BLOK H-7 NO.27 DADAP KABUPATEN TANGERANG DUSUN IV 0 0 URUNG PANE SETIA JANJI ASAHAN MEDAN SUMATERA UTARA', '', '', 'JAKARTA', '7125680321', 'PIC: Bapak Chandra | Shipping address: VILA TAMAN BANDARA BLOK H-7 NO.27 DADAP KABUPATEN TANGERANG DUSUN IV 0 0 URUNG PANE SETIA JANJI ASAHAN MEDAN SUMATERA UTARA | Bank account holder: CHANDRA', 'true', 'DATA SUPPLIER'),
  ('SETYO RAHARJO', 'SUP-SETYORAH', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('SINAR MAS PLASINDO', 'SUP-SINARMAS', '', '081329051956 FAX.631907', 'JL YOS SUDARSO NO. 385 SOLO', '-', '', 'BCA SOLO / BRI SOLO', '0153501138 / ''009701000688566', 'PIC: CHONGLIANG | Shipping address: JL YOS SUDARSO NO. 385 SOLO | Bank account holder: AKIN INDRAWAN', 'true', 'DATA SUPPLIER'),
  ('SISKA RISMIYATI', 'SUP-SISKARIS', '', '', 'DUKUH VII RT.001 RW.014 KEL.SIDOAGUNG KEC.GODEAN SLEMAN', '', '', '', '', 'Shipping address: DUKUH VII RT.001 RW.014 KEL.SIDOAGUNG KEC.GODEAN SLEMAN', 'true', 'DATA SUPPLIER'),
  ('SOLINDO GRAPIKA, PT', 'SUP-SOLINDOG', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('SOLO MULTIPACKING, PT', 'SUP-SOLOMULT', 'icptaxconsultant+20@gmail.com, solomultipack_fp15@yahoo.co.id', '0271 822636', 'DSN CELEP KIDUL RT.000 RW.000 DAGEN JATEN KARANGANYAR JAWA TENGAH 57771', '23051923528000', '', '', '3270243168', 'Shipping address: DSN CELEP KIDUL RT.000 RW.000 DAGEN JATEN KARANGANYAR JAWA TENGAH 57771', 'true', 'DATA SUPPLIER'),
  ('SUMBER MAKMUR SENTOSA, CV', 'SUP-SUMBERMA', '', '0877 2599 1918', 'JALAN RAYA SOLO-TAWANGMANGU KM 10,3 SAPEN MOJOLABAN SUKOHARJO', '', '', '', '', 'PIC: Ibu Yuli | Shipping address: JALAN RAYA SOLO-TAWANGMANGU KM 10,3 SAPEN MOJOLABAN SUKOHARJO', 'true', 'DATA SUPPLIER'),
  ('SURYA OFFSET', 'SUP-SURYAOFF', '', '0271 663723', 'Jl Tentara Pelajar Guasari RT.002 RW.027 Jebres - Solo 57126', '', '', '', '', 'Shipping address: Jl Tentara Pelajar Guasari RT.002 RW.027 Jebres - Solo 57126', 'true', 'DATA SUPPLIER'),
  ('TOKO KITA', 'SUP-TOKOKITA', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('TOP ASLI, CV', 'SUP-TOPASLIC', '', '', 'DUSUN JETIS KULON JATEN JATEN KARANGANYAR', '442422176532000', '', 'BCA PALUR', '3276188899', 'PIC: HONGGO DARMA PUTRA | Shipping address: DUSUN JETIS KULON JATEN JATEN KARANGANYAR | Bank account holder: HONGGO DARMA PUTRA', 'true', 'DATA SUPPLIER'),
  ('TRI KUNCORO PUTRA', 'SUP-TRIKUNCO', '', '', '', '', '', '', '', 'PIC: TRI KUNCORO PUTRA', 'true', 'DATA SUPPLIER'),
  ('UMAR', 'SUP-UMAR', '', '', '', '', '', '', '', '', 'true', 'DATA SUPPLIER'),
  ('WIDYA TOKO', 'SUP-WIDYATOK', '', '0851 0004 2474', 'BELAKANG PASAR JATEN KARANGANYAR', '', '', '', '', 'PIC: Ibu Widya | Shipping address: BELAKANG PASAR JATEN KARANGANYAR', 'true', 'DATA SUPPLIER'),
  ('YONATHAN TJIOOK TJIE HONG', 'SUP-YONATHAN', '', '0813 2915 9055', 'JAGALAN 1 15 JAGALAN JEBRES SURAKARTA JAWA TENGAH 57162', '3372042109710001', '', '', '', 'PIC: Bapak Yonathan Tjiook Tjie Hong | Shipping address: JAGALAN 1 15 JAGALAN JEBRES SURAKARTA JAWA TENGAH 57162', 'true', 'DATA SUPPLIER')
),
updated AS (
  UPDATE "Supplier" sdb
  SET
    code = CASE WHEN sdb.code IS NULL OR btrim(sdb.code) = '' THEN s.code ELSE sdb.code END,
    phone = CASE WHEN NULLIF(s.phone, '') IS NOT NULL THEN s.phone ELSE sdb.phone END,
    email = CASE WHEN NULLIF(s.email, '') IS NOT NULL THEN s.email ELSE sdb.email END,
    address = CASE WHEN NULLIF(s.address, '') IS NOT NULL THEN s.address ELSE sdb.address END,
    "taxId" = CASE WHEN NULLIF(s.tax_id, '') IS NOT NULL THEN s.tax_id ELSE sdb."taxId" END,
    "paymentTermDays" = CASE WHEN NULLIF(s.payment_term_days, '') IS NOT NULL THEN s.payment_term_days::integer ELSE sdb."paymentTermDays" END,
    "bankName" = CASE WHEN NULLIF(s.bank_name, '') IS NOT NULL THEN s.bank_name ELSE sdb."bankName" END,
    "bankAccount" = CASE WHEN NULLIF(s.bank_account, '') IS NOT NULL THEN s.bank_account ELSE sdb."bankAccount" END,
    notes = CASE
      WHEN NULLIF(s.notes, '') IS NULL THEN sdb.notes
      WHEN sdb.notes IS NULL OR btrim(sdb.notes) = '' THEN s.notes
      WHEN position(s.notes in sdb.notes) > 0 THEN sdb.notes
      ELSE sdb.notes || ' | ' || s.notes
    END,
    "isActive" = CASE WHEN lower(s.is_active) = 'true' THEN true ELSE sdb."isActive" END,
    "updatedAt" = NOW()
  FROM staging s
  WHERE sdb.name = s.name
  RETURNING sdb.name
),
inserted AS (
  INSERT INTO "Supplier" (
    id, name, code, phone, email, address, "taxId", "paymentTermDays", "bankName", "bankAccount", notes, "isActive", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    s.name,
    s.code,
    NULLIF(s.phone, ''),
    NULLIF(s.email, ''),
    NULLIF(s.address, ''),
    NULLIF(s.tax_id, ''),
    CASE WHEN NULLIF(s.payment_term_days, '') IS NOT NULL THEN s.payment_term_days::integer ELSE NULL END,
    NULLIF(s.bank_name, ''),
    NULLIF(s.bank_account, ''),
    NULLIF(s.notes, ''),
    CASE WHEN lower(s.is_active) = 'true' THEN true ELSE false END,
    NOW(),
    NOW()
  FROM staging s
  WHERE NOT EXISTS (
    SELECT 1 FROM "Supplier" sdb WHERE sdb.name = s.name
  )
  RETURNING name
)
SELECT
  (SELECT COUNT(*) FROM staging) AS staging_rows,
  (SELECT COUNT(*) FROM updated) AS updated_rows,
  (SELECT COUNT(*) FROM inserted) AS inserted_rows;

ROLLBACK;

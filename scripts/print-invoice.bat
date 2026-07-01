@echo off
setlocal enabledelayedexpansion
REM ============================================
REM  ESC/P Dot Matrix Invoice Printer
REM  Untuk Feby - Melindo Rafia
REM  Printer: EPSON LX-300+II (USB)
REM ============================================
REM
REM  CARA PAKAI:
REM  1. Download file .prn dari PolyFlow (tombol "ESC/P (Dot Matrix)")
REM  2. Double-click script ini
REM  3. Pilih file .prn yang mau diprint
REM
REM  ATAU: Drag & drop file .prn ke script ini
REM ============================================

echo.
echo  ========================================
echo   ESC/P RAW Dot Matrix Printer - Melindo
echo   Printer: EPSON LX-300+II
echo  ========================================
echo.

REM Check if a file was dragged onto the script
if not "%~1"=="" (
    set "PRN_FILE=%~1"
    goto :print
)

REM No file dragged — look for .prn files
set COUNT=0

REM Check Downloads folder first
set "DOWNLOADS=%USERPROFILE%\Downloads"
for %%f in ("%DOWNLOADS%\*.prn") do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%f"
    echo   !COUNT!. %%~nxf
)

REM Also check current directory (where the script is)
for %%f in ("%~dp0*.prn") do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%f"
    echo   !COUNT!. %%~nxf
)

if !COUNT!==0 (
    echo  Tidak ada file .prn ditemukan.
    echo  Download dulu dari PolyFlow ^(tombol "ESC/P (Dot Matrix)"^)
    echo.
    pause
    exit /b 1
)

echo.
set /p CHOICE="  Nomor file yang mau diprint (tekan Enter untuk batal): "

if "!CHOICE!"=="" (
    echo  Batal.
    pause
    exit /b 0
)

REM Get the selected file
set "PRN_FILE=!FILE_%CHOICE%!"
if not defined PRN_FILE (
    echo  Nomor tidak valid.
    pause
    exit /b 1
)

:print
echo.
echo  Memprint RAW ke EPSON LX-300+II: !PRN_FILE!
echo.

REM Kirim .prn sebagai RAW bytes via Windows spooler.
REM Ini menjaga control code ESC/P tetap utuh untuk dot matrix.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autoprint-epson.ps1" -FilePath "!PRN_FILE!" -KeepPrintedFiles
if !errorlevel!==0 (
    goto :success
)

REM ── Print failed ──
echo.
echo  Gagal mengirim RAW print ke EPSON LX-300+II.
echo.
echo  Pastikan:
echo  1. Printer EPSON LX-300+II sudah ON dan terhubung via USB
echo  2. Printer terinstall di Windows ^(Devices ^> Printers^)
echo  3. Printer name persis: "EPSON LX-300+II"
echo  4. Windows Print Spooler sedang berjalan
echo.
echo  Jangan print file .prn lewat Notepad karena ESC/P control code bisa rusak.
echo.
pause
exit /b 1

:success
echo.
echo  ========================================
echo   Berhasil! Invoice dikirim ke printer.
echo   Printer: EPSON LX-300+II
echo  ========================================
echo.
pause
exit /b 0

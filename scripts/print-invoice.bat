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
echo   ESC/P Dot Matrix Printer - Melindo
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
    exit /b
)

echo.
set /p CHOICE="  Nomor file yang mau diprint (tekan Enter untuk batal): "

if "!CHOICE!"=="" (
    echo  Batal.
    pause
    exit /b
)

REM Get the selected file
set "PRN_FILE=!FILE_%CHOICE%!"
if not defined PRN_FILE (
    echo  Nomor tidak valid.
    pause
    exit /b
)

:print
echo.
echo  Memprint: !PRN_FILE!
echo.

REM ── Method 1: Send raw bytes to EPSON LX-300+II via USB ──
REM Try the most common USB port names for Epson printers
set PRINTED=0

REM Try USB001 (most common)
copy /b "!PRN_FILE!" USB001: >nul 2>&1
if !errorlevel!==0 (
    set PRINTED=1
    goto :success
)

REM Try USB002
copy /b "!PRN_FILE!" USB002: >nul 2>&1
if !errorlevel!==0 (
    set PRINTED=1
    goto :success
)

REM ── Method 2: Use printer share name ──
REM First try the default printer name
copy /b "!PRN_FILE!" "EPSON LX-300+II" >nul 2>&1
if !errorlevel!==0 (
    set PRINTED=1
    goto :success
)

REM ── Method 3: Use Windows PRINT command ──
print /D:"EPSON LX-300+II" "!PRN_FILE!" >nul 2>&1
if !errorlevel!==0 (
    set PRINTED=1
    goto :success
)

REM ── Method 4: PowerShell raw print ──
powershell -Command "$printer = Get-WmiObject -Query \"SELECT * FROM Win32_Printer WHERE Name LIKE '%%EPSON%%LX%%'\"; if ($printer) { $bytes = [System.IO.File]::ReadAllBytes('!PRN_FILE!'); $port = $printer.PortName; [System.IO.File]::WriteAllBytes($port, $bytes) }" >nul 2>&1
if !errorlevel!==0 (
    set PRINTED=1
    goto :success
)

REM ── All methods failed ──
echo.
echo  Gagal mengirim ke printer EPSON LX-300+II.
echo.
echo  Pastikan:
echo  1. Printer EPSON LX-300+II sudah ON dan terhubung via USB
echo  2. Printer terinstall di Windows (Devices ^> Printers)
echo  3. Printer name persis: "EPSON LX-300+II"
echo.
echo  Coba cara manual:
echo  1. Klik kanan file .prn
echo  2. Open with ^> Notepad
echo  3. File ^> Print ^> pilih EPSON LX-300+II
echo.
pause
exit /b

:success
echo.
echo  ========================================
echo   Berhasil! Invoice sedang diprint.
echo   Printer: EPSON LX-300+II
echo  ========================================
echo.
pause

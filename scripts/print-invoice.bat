@echo off
REM ============================================
REM  ESC/P Dot Matrix Invoice Printer
REM  Untuk Feby - Melindo Rafia
REM ============================================
REM  
REM  CARA PAKAI:
REM  1. Download file .prn dari PolyFlow (tombol "ESC/P (Dot Matrix)")
REM  2. Simpan di folder yang sama dengan script ini
REM  3. Double-click script ini
REM  4. Pilih file .prn yang mau diprint
REM  
REM  ATAU: Drag & drop file .prn ke script ini
REM ============================================

echo.
echo  ========================================
echo   ESC/P Dot Matrix Printer - Melindo
echo  ========================================
echo.

REM Check if a file was dragged onto the script
if not "%~1"=="" (
    set "PRN_FILE=%~1"
    goto :print
)

REM No file dragged — ask user to pick one
echo  Pilih file invoice yang mau diprint:
echo.

REM List available .prn files
set COUNT=0
for %%f in (*.prn) do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%f"
    echo   !COUNT^. %%f
)

if %COUNT%==0 (
    echo  Tidak ada file .prn di folder ini.
    echo  Download dulu dari PolyFlow ^(tombol "ESC/P (Dot Matrix)"^)
    echo.
    pause
    exit /b
)

echo.
set /p CHOICE="  Nomor file yang mau diprint (atau tekan Enter untuk batal): "

if "%CHOICE%"=="" (
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
echo  Memprint: %PRN_FILE%
echo.

REM Try to find the printer name
REM Common Epson dot matrix names:
REM   - EPSON LQ-310
REM   - EPSON LX-310
REM   - EPSON LQ-2190
REM   - Generic / Text Only

REM Method 1: Send to default printer (simplest)
REM copy /b "%PRN_FILE%" LPT1:

REM Method 2: Send to a specific printer by name
REM Uncomment and change the printer name to match your printer:
REM copy /b "%PRN_FILE%" "\\COMPUTER-NAME\EPSON LQ-310"

REM Method 3: Use Windows PRINT command (works with USB printers)
REM This sends the file to the default printer
print /D:"%PRN_FILE%" 2>nul
if errorlevel 1 (
    echo  Gagal print ke printer default.
    echo.
    echo  Coba cara alternatif:
    echo  1. Buka Notepad
    echo  2. File ^> Open ^> pilih file: %PRN_FILE%
    echo  3. File ^> Print
    echo.
    echo  ATAU edit script ini dan uncomment salah satu method di atas.
    echo.
    pause
    exit /b
)

echo  Berhasil! Invoice sedang diprint di dot matrix printer.
echo.
pause

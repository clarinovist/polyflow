@echo off
setlocal enabledelayedexpansion
REM ============================================
REM  ESC/P Dot Matrix Invoice Printer
REM  Untuk Feby - Melindo Rafia
REM ============================================
REM  
REM  CARA PAKAI:
REM  1. Download file .prn dari PolyFlow (tombol "ESC/P (Dot Matrix)")
REM  2. Simpan di folder Downloads (atau folder yang sama dengan script ini)
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

REM No file dragged — look for .prn files in Downloads folder
set "DOWNLOADS=%USERPROFILE%\Downloads"
set COUNT=0

REM List .prn files in Downloads
for %%f in ("%DOWNLOADS%\*.prn") do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%f"
    echo   !COUNT!. %%~nxf
)

REM Also check current directory
for %%f in ("*.prn") do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%f"
    echo   !COUNT!. %%~nxf
)

if !COUNT!==0 (
    echo  Tidak ada file .prn di folder Downloads.
    echo  Download dulu dari PolyFlow ^(tombol "ESC/P (Dot Matrix)"^)
    echo.
    pause
    exit /b
)

echo.
set /p CHOICE="  Nomor file yang mau diprint (atau tekan Enter untuk balar): "

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

REM Send file directly to the printer using COPY command
REM This sends raw ESC/P bytes to the default printer
copy /b "!PRN_FILE!" LPT1: 2>nul
if errorlevel 1 (
    REM LPT1 failed — try using PRINT command
    print "!PRN_FILE!" 2>nul
    if errorlevel 1 (
        REM PRINT also failed — try PowerShell approach
        powershell -Command "Get-Content -Path '!PRN_FILE!' -Raw | Out-Printer"
        if errorlevel 1 (
            echo.
            echo  Gagal mengirim ke printer.
            echo.
            echo  Coba cara manual:
            echo  1. Buka Notepad
            echo  2. File ^> Open ^> pilih file: !PRN_FILE!
            echo  3. File ^> Print
            echo.
            pause
            exit /b
        )
    )
)

echo.
echo  Berhasil! Invoice sedang diprint di dot matrix printer.
echo.
pause

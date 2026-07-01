@echo off
REM ============================================
REM  ESC/P Auto-Print Launcher
REM  Untuk Feby - Melindo Rafia
REM  
REM  Double-click untuk menjalankan auto-print
REM  Script berjalan di background
REM ============================================

REM Run PowerShell script minimized (no terminal window blocking)
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0autoprint-epson.ps1"

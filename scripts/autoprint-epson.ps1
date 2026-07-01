<#
  ESC/P RAW Auto-Print Watcher for EPSON LX-300+II
  Untuk Feby - Melindo Rafia

  Mode manual:
    powershell -ExecutionPolicy Bypass -File .\autoprint-epson.ps1 -FilePath "C:\Users\...\Downloads\invoice.prn" -KeepPrintedFiles

  Mode auto-watch:
    Double-click AutoPrint-Melindo.bat, lalu klik tombol "ESC/P (Dot Matrix)" di PolyFlow.

  Catatan:
  - Script ini mengirim file .prn sebagai RAW bytes via Windows spooler (winspool.drv).
  - Jangan pakai Out-Printer/Notepad untuk ESC/P karena bisa merusak control code dot matrix.
#>

param(
    [string]$FilePath,
    [string]$PrinterName = "EPSON LX-300+II",
    [string]$DownloadPath = "$env:USERPROFILE\Downloads",
    [switch]$KeepPrintedFiles
)

$ErrorActionPreference = "Stop"
$filter = "*.prn"

function Initialize-RawPrinterApi {
    if ([System.Management.Automation.PSTypeName]'RawPrinterHelper'.Type) {
        return
    }

    Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes, string documentName)
    {
        IntPtr hPrinter = IntPtr.Zero;
        IntPtr pUnmanagedBytes = IntPtr.Zero;
        int written = 0;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = documentName;
        di.pDataType = "RAW";

        try
        {
            if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            if (!StartPagePrinter(hPrinter)) return false;

            pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
            return WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written) && written == bytes.Length;
        }
        finally
        {
            if (pUnmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(pUnmanagedBytes);
            if (hPrinter != IntPtr.Zero)
            {
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
            }
        }
    }

    public static bool SendFileToPrinter(string printerName, string filePath)
    {
        byte[] bytes = File.ReadAllBytes(filePath);
        return SendBytesToPrinter(printerName, bytes, Path.GetFileName(filePath));
    }
}
"@
}

function Get-ConfiguredPrinter {
    param([string]$Name)

    try {
        return Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
    } catch {
        return Get-WmiObject Win32_Printer | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
    }
}

function Wait-FileReady {
    param(
        [string]$Path,
        [int]$MaxWaitSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
    $lastSize = -1

    while ((Get-Date) -lt $deadline) {
        if (-not (Test-Path -LiteralPath $Path)) {
            Start-Sleep -Milliseconds 500
            continue
        }

        try {
            $item = Get-Item -LiteralPath $Path
            $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'None')
            $stream.Close()

            if ($item.Length -eq $lastSize -and $item.Length -gt 0) {
                return $true
            }

            $lastSize = $item.Length
        } catch {
            # File masih ditulis browser/download manager.
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Send-RawPrintFile {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File tidak ditemukan: $Path"
    }

    $printer = Get-ConfiguredPrinter -Name $Name
    if (-not $printer) {
        throw "Printer '$Name' tidak ditemukan di Windows. Cek Devices > Printers dan pastikan namanya persis."
    }

    if (-not (Wait-FileReady -Path $Path)) {
        throw "File belum selesai didownload/masih terkunci: $Path"
    }

    Initialize-RawPrinterApi

    $ok = [RawPrinterHelper]::SendFileToPrinter($Name, $Path)
    if (-not $ok) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Gagal mengirim RAW print ke '$Name'. Win32Error=$err"
    }

    return $true
}

function Print-OneFile {
    param([string]$Path)

    $name = Split-Path -Leaf $Path
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Memprint RAW: $name" -ForegroundColor Yellow
    Send-RawPrintFile -Path $Path -Name $PrinterName | Out-Null
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Berhasil dikirim ke spooler: $name" -ForegroundColor Green

    if (-not $KeepPrintedFiles) {
        Start-Sleep -Seconds 5
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] File .prn sudah dihapus." -ForegroundColor Gray
    }
}

if ($FilePath) {
    try {
        Print-OneFile -Path $FilePath
        exit 0
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ESC/P RAW Auto-Print - $PrinterName" -ForegroundColor Cyan
Write-Host "  Watching: $DownloadPath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Siap! Klik tombol ESC/P di PolyFlow untuk print." -ForegroundColor Green
Write-Host "Tekan Ctrl+C untuk stop." -ForegroundColor Yellow
Write-Host ""

try {
    $printer = Get-ConfiguredPrinter -Name $PrinterName
    if ($printer) {
        Write-Host "Printer ditemukan: $($printer.Name) / Port: $($printer.PortName)" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Printer '$PrinterName' belum ditemukan. Script tetap watch, tapi print akan gagal sampai printer terinstall." -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Gagal mengecek printer: $($_.Exception.Message)" -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $DownloadPath)) {
    New-Item -ItemType Directory -Path $DownloadPath -Force | Out-Null
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $DownloadPath
$watcher.Filter = $filter
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

# Jalankan print di proses PowerShell terpisah supaya event watcher tetap sederhana
# dan tidak tergantung scope function di Register-ObjectEvent.
$eventData = @{
    ScriptPath = $PSCommandPath
    PrinterName = $PrinterName
}

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $name = $Event.SourceEventArgs.Name
    $scriptPath = $Event.MessageData.ScriptPath
    $printer = $Event.MessageData.PrinterName

    $safePath = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($path)).Replace('/', '_').Replace('+', '-').TrimEnd('=')
    $lockPath = Join-Path $env:TEMP "polyflow-print-$safePath.lock"
    $lockStream = $null

    try {
        try {
            $lockStream = [System.IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
        } catch {
            # Duplicate Created/Renamed event for the same browser download.
            return
        }

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Terdeteksi: $name" -ForegroundColor Yellow
        $args = @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', $scriptPath,
            '-FilePath', $path,
            '-PrinterName', $printer
        )
        & powershell @args
        if ($LASTEXITCODE -ne 0) {
            throw "Child print process exit code $LASTEXITCODE"
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] GAGAL print ${name}: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        if ($lockStream) { $lockStream.Close() }
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
}

$subscriptions = @(
    Register-ObjectEvent -InputObject $watcher -EventName Created -MessageData $eventData -Action $action
    Register-ObjectEvent -InputObject $watcher -EventName Renamed -MessageData $eventData -Action $action
)

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    foreach ($subscription in $subscriptions) {
        Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
    }
    $watcher.Dispose()
}

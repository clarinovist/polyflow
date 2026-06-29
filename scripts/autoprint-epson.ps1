<# 
  ESC/P Auto-Print Watcher for EPSON LX-300+II
  Untuk Feby - Melindo Rafia
  
  CARA PAKAI:
  1. Simpan script ini di Desktop
  2. Double-click untuk menjalankan
  3. Minimize (berjalan di background)
  4. Klik tombol "ESC/P (Dot Matrix)" di PolyFlow
  5. File .prn otomatis terdeteksi dan diprint
  
  UNTUK STOP: Tutup window PowerShell atau klik kanan > Stop
#>

$printerName = "EPSON LX-300+II"
$downloadPath = "$env:USERPROFILE\Downloads"
$filter = "*.prn"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ESC/P Auto-Print - EPSON LX-300+II" -ForegroundColor Cyan
Write-Host "  Watching: $downloadPath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Siap! Klik tombol ESC/P di PolyFlow untuk print." -ForegroundColor Green
Write-Host "Tekan Ctrl+C untuk stop." -ForegroundColor Yellow
Write-Host ""

# Create FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $downloadPath
$watcher.Filter = $filter
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

# Action when new .prn file is detected
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $name = $Event.SourceEventArgs.Name
    
    # Wait a moment for file to finish downloading
    Start-Sleep -Seconds 2
    
    # Check if file is still being written (size changing)
    $size1 = (Get-Item $path).Length
    Start-Sleep -Seconds 1
    $size2 = (Get-Item $path).Length
    
    if ($size1 -ne $size2) {
        # File still downloading, wait more
        Start-Sleep -Seconds 3
    }
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Memprint: $name" -ForegroundColor Yellow
    
    try {
        # Method 1: Send raw bytes to USB port
        $sent = $false
        
        # Try USB001
        try {
            [System.IO.File]::WriteAllBytes("USB001:", [System.IO.File]::ReadAllBytes($path))
            $sent = $true
        } catch {}
        
        # Try USB002
        if (-not $sent) {
            try {
                [System.IO.File]::WriteAllBytes("USB002:", [System.IO.File]::ReadAllBytes($path))
                $sent = $true
            } catch {}
        }
        
        # Method 2: Use Out-Printer
        if (-not $sent) {
            try {
                Get-Content -Path $path -Raw | Out-Printer -Name $printerName
                $sent = $true
            } catch {}
        }
        
        # Method 3: Use print command
        if (-not $sent) {
            try {
                Start-Process "print" -ArgumentList "/D:`"$printerName`" `"$path`"" -NoNewWindow -Wait
                $sent = $true
            } catch {}
        }
        
        if ($sent) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Berhasil! $name sedang diprint." -ForegroundColor Green
            
            # Delete the .prn file after successful print
            Start-Sleep -Seconds 5
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] File .prn sudah dihapus." -ForegroundColor Gray
        } else {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] GAGAL print $name. Pastikan printer ON." -ForegroundColor Red
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Error: $_" -ForegroundColor Red
    }
}

# Register the event
Register-ObjectEvent $watcher "Created" -Action $action

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Cleanup
    Unregister-Event -SourceIdentifier $watcher.Created
    $watcher.Dispose()
}

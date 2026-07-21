param(
    [Parameter(Mandatory)][string]$ExtractDir,
    [Parameter(Mandatory)][string]$ProjectRoot
)

# Called from updater.bat to copy manual files (unicode-named HTML + folder).
# Bat cannot embed Japanese filenames literally per AGENTS.md (ASCII-only rule,
# CP932 vs UTF-8 hazard). PowerShell handles unicode paths reliably.
#
# ASCII-only source: no Japanese chars in this file. Filenames built via
# Unicode escapes because PS 5.1 reads .ps1 files in system ANSI codepage
# (Shift-JIS on JP Windows), which mangles UTF-8 literals.
# 運用マニュアル.HTML / マニュアル

$ErrorActionPreference = 'Stop'

$manualHtml = (-join (@(0x904B, 0x7528, 0x30DE, 0x30CB, 0x30E5, 0x30A2, 0x30EB) | ForEach-Object { [char]$_ })) + '.HTML'
$manualDir  =  -join (@(0x30DE, 0x30CB, 0x30E5, 0x30A2, 0x30EB) | ForEach-Object { [char]$_ })

$srcHtml = Join-Path $ExtractDir $manualHtml
$srcDir  = Join-Path $ExtractDir $manualDir
$dstHtml = Join-Path $ProjectRoot $manualHtml
$dstDir  = Join-Path $ProjectRoot $manualDir

if (Test-Path -LiteralPath $srcHtml) {
    Copy-Item -LiteralPath $srcHtml -Destination $dstHtml -Force
    Write-Host "[manual] copied HTML"
}

if (Test-Path -LiteralPath $srcDir) {
    # Replace entire folder so image additions/deletions propagate.
    if (Test-Path -LiteralPath $dstDir) {
        Remove-Item -LiteralPath $dstDir -Recurse -Force
    }
    Copy-Item -LiteralPath $srcDir -Destination $dstDir -Recurse -Force
    Write-Host "[manual] copied assets folder (recursive)"
}

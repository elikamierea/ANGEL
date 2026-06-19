param(
    [Parameter(Mandatory = $true)] [string]$SourceDir,
    [Parameter(Mandatory = $true)] [string]$OutPak
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "SourceDir not found: $SourceDir"
}

$sourceFull = (Resolve-Path -LiteralPath $SourceDir).Path
$outDir = Split-Path -Parent $OutPak
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$files = Get-ChildItem -LiteralPath $sourceFull -Recurse -File | Sort-Object FullName

# Build entries with logical path "assets/..."
$entries = @()
foreach ($f in $files) {
    $relative = $f.FullName.Substring($sourceFull.Length).TrimStart([char]'\', [char]'/')
    $logical = ('assets/' + ($relative -replace '\\','/'))
    $pathBytes = [System.Text.Encoding]::UTF8.GetBytes($logical)

    $entry = [PSCustomObject]@{
        FullPath = $f.FullName
        LogicalPath = $logical
        PathBytes = $pathBytes
        Size = [UInt64]$f.Length
        Offset = [UInt64]0
    }
    $entries += $entry
}

# Layout:
# header: u32 magic("PAK1" as 0x314B4150), u32 version(1), u32 fileCount
# each entry: u32 pathLen, path bytes, u64 offset, u64 size
# data: raw bytes concatenated

[UInt64]$headerSize = 12
[UInt64]$indexSize = 0
foreach ($e in $entries) {
    $indexSize += [UInt64](4 + $e.PathBytes.Length + 8 + 8)
}

[UInt64]$dataOffset = $headerSize + $indexSize
[UInt64]$cursor = $dataOffset
foreach ($e in $entries) {
    $e.Offset = $cursor
    $cursor += $e.Size
}

$fs = [System.IO.File]::Open($OutPak, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
    $bw = New-Object System.IO.BinaryWriter($fs, [System.Text.Encoding]::UTF8, $true)

    # header
    $bw.Write([UInt32]0x314B4150) # PAK1
    $bw.Write([UInt32]1)          # version
    $bw.Write([UInt32]$entries.Count)

    # index
    foreach ($e in $entries) {
        $bw.Write([UInt32]$e.PathBytes.Length)
        $bw.Write($e.PathBytes)
        $bw.Write([UInt64]$e.Offset)
        $bw.Write([UInt64]$e.Size)
    }

    # data
    $bufferSize = 1024 * 1024
    $buffer = New-Object byte[] $bufferSize
    foreach ($e in $entries) {
        $inFs = [System.IO.File]::Open($e.FullPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        try {
            while (($read = $inFs.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $bw.Write($buffer, 0, $read)
            }
        }
        finally {
            $inFs.Dispose()
        }
    }

    $bw.Flush()
    $bw.Dispose()
}
finally {
    $fs.Dispose()
}

Write-Host "Packed $($entries.Count) files -> $OutPak"

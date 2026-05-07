# provision-secrets.ps1
# Run from apps/daily-brief: pwsh -File provision-secrets.ps1
# Reads values from .dev.vars and provisions them into the worker.
# Usage:
#   1. Copy .dev.vars.example → .dev.vars and fill in real values
#   2. Run this script

$devVars = ".dev.vars"
if (-not (Test-Path $devVars)) {
  Write-Error "Missing $devVars — copy .dev.vars.example and fill in real values"
  exit 1
}

# Secret name in wrangler → env var name in .dev.vars
$secretMap = @{
  "RESEND_API_KEY"          = "RESEND_API_KEY"
  "ANTHROPIC_API_KEY"       = "ANTHROPIC_API_KEY"
  "GROQ_API_KEY"            = "GROQ_API_KEY"
  "VERTEX_ACCESS_TOKEN"     = "VERTEX_ACCESS_TOKEN"
  "ELEVENLABS_API_KEY"      = "ELEVENLABS_API_KEY"
  "ELEVENLABS_VOICE_ID"     = "ELEVENLABS_VOICE_DEFAULT"
  "GITHUB_TOKEN"            = "FACTORY_GITHUB_TOKEN"
  "NEWS_API_KEY"            = "NEWS_API_KEY"
}

# Parse .dev.vars
$vars = @{}
foreach ($line in Get-Content $devVars) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $parts = $line -split '=', 2
  $vars[$parts[0].Trim()] = $parts[1].Trim()
}

$env:NODE_AUTH_TOKEN = $(gh auth token)

foreach ($secretName in $secretMap.Keys) {
  $envKey = $secretMap[$secretName]
  $value  = $vars[$envKey]
  if (-not $value -or $value -like "*xxx*") {
    Write-Warning "Skipping $secretName — value not set in .dev.vars (key: $envKey)"
    continue
  }
  Write-Host "Provisioning $secretName..."
  $value | npx wrangler secret put $secretName
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to provision $secretName"
    exit 1
  }
}

Write-Host ""
Write-Host "All secrets provisioned. Test with:"
Write-Host "  curl -s https://daily-brief.adrper79.workers.dev/health"
Write-Host "  curl -X POST https://daily-brief.adrper79.workers.dev/trigger"

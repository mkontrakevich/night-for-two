param(
  [ValidateSet('Verify','Publish')]
  [string]$Mode = 'Verify',
  [string]$PublicUrl = ''
)

$ErrorActionPreference = 'Stop'

function Env([string]$Name) {
  return [Environment]::GetEnvironmentVariable($Name)
}

function Resolve-PublicUrl {
  if ($PublicUrl) { return $PublicUrl.TrimEnd('/') }
  $value = Env 'NIGHT_PAGES_URL'
  if (-not $value) { throw 'NIGHT_PAGES_URL_NOT_CONFIGURED' }
  return $value.TrimEnd('/')
}

function Verify-Health([string]$Base) {
  $health = Invoke-RestMethod -Method Get -Uri "$Base/night/health" -TimeoutSec 20
  if ($health.ok -ne $true) { throw 'NIGHT_PUBLIC_HEALTH_FAILED' }
  return $health
}

function Publish-Menu([string]$Base,[string]$ChatId) {
  if (-not $ChatId) { return }
  $token = Env 'TELEGRAM_BOT_TOKEN'
  if (-not $token) { throw 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' }
  $payload = @{
    chat_id = $ChatId
    menu_button = @{
      type = 'web_app'
      text = 'Ночь на двоих'
      web_app = @{ url = "$Base/night" }
    }
  } | ConvertTo-Json -Depth 6 -Compress
  $result = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setChatMenuButton" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  if (-not $result.ok) { throw "TELEGRAM_MENU_FAILED:$ChatId" }
}

$base = Resolve-PublicUrl
$health = Verify-Health $base
Write-Host "NIGHT_PUBLIC_HEALTH_OK base=$base db=$($health.db)"

if ($Mode -eq 'Publish') {
  $owner = Env 'PRIMARY_OWNER_ID'
  $partner = Env 'PARTNER_TELEGRAM_ID'
  if (-not $owner -or -not $partner) { throw 'NIGHT_TELEGRAM_IDS_NOT_CONFIGURED' }
  Publish-Menu $base $owner
  Publish-Menu $base $partner
  Write-Host "NIGHT_TELEGRAM_MENU_PUBLISHED url=$base/night"
}

# Instala o vigia da sincronização como RESERVA neste computador.
# O reserva fica em espera e só trabalha quando o computador principal está desligado ou sem sinal;
# quando o principal volta, ele devolve o plantão sozinho. (Revezamento: /api/sync/plantao.)
#
# Como usar: com o ownCloud já sincronizando a pasta "Gestão dos Abastecimentos" (Base, planilhas, CONTROLES e
# Reajustes SGB), dê dois cliques em scripts\instalar-vigia-reserva.cmd, ou rode no PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-vigia-reserva.ps1
$ErrorActionPreference = 'Stop'
$Projeto = Split-Path -Parent $PSScriptRoot
$Pasta = Join-Path $env:LOCALAPPDATA 'GestaoCombustivel'
$Tarefa = 'Gestao Combustivel - sincronizar Base'
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Falta($t) { Write-Host "  FALTA  $t" -ForegroundColor Yellow; $script:faltas++ }
$faltas = 0

Write-Host "`nVigia da Gestão de Combustível - instalação do computador RESERVA ($env:COMPUTERNAME)`n"

# 1) pastas do ownCloud que o vigia usa
$Logistica = Split-Path -Parent $Projeto
$Abast = Split-Path -Parent $Logistica
foreach ($item in @(
    @((Join-Path $Logistica 'Base.xlsx'), 'Base.xlsx'),
    @((Join-Path $Logistica 'LOCALIZAÇÃO DOS POSTOS.xlsx'), 'LOCALIZAÇÃO DOS POSTOS.xlsx'),
    @((Join-Path $Logistica 'Gestão de negociações de preço.xlsx'), 'Gestão de negociações de preço.xlsx'),
    @((Join-Path $Projeto 'CONTROLES'), 'pasta CONTROLES'),
    @((Join-Path $Abast 'Reajustes SGB'), 'pasta Reajustes SGB'))) {
  if (Test-Path -LiteralPath $item[0]) { Ok $item[1] } else { Falta "$($item[1]) não encontrada (o ownCloud precisa sincronizar: $($item[0]))" }
}

# 2) programas
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Ok "Node.js $(node --version)" } else { Falta 'Node.js (instale a versão LTS em https://nodejs.org)' }
$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
  Ok "Python ($(py --version 2>&1))"
  py -c "import openpyxl" 2>$null
  if ($LASTEXITCODE -eq 0) { Ok 'biblioteca openpyxl' } else { Falta 'biblioteca openpyxl: rode  py -m pip install openpyxl' }
  py -c "import pypdf" 2>$null   # lê a tabela de preços da Petrobras (dashboard Preço x Refinaria)
  if ($LASTEXITCODE -eq 0) { Ok 'biblioteca pypdf' } else { Falta 'biblioteca pypdf: rode  py -m pip install --user pypdf' }
} else { Falta 'Python (instale o Python 3 pela Microsoft Store e rode  py -m pip install openpyxl)' }

# 3) token do vigia (o mesmo do computador principal)
New-Item -ItemType Directory -Force $Pasta | Out-Null
$ArqToken = Join-Path $Pasta 'sync-token.txt'
if (-not (Test-Path $ArqToken)) {
  Write-Host "`n  O token do vigia fica no computador principal em: %LOCALAPPDATA%\GestaoCombustivel\sync-token.txt"
  Write-Host "  Copie esse arquivo para $Pasta (por pendrive, não pelo ownCloud) ou cole o conteúdo agora."
  $seg = Read-Host '  Cole o token (Enter para pular)' -AsSecureString
  $txt = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
  if ($txt.Trim()) { Set-Content -Path $ArqToken -Value $txt.Trim() -Encoding ascii -NoNewline }
}
if (Test-Path $ArqToken) { Ok 'token do vigia' } else { Falta "token do vigia ($ArqToken)" }

# 4) acesso à Cloudflare para enviar os dados (login do Wrangler ou token de API)
if (Test-Path (Join-Path $Pasta 'cloudflare-token.txt')) { Ok 'token de API da Cloudflare' }
else {
  Push-Location $Projeto
  $quem = (npx --yes wrangler@4 whoami 2>&1 | Out-String)
  Pop-Location
  if ($quem -match 'b28f3cec780adbc994189a364453bf20') { Ok 'login do Wrangler na conta da Cloudflare do site' }
  elseif ($quem -match 'You are logged in|associated with the email') { Falta 'o login da Cloudflare está numa conta que não é a do site (conta b28f3cec...): rode  npx.cmd --yes wrangler@4 logout  e depois  npx.cmd --yes wrangler@4 login  com o e-mail da conta do site' }
  else { Falta 'login da Cloudflare: rode  npx.cmd --yes wrangler@4 login  (abre o navegador; entre com a conta da Cloudflare do site)' }
}

# 5) este computador é o reserva (prioridade 2)
Set-Content -Path (Join-Path $Pasta 'vigia.json') -Value '{"prioridade": 2}' -Encoding ascii
Ok 'marcado como RESERVA (prioridade 2)'

if ($faltas -gt 0) {
  Write-Host "`n$faltas item(ns) faltando. Resolva e rode este instalador de novo; a tarefa agendada só é criada com tudo OK.`n" -ForegroundColor Yellow
  exit 1
}

# 6) tarefa agendada: no logon e a cada 5 minutos (se o vigia cair, volta; se já estiver rodando, não abre outro)
$nodeExe = $node.Source
$script = Join-Path $Projeto 'scripts\sincronizar.mjs'
$acao = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless `"$nodeExe`" `"$script`" --vigiar" -WorkingDirectory $Projeto
$noLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$repetir = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$ajustes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger @($noLogon, $repetir) -Settings $ajustes -Description 'Vigia da Gestão de Combustível (RESERVA): assume a sincronização quando o principal está desligado.' -Force | Out-Null
Start-ScheduledTask -TaskName $Tarefa
Ok "tarefa agendada '$Tarefa' criada e iniciada"
Write-Host "`nPronto. Log: $Pasta\sincronizacao.log  (deve aparecer 'Plantão: em espera' enquanto o principal estiver ligado).`n" -ForegroundColor Green

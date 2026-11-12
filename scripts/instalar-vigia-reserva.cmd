@echo off
rem Instala o vigia da sincronização como RESERVA neste computador (veja instalar-vigia-reserva.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-vigia-reserva.ps1"
pause

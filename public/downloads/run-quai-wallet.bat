@echo off
setlocal EnableExtensions
chcp 65001 >nul
echo ==============================================================
echo  QuaiVault Windows CLI Launcher (Cyprus-1 QI / QUAI)
echo ==============================================================
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if %errorlevel% equ 0 goto NODE_OK
echo [INFO] Node.js not found. Downloading official Node.js v20 LTS installer...
curl.exe -L "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -o "%TEMP%\nodejs-lts-x64.msi"
msiexec.exe /i "%TEMP%\nodejs-lts-x64.msi" /passive /norestart
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if %errorlevel% equ 0 goto NODE_OK
echo [ERROR] Please install Node.js LTS from https://nodejs.org/ and run this file again.
pause
exit /b 1
:NODE_OK
if exist "node_modules\quais" goto RUN_SCRIPT
echo Installing official Quai Network SDK (quais)...
call npm.cmd init -y >nul 2>nul
call npm.cmd install quais --no-audit --no-fund
:RUN_SCRIPT
node quai-wallet-win.mjs
pause

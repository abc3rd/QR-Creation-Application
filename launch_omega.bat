@echo off
title Omega UI IoT Hub Master
color 05

:: 1. Start the Web Dashboard
echo [1/2] Launching Omega UI Web Hub...
cd /d "C:\Users\tegdg\Desktop\Omegaui-syncloudconnect\OmegaUI_Hub"
start "Omega Dashboard" cmd /k "pnpm dev"

:: 2. Wait for server initialization
timeout /t 10 /nobreak > nul

:: 3. Start the QR Engine
echo [2/2] Launching Python IoT Engine...
cd /d "C:\Users\tegdg\Desktop\0\iot"
start "Omega QR Engine" cmd /k "python QR-engine.py"

echo.
echo All Systems Nominal.
echo Command Center: http://localhost:8888/iot/qr-engine
pause
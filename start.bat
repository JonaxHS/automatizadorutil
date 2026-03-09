@echo off
REM Script de inicio rapido para Windows

echo ========================================
echo Automatizador de Videos - Inicio Rapido
echo ========================================
echo.

REM Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado
    echo Descarga e instala Node.js desde: https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js detectado: 
node --version
echo.

REM Verificar npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm no esta instalado
    pause
    exit /b 1
)

REM Instalar dependencias si es necesario
if not exist "node_modules" (
    echo [INFO] Instalando dependencias...
    call npm install
    echo.
)

REM Verificar .env
if not exist ".env" (
    echo [AVISO] Archivo .env no encontrado
    echo [INFO] Copiando .env.example a .env...
    copy .env.example .env
    echo.
    echo [IMPORTANTE] Por favor edita el archivo .env con tu configuracion:
    echo   - QWEN_CHAT_URL: URL de tu chat de Qwen AI
    echo   - VIDEO_TEMA: Tema predeterminado para los videos
    echo.
    pause
)

echo ========================================
echo Iniciando servidor web...
echo Panel de control: http://localhost:3000
echo ========================================
echo.
echo Presiona Ctrl+C para detener el servidor
echo.

REM Iniciar servidor
npm start

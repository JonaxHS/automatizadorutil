#!/bin/bash

# Script de primer inicio después de instalar dependencias

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🎬 Automatizador de Videos - Configuración Inicial           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Este script te ayudará a configurar el automatizador por primera vez."
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado."
    echo "📥 Descárgalo desde: https://nodejs.org"
    exit 1
fi

echo "✅ Node.js $(node --version) detectado"
echo ""

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error al instalar dependencias"
        exit 1
    fi
    echo "✅ Dependencias instaladas"
    echo ""
fi

# Verificar .env
if [ ! -f ".env" ]; then
    echo "📋 Creando archivo de configuración .env..."
    cp .env.example .env
    echo "✅ Archivo .env creado"
    echo ""
fi

# Configuración de autenticaciones
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🔐 PASO IMPORTANTE: Configurar Autenticaciones                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Tanto Qwen AI como Veed.io requieren inicio de sesión con Google."
echo ""
echo "Necesitas ejecutar el asistente de configuración de autenticaciones"
echo "que abrirá un navegador para que inicies sesión manualmente."
echo ""
echo "Solo necesitas hacer esto UNA VEZ. Las sesiones se guardarán"
echo "automáticamente para futuros usos."
echo ""

read -p "¿Deseas configurar las autenticaciones ahora? (s/n): " respuesta

if [[ "$respuesta" == "s" || "$respuesta" == "S" ]]; then
    echo ""
    echo "Iniciando asistente de autenticación..."
    echo ""
    npm run setup-auth
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Autenticaciones configuradas correctamente"
        echo ""
        echo "╔═══════════════════════════════════════════════════════════════╗"
        echo "║  🎉 ¡Todo listo! Ya puedes usar el automatizador               ║"
        echo "╚═══════════════════════════════════════════════════════════════╝"
        echo ""
        echo "Para iniciar el servidor web:"
        echo "  npm start"
        echo ""
        echo "Luego abre tu navegador en: http://localhost:3000"
        echo ""
    else
        echo ""
        echo "⚠️  No se completó la configuración de autenticaciones"
        echo "Puedes ejecutarla más tarde con: npm run setup-auth"
        echo ""
    fi
else
    echo ""
    echo "⏭️  Saltando configuración de autenticaciones"
    echo ""
    echo "⚠️  IMPORTANTE: Debes ejecutar esto antes del primer uso:"
    echo "  npm run setup-auth"
    echo ""
fi

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  📚 Recursos Disponibles                                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "  📖 README.md          - Documentación completa"
echo "  🚀 QUICKSTART.md      - Inicio rápido en 5 minutos"
echo "  🔐 AUTENTICACION.md   - Guía de autenticación detallada"
echo "  🐳 DESPLIEGUE.md      - Despliegue en VPS con Docker"
echo "  🔌 API.md             - Documentación de la API"
echo ""
echo "¡Disfruta automatizando tus videos! 🎬✨"
echo ""

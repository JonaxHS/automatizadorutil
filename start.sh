# Script de inicio rápido para desarrollo local

echo "🚀 Iniciando Automatizador de Videos..."
echo ""

# Verificar que Node.js esté instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado."
    echo "📥 Instala Node.js desde: https://nodejs.org"
    exit 1
fi

echo "✅ Node.js $(node --version) detectado"
echo ""

# Verificar que npm esté instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado."
    exit 1
fi

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    echo ""
fi

# Verificar si existe el archivo .env
if [ ! -f ".env" ]; then
    echo "⚠️  Archivo .env no encontrado"
    echo "📋 Copiando .env.example a .env..."
    cp .env.example .env
    echo ""
    echo "⚙️  Por favor edita el archivo .env con tu configuración:"
    echo "   - QWEN_CHAT_URL: URL de tu chat de Qwen AI"
    echo "   - VIDEO_TEMA: Tema predeterminado para los videos"
    echo ""
    echo "Presiona Enter para continuar cuando hayas configurado el .env..."
    read
fi

echo "🌐 Iniciando servidor web..."
echo "📊 Panel de control: http://localhost:3000"
echo ""
echo "💡 Presiona Ctrl+C para detener el servidor"
echo ""

# Iniciar el servidor
npm start

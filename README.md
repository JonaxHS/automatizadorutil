# 🎬 Automatizador de Videos - Qwen + Veed.io

Automatizador web que genera videos en Veed.io usando guiones creados por Qwen AI. Incluye interfaz web completa para gestionar y monitorear las automatizaciones.

## 📋 Descripción

Este proyecto automatiza completamente el proceso de creación de videos con una interfaz web moderna:

1. **Genera un guion** usando Qwen AI basado en un tema específico
2. **Crea el video** automáticamente en Veed.io usando el guion generado
3. **Gestiona todo desde una interfaz web** con actualizaciones en tiempo real

## ✨ Características Principales

- 🌐 **Interfaz web moderna** con diseño responsive
- 📊 **Monitoreo en tiempo real** con WebSocket
- 📝 **Gestión de guiones** guardados
- 📚 **Historial de ejecuciones** completo
- 🐳 **Listo para Docker** y VPS
- 🎛️ **Panel de control** intuitivo
- 📈 **Barra de progreso** en tiempo real
- 💾 **Auto-guardado** de todos los guiones
- 🔄 **API RESTful** completa
- 📱 **Responsive** - funciona en móviles y tablets

## 📦 Requisitos

- Node.js 18 o superior
- npm o yarn

## 🔧 Instalación

### Opción 1: Instalación Local (Desarrollo)

1. **Clona o descarga el proyecto**

2. **Instala las dependencias:**

```bash
npm install
```

3. **Configura las variables de entorno:**

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones:

```env
# Configuración del navegador (false = ver el navegador, true = ejecutar en segundo plano)
HEADLESS=false

# URLs
QWEN_CHAT_URL=https://chat.qwen.ai/c/tu-chat-id-aqui
VEED_URL=https://www.veed.io

# Credenciales de Veed.io (opcional, solo si requiere login)
VEED_EMAIL=
VEED_PASSWORD=

# Configuración del video
VIDEO_TEMA=Crea un tutorial interesante sobre inteligencia artificial
VIDEO_DURACION=60

# Timeouts en milisegundos
TIMEOUT_NAVIGATION=60000
TIMEOUT_GENERATION=180000

# Puerto del servidor web
PORT=3000
```

### Opción 2: Despliegue en VPS con Docker (Producción)

**Ver la [Guía Completa de Despliegue](DESPLIEGUE.md) para instrucciones detalladas.**

Pasos rápidos:

```bash
# En tu VPS
git clone tu-repositorio
cd automatizador
cp .env.example .env
nano .env  # Configurar variables (HEADLESS=true en VPS)

# Construir y ejecutar con Docker
docker-compose up -d

# Ver logs
docker-compose logs -f
```

Accede a: `http://tu-vps-ip:3000`

## 🎯 Uso

### Modo Web (Recomendado)

1. **Inicia el servidor:**

```bash
npm start
```

2. **Abre tu navegador:**

Visita: `http://localhost:3000`

3. **Usa la interfaz:**

   - Ingresa el tema del video en el formulario
   - Ajusta la duración deseada
   - Haz clic en "Iniciar Automatización"
   - Observa el progreso en tiempo real
   - Revisa los resultados y el historial

### Modo CLI (Línea de Comandos)

Si prefieres ejecutar desde la terminal:

```bash
npm run cli
```

El tema y configuración se toman del archivo `.env`.

### Docker

```bash
# Iniciar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

## 📁 Estructura del Proyecto

```
automatizador/
├── src/
│   ├── server.js         # Servidor web con API y WebSocket
│   ├── index.js          # Script CLI (modo consola)
│   ├── qwen.js           # Módulo para generar guiones con Qwen
│   └── veed.js           # Módulo para generar videos en Veed.io
├── public/
│   ├── index.html        # Interfaz web principal
│   ├── style.css         # Estilos de la interfaz
│   └── app.js            # JavaScript del cliente
├── screenshots/          # Screenshots de debug (auto-generada)
├── guiones/              # Guiones generados (auto-generada)
├── videos/               # Videos descargados (auto-generada)
├── logs/                 # Logs en JSON (auto-generada)
├── config.js             # Configuración centralizada
├── Dockerfile            # Imagen Docker
├── docker-compose.yml    # Orquestación Docker
├── .env                  # Variables de entorno
├── .env.example          # Plantilla de variables
├── .dockerignore         # Archivos ignorados por Docker
├── .gitignore            # Archivos ignorados por git
├── package.json          # Dependencias del proyecto
├── README.md             # Este archivo
└── DESPLIEGUE.md         # Guía de despliegue en VPS
```

## 🔍 Cómo Funciona

### Arquitectura

El sistema consta de tres componentes principales:

1. **Servidor Web (Express + Socket.IO)**
   - API REST para gestión de automatizaciones
   - WebSocket para actualizaciones en tiempo real
   - Sirve la interfaz web estática

2. **Motor de Automatización (Playwright)**
   - Controla el navegador para interactuar con Qwen AI y Veed.io
   - Detecta elementos automáticamente con múltiples selectores de respaldo
   - Genera screenshots para debugging

3. **Interfaz Web (HTML/CSS/JS)**
   - Panel de control intuitivo
   - Monitoreo en tiempo real del progreso
   - Gestión de guiones e historial

### Flujo de Trabajo

1. Usuario ingresa tema y duración en la interfaz web
2. Click en "Iniciar Automatización" envía solicitud al servidor
3. Servidor inicia proceso en segundo plano:
   - **Paso 1**: Navega a Qwen AI y genera el guion
   - **Paso 2**: Guarda el guion en carpeta `guiones/`
   - **Paso 3**: Navega a Veed.io y pega el guion
   - **Paso 4**: Genera el video
4. Durante todo el proceso, el servidor envía actualizaciones por WebSocket
5. Cliente actualiza la UI en tiempo real con progreso y logs
6. Al finalizar, muestra resultados y actualiza historial

## 🐛 Debugging

### Desde la Interfaz Web

- **Logs en Tiempo Real**: Observa todos los pasos en el panel de estado
- **Screenshots**: Revisa `screenshots/` si algo falla
- **Historial**: Consulta ejecuciones previas y sus resultados

### Desde la Terminal

1. **Ver logs del contenedor Docker:**
```bash
docker-compose logs -f
```

2. **Ver logs de la aplicación:**
```bash
# Los logs se guardan en formato JSON
cat logs/YYYY-MM-DD.json
```

### Modo Visual (Desarrollo Local)

Configura `HEADLESS=false` en el `.env` para ver el navegador en acción:

```bash
npm start
# Luego abre http://localhost:3000 e inicia una automatización
```

### Problemas Comunes

| Problema | Solución |
|----------|----------|
| No encuentra campo de entrada en Qwen | Actualiza selectores en `src/qwen.js` |
| Timeout en generación | Aumenta `TIMEOUT_GENERATION` en `.env` |
| Error de memoria en Docker | Aumenta límites en `docker-compose.yml` |
| WebSocket no conecta | Verifica configuración de Nginx/proxy |

## 🔌 API REST

El servidor expone los siguientes endpoints:

### GET `/api/estado`
Obtiene el estado actual de la automatización.

**Respuesta:**
```json
{
  "ejecutando": false,
  "paso": "Completado",
  "progreso": 100,
  "ultimoError": null,
  "ultimoGuion": {...},
  "ultimoVideo": {...},
  "historial": [...]
}
```

### GET `/api/config`
Obtiene la configuración actual.

### POST `/api/config`
Actualiza la configuración.

**Body:**
```json
{
  "tema": "Nuevo tema",
  "duracion": 90
}
```

### POST `/api/iniciar`
Inicia una nueva automatización.

**Body:**
```json
{
  "tema": "Tema opcional (usa config si no se proporciona)",
  "duracion": 60
}
```

### GET `/api/guiones`
Lista todos los guiones guardados.

### GET `/api/guiones/:nombre`
Obtiene el contenido de un guion específico.

### GET `/api/historial`
Obtiene el historial completo de ejecuciones.

## 📸 Capturas de Pantalla

### Interfaz Web
La interfaz incluye:
- 📋 Panel de configuración con tema y duración
- 📊 Monitor de progreso en tiempo real
- ✅ Panel de resultados con guion y video generado
- 📚 Historial de todas las ejecuciones
- 📄 Biblioteca de guiones guardados

### Características Visuales
- 🎨 Diseño moderno dark theme
- 📱 Responsive (móvil, tablet, desktop)
- ⚡ Actualizaciones en tiempo real sin recargar
- 🎯 Barras de progreso animadas
- 📝 Logs en vivo con colores por tipo

## 🚀 Despliegue en Producción

Para desplegar en un VPS con acceso público 24/7:

1. **Lee la [Guía Completa de Despliegue](DESPLIEGUE.md)**
2. Configura tu VPS con Docker
3. Configura Nginx como proxy reverso
4. Opcionalmente, agrega SSL con Let's Encrypt
5. Accede desde cualquier lugar

**Mínimos requeridos del servidor:**
- 4GB RAM (8GB recomendado)
- 2 CPU cores
- 20GB disco
- Ubuntu 20.04+ / Debian 11+

## ⚙️ Scripts NPM Disponibles

```bash
npm start          # Inicia el servidor web
npm run dev        # Modo desarrollo con auto-reload
npm run cli        # Ejecuta en modo CLI (terminal)
npm run docker:build   # Construye imagen Docker
npm run docker:run     # Ejecuta con Docker Compose
npm run docker:stop    # Detiene contenedores
npm run docker:logs    # Ver logs de Docker
```

## 📝 Notas Importantes

- ⚡ El proceso puede tardar varios minutos dependiendo de la velocidad de las APIs
- 🌐 Requiere conexión a internet estable
- � **Importante**: Debes usar una URL de chat específica de Qwen AI. Ve a https://chat.qwen.ai, crea o abre un chat, y copia la URL completa (ej: https://chat.qwen.ai/c/tu-chat-id) para configurarla en `QWEN_CHAT_URL` en el archivo `.env`
- �🔐 Las credenciales de Veed.io son opcionales (solo si la plataforma requiere login)
- 📸 Los screenshots ayudan a identificar problemas si algo falla
- 💾 Todos los guiones se guardan automáticamente para futuras referencias

## 📄 Licencia

MIT

## 🎉 ¡Disfruta automatizando la creación de tus videos!

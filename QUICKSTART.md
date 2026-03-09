# 🚀 Inicio Rápido - Automatizador de Videos

Esta guía te ayudará a poner en marcha el automatizador en 5 minutos.

## Opción 1: Desarrollo Local (Más Fácil)

### 1️⃣ Requisitos Previos

- ✅ Node.js 18 o superior → [Descargar aquí](https://nodejs.org)
- ✅ Conexión a internet

### 2️⃣ Instalación Rápida

**En macOS/Linux:**
```bash
./start.sh
```

**En Windows:**
```bash
start.bat
```

O manualmente:
```bash
npm install
cp .env.example .env
# Edita .env con tu configuración
npm start
```

### 3️⃣ Configurar .env

Edita el archivo `.env` y configura tu chat de Qwen:

```env
QWEN_CHAT_URL=https://chat.qwen.ai/c/TU-CHAT-ID-AQUI
VIDEO_TEMA=Tu tema predeterminado aquí
HEADLESS=false
```

**¿Cómo obtener tu CHAT_URL?**
1. Ve a https://chat.qwen.ai
2. Crea o abre un chat
3. Copia la URL completa de la barra de direcciones
4. Pégala en el archivo `.env`

### 4️⃣ Acceder a la Interfaz

Abre tu navegador en: **http://localhost:3000**

¡Listo! 🎉

---

## Opción 2: Docker (Para VPS/Producción)

### Requisitos
- Docker instalado
- Docker Compose instalado

### Pasos

```bash
# 1. Clonar/descargar proyecto
git clone tu-repo
cd automatizador

# 2. Configurar
cp .env.example .env
nano .env  # Configura HEADLESS=true y demás

# 3. Ejecutar
docker-compose up -d

# 4. Ver logs
docker-compose logs -f
```

### Acceder
- Local: `http://localhost:3000`
- Remoto: `http://tu-vps-ip:3000`

---

## 🎯 Primer Uso

1. **Abre la interfaz web**
   - Ve a http://localhost:3000

2. **Ingresa un tema**
   - Por ejemplo: "Crea un tutorial sobre los beneficios del ejercicio"

3. **Ajusta la duración**
   - Establece cuántos segundos quieres (por defecto 60)

4. **Haz clic en "Iniciar Automatización"**
   - Observa el progreso en tiempo real
   - El navegador se abrirá automáticamente (si HEADLESS=false)

5. **Revisa los resultados**
   - El guion aparecerá en el panel de resultados
   - Obtendrás un enlace al video en Veed.io

---

## 📖 Más Información

- **Guía Completa**: Ver [README.md](README.md)
- **Despliegue en VPS**: Ver [DESPLIEGUE.md](DESPLIEGUE.md)
- **Problemas**: Revisa la sección de Debugging en el README

---

## 🆘 Problemas Comunes

### "npm: command not found"
→ Instala Node.js desde https://nodejs.org

### "Permission denied" en Linux/Mac
→ Ejecuta: `chmod +x start.sh`

### No encuentra el chat de Qwen
→ Verifica que QWEN_CHAT_URL sea correcta en `.env`

### El video no se genera
→ Ejecuta con `HEADLESS=false` para ver qué pasa

---

## 💡 Consejos

- **Primera vez**: Usa `HEADLESS=false` para ver el proceso
- **Producción**: Usa `HEADLESS=true` para ejecutar en segundo plano
- **VPS**: Sigue la guía en [DESPLIEGUE.md](DESPLIEGUE.md)
- **Debugging**: Los screenshots se guardan en `screenshots/`

---

¡Disfruta automatizando tus videos! 🎬✨

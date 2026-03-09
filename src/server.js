import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Estado global de la automatización
let estadoAutomatizacion = {
  ejecutando: false,
  paso: '',
  progreso: 0,
  ultimoError: null,
  ultimoGuion: null,
  ultimoVideo: null,
  historial: []
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Función para emitir actualizaciones de estado
function emitirEstado(mensaje, progreso, tipo = 'info') {
  console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
  
  estadoAutomatizacion.paso = mensaje;
  estadoAutomatizacion.progreso = progreso;
  
  io.emit('estado', {
    ejecutando: estadoAutomatizacion.ejecutando,
    paso: mensaje,
    progreso: progreso,
    tipo: tipo,
    timestamp: new Date().toISOString()
  });
}

// Función para guardar log
function guardarLog(tipo, mensaje, datos = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    tipo,
    mensaje,
    datos
  };
  
  const logFile = path.join(process.cwd(), 'logs', `${new Date().toISOString().split('T')[0]}.json`);
  
  // Asegurar que existe el directorio de logs
  if (!fs.existsSync(path.join(process.cwd(), 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
  }
  
  // Agregar al archivo de log
  let logs = [];
  if (fs.existsSync(logFile)) {
    try {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    } catch (e) {
      logs = [];
    }
  }
  
  logs.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

// API Endpoints

// Obtener estado actual
app.get('/api/estado', (req, res) => {
  res.json(estadoAutomatizacion);
});

// Obtener configuración actual
app.get('/api/config', (req, res) => {
  res.json({
    tema: config.video.tema,
    duracion: config.video.duracion,
    qwenChatUrl: config.qwenChatUrl,
    veedUrl: config.veedUrl,
    headless: config.headless
  });
});

// Actualizar configuración
app.post('/api/config', (req, res) => {
  const { tema, duracion } = req.body;
  
  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'No se puede cambiar la configuración mientras se ejecuta una automatización' });
  }
  
  if (tema) {
    config.video.tema = tema;
    process.env.VIDEO_TEMA = tema;
  }
  
  if (duracion) {
    config.video.duracion = parseInt(duracion);
    process.env.VIDEO_DURACION = duracion.toString();
  }
  
  res.json({ mensaje: 'Configuración actualizada', config: { tema: config.video.tema, duracion: config.video.duracion } });
});

// Iniciar automatización
app.post('/api/iniciar', async (req, res) => {
  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'Ya hay una automatización en ejecución' });
  }
  
  const { tema, duracion } = req.body;
  
  // Actualizar config temporalmente si se proporciona
  const temaOriginal = config.video.tema;
  const duracionOriginal = config.video.duracion;
  
  if (tema) config.video.tema = tema;
  if (duracion) config.video.duracion = parseInt(duracion);
  
  res.json({ mensaje: 'Automatización iniciada', id: Date.now() });
  
  // Ejecutar en segundo plano
  ejecutarAutomatizacion().finally(() => {
    // Restaurar config original
    config.video.tema = temaOriginal;
    config.video.duracion = duracionOriginal;
  });
});

// Función principal de automatización
async function ejecutarAutomatizacion() {
  estadoAutomatizacion.ejecutando = true;
  estadoAutomatizacion.ultimoError = null;
  
  const ejecucionId = Date.now();
  
  try {
    emitirEstado('Iniciando automatización...', 0, 'info');
    guardarLog('inicio', 'Automatización iniciada', { tema: config.video.tema });
    
    // Crear carpetas necesarias
    const carpetas = ['screenshots', 'guiones', 'videos', 'logs'];
    for (const carpeta of carpetas) {
      if (!fs.existsSync(carpeta)) {
        fs.mkdirSync(carpeta, { recursive: true });
      }
    }
    
    emitirEstado('Generando guion con Qwen AI...', 10, 'info');
    
    // PASO 1: Generar guion
    const guion = await generarGuion(config.video.tema);
    
    emitirEstado('Guion generado exitosamente', 40, 'success');
    
    // Guardar guion
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreArchivo = `guion-${timestamp}.txt`;
    const rutaGuion = path.join('guiones', nombreArchivo);
    
    fs.writeFileSync(rutaGuion, guion, 'utf-8');
    
    estadoAutomatizacion.ultimoGuion = {
      archivo: nombreArchivo,
      contenido: guion,
      fecha: new Date().toISOString()
    };
    
    guardarLog('guion', 'Guion generado', { archivo: nombreArchivo, longitud: guion.length });
    
    emitirEstado('Iniciando generación de video en Veed.io...', 50, 'info');
    
    // PASO 2: Generar video
    const urlVideo = await generarVideo(guion);
    
    emitirEstado('Video generado exitosamente', 90, 'success');
    
    estadoAutomatizacion.ultimoVideo = {
      url: urlVideo,
      fecha: new Date().toISOString()
    };
    
    guardarLog('video', 'Video generado', { url: urlVideo });
    
    // Agregar al historial
    estadoAutomatizacion.historial.unshift({
      id: ejecucionId,
      fecha: new Date().toISOString(),
      tema: config.video.tema,
      guion: nombreArchivo,
      video: urlVideo,
      exito: true
    });
    
    // Mantener solo los últimos 50
    if (estadoAutomatizacion.historial.length > 50) {
      estadoAutomatizacion.historial = estadoAutomatizacion.historial.slice(0, 50);
    }
    
    emitirEstado('Automatización completada exitosamente', 100, 'success');
    guardarLog('completado', 'Automatización completada', { id: ejecucionId });
    
  } catch (error) {
    console.error('Error en automatización:', error);
    
    estadoAutomatizacion.ultimoError = {
      mensaje: error.message,
      fecha: new Date().toISOString()
    };
    
    estadoAutomatizacion.historial.unshift({
      id: ejecucionId,
      fecha: new Date().toISOString(),
      tema: config.video.tema,
      error: error.message,
      exito: false
    });
    
    emitirEstado(`Error: ${error.message}`, estadoAutomatizacion.progreso, 'error');
    guardarLog('error', 'Error en automatización', { error: error.message });
    
  } finally {
    estadoAutomatizacion.ejecutando = false;
  }
}

// Obtener lista de guiones
app.get('/api/guiones', (req, res) => {
  const guionesDir = path.join(process.cwd(), 'guiones');
  
  if (!fs.existsSync(guionesDir)) {
    return res.json([]);
  }
  
  const archivos = fs.readdirSync(guionesDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const stats = fs.statSync(path.join(guionesDir, f));
      return {
        nombre: f,
        fecha: stats.mtime,
        tamano: stats.size
      };
    })
    .sort((a, b) => b.fecha - a.fecha);
  
  res.json(archivos);
});

// Obtener contenido de un guion
app.get('/api/guiones/:nombre', (req, res) => {
  const rutaGuion = path.join(process.cwd(), 'guiones', req.params.nombre);
  
  if (!fs.existsSync(rutaGuion)) {
    return res.status(404).json({ error: 'Guion no encontrado' });
  }
  
  const contenido = fs.readFileSync(rutaGuion, 'utf-8');
  res.json({ nombre: req.params.nombre, contenido });
});

// Obtener historial
app.get('/api/historial', (req, res) => {
  res.json(estadoAutomatizacion.historial);
});

// WebSocket para actualizaciones en tiempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado actual al conectarse
  socket.emit('estado', {
    ejecutando: estadoAutomatizacion.ejecutando,
    paso: estadoAutomatizacion.paso,
    progreso: estadoAutomatizacion.progreso,
    timestamp: new Date().toISOString()
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log('');
  console.log('═'.repeat(60));
  console.log('🚀 Servidor de Automatización de Videos Iniciado');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`🌐 Servidor ejecutándose en: http://localhost:${PORT}`);
  console.log(`📊 Panel de control: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Configuración actual:');
  console.log(`   • Tema: ${config.video.tema}`);
  console.log(`   • Duración: ${config.video.duracion}s`);
  console.log(`   • Modo: ${config.headless ? 'Headless' : 'Visible'}`);
  console.log('');
  console.log('═'.repeat(60));
  console.log('');
});

export { app, io };

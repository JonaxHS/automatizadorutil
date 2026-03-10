import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';
import {
  cancelarSesionInteractivaWeb,
  finalizarSesionInteractivaWeb,
  getEstadoAutenticacion,
  iniciarSesionInteractivaWeb
} from './auth.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ─── Interceptar console para retransmitir logs al navegador ───────────────
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

function emitLog(nivel, args) {
  const mensaje = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  io.emit('log', { nivel, mensaje, timestamp: new Date().toISOString() });
}

console.log = (...args) => { _origLog(...args); emitLog('info', args); };
console.warn = (...args) => { _origWarn(...args); emitLog('warn', args); };
console.error = (...args) => { _origError(...args); emitLog('error', args); };
// ──────────────────────────────────────────────────────────────────────────

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

function persistirVariableEnv(clave, valor) {
  const envPath = path.join(__dirname, '../.env');
  const lineaNueva = `${clave}=${valor}`;

  let contenido = '';
  if (fs.existsSync(envPath)) {
    contenido = fs.readFileSync(envPath, 'utf-8');
  }

  const regex = new RegExp(`^${clave}=.*$`, 'm');
  if (regex.test(contenido)) {
    contenido = contenido.replace(regex, lineaNueva);
  } else {
    if (contenido && !contenido.endsWith('\n')) {
      contenido += '\n';
    }
    contenido += `${lineaNueva}\n`;
  }

  fs.writeFileSync(envPath, contenido, 'utf-8');
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

// Estado de autenticacion para login Google
app.get('/api/auth/status', (req, res) => {
  const estado = getEstadoAutenticacion();
  const host = req.get('host');
  const protocol = req.protocol;
  const hostname = (host || '').split(':')[0] || 'localhost';
  const noVncPort = process.env.NOVNC_PORT || '6080';

  res.json({
    ...estado,
    noVncUrl: `${protocol}://${hostname}:${noVncPort}/vnc.html?autoconnect=true&resize=remote`
  });
});

// Iniciar login interactivo desde la web
app.post('/api/auth/start', async (req, res) => {
  try {
    if (estadoAutomatizacion.ejecutando) {
      return res.status(400).json({ error: 'No se puede iniciar login mientras hay una automatizacion en ejecucion.' });
    }

    const { servicio } = req.body;
    if (!servicio || !['qwen', 'veed'].includes(servicio)) {
      return res.status(400).json({ error: 'Servicio invalido. Usa qwen o veed.' });
    }

    const url = servicio === 'qwen' ? config.qwenChatUrl : config.veedUrl;
    const session = await iniciarSesionInteractivaWeb(servicio, url);

    guardarLog('auth_start', 'Login interactivo iniciado', { servicio, sessionId: session.sessionId });
    io.emit('auth_estado', getEstadoAutenticacion());

    res.json({
      mensaje: `Login de ${servicio} iniciado`,
      ...session
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Guardar sesion iniciada de forma interactiva
app.post('/api/auth/finish', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId es requerido.' });
    }

    const resultado = await finalizarSesionInteractivaWeb(sessionId);
    guardarLog('auth_finish', 'Sesion guardada desde interfaz web', resultado);
    io.emit('auth_estado', getEstadoAutenticacion());

    res.json({ mensaje: 'Sesion guardada correctamente.', ...resultado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Cancelar login interactivo en curso
app.post('/api/auth/cancel', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId es requerido.' });
    }

    const resultado = await cancelarSesionInteractivaWeb(sessionId);
    guardarLog('auth_cancel', 'Sesion interactiva cancelada', resultado);
    io.emit('auth_estado', getEstadoAutenticacion());

    res.json({ mensaje: 'Sesion interactiva cancelada.', ...resultado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Actualizar configuración
app.post('/api/config', (req, res) => {
  const { tema, duracion, qwenChatUrl } = req.body;

  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'No se puede cambiar la configuración mientras se ejecuta una automatización' });
  }

  if (tema) {
    config.video.tema = tema;
    process.env.VIDEO_TEMA = tema;
    persistirVariableEnv('VIDEO_TEMA', tema);
  }

  if (duracion) {
    config.video.duracion = parseInt(duracion);
    process.env.VIDEO_DURACION = duracion.toString();
    persistirVariableEnv('VIDEO_DURACION', duracion.toString());
  }

  if (qwenChatUrl) {
    config.qwenChatUrl = qwenChatUrl;
    process.env.QWEN_CHAT_URL = qwenChatUrl;
    persistirVariableEnv('QWEN_CHAT_URL', qwenChatUrl);
  }

  res.json({
    mensaje: 'Configuración actualizada',
    config: {
      tema: config.video.tema,
      duracion: config.video.duracion,
      qwenChatUrl: config.qwenChatUrl
    }
  });
});

// Probar solo generación de guion con Qwen
app.post('/api/test-qwen', async (req, res) => {
  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'Ya hay una operación en ejecución' });
  }

  const { tema } = req.body;
  if (!tema) {
    return res.status(400).json({ error: 'El tema es requerido' });
  }

  estadoAutomatizacion.ejecutando = true;
  estadoAutomatizacion.ultimoError = null;

  try {
    emitirEstado('Probando generación de guion con Qwen AI...', 10, 'info');

    // Crear carpeta si no existe
    if (!fs.existsSync('guiones')) {
      fs.mkdirSync('guiones', { recursive: true });
    }

    const resultadoQwen = await generarGuion(tema);
    const guion = typeof resultadoQwen === 'string' ? resultadoQwen : resultadoQwen.guion;
    const descripcion = typeof resultadoQwen === 'string' ? '' : resultadoQwen.descripcion;

    emitirEstado('Guion generado exitosamente con Qwen', 100, 'success');

    // Guardar guion
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreArchivo = `guion-test-${timestamp}.txt`;
    const rutaGuion = path.join('guiones', nombreArchivo);
    fs.writeFileSync(rutaGuion, guion, 'utf-8');

    estadoAutomatizacion.ultimoGuion = {
      archivo: nombreArchivo,
      contenido: guion,
      descripcion,
      fecha: new Date().toISOString()
    };

    res.json({
      exito: true,
      guion,
      descripcion,
      archivo: nombreArchivo,
      longitud: guion.length
    });
  } catch (error) {
    console.error('Error al generar guion:', error);
    estadoAutomatizacion.ultimoError = {
      mensaje: error.message,
      fecha: new Date().toISOString()
    };
    emitirEstado(`Error: ${error.message}`, 0, 'error');
    res.status(500).json({ error: error.message });
  } finally {
    estadoAutomatizacion.ejecutando = false;
  }
});

// Probar solo generación de video con Veed.io
app.post('/api/test-veed', async (req, res) => {
  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'Ya hay una operación en ejecución' });
  }

  const { guion } = req.body;
  if (!guion) {
    return res.status(400).json({ error: 'El guion es requerido' });
  }

  estadoAutomatizacion.ejecutando = true;
  estadoAutomatizacion.ultimoError = null;

  try {
    emitirEstado('Enviando guion a Veed.io AI Studio...', 20, 'info');

    const urlVideo = await generarVideo(guion);

    emitirEstado('Video generado exitosamente en Veed.io', 100, 'success');

    estadoAutomatizacion.ultimoVideo = {
      url: urlVideo,
      fecha: new Date().toISOString()
    };

    res.json({
      exito: true,
      videoUrl: urlVideo,
      mensaje: 'Video generado exitosamente en Veed.io'
    });
  } catch (error) {
    console.error('Error al generar video en Veed.io:', error);
    estadoAutomatizacion.ultimoError = {
      mensaje: error.message,
      fecha: new Date().toISOString()
    };
    emitirEstado(`Error: ${error.message}`, 0, 'error');
    res.status(500).json({ error: error.message });
  } finally {
    estadoAutomatizacion.ejecutando = false;
  }
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
    const resultadoQwen = await generarGuion(config.video.tema);
    const guion = typeof resultadoQwen === 'string' ? resultadoQwen : resultadoQwen.guion;
    const descripcion = typeof resultadoQwen === 'string' ? '' : resultadoQwen.descripcion;

    emitirEstado('Guion generado exitosamente', 40, 'success');

    // Guardar guion
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreArchivo = `guion-${timestamp}.txt`;
    const rutaGuion = path.join('guiones', nombreArchivo);

    fs.writeFileSync(rutaGuion, guion, 'utf-8');

    estadoAutomatizacion.ultimoGuion = {
      archivo: nombreArchivo,
      contenido: guion,
      descripcion,
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

// Eliminar un guion
app.delete('/api/guiones/:nombre', (req, res) => {
  const rutaGuion = path.join(process.cwd(), 'guiones', req.params.nombre);
  if (!fs.existsSync(rutaGuion)) {
    return res.status(404).json({ error: 'Guion no encontrado' });
  }
  try {
    fs.unlinkSync(rutaGuion);
    res.json({ ok: true, mensaje: `Guion ${req.params.nombre} eliminado` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar capturas de pantalla
app.get('/api/screenshots', (req, res) => {
  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) return res.json([]);

  const archivos = fs.readdirSync(screenshotsDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .map(f => {
      const stats = fs.statSync(path.join(screenshotsDir, f));
      return { nombre: f, fecha: stats.mtime, tamano: stats.size };
    })
    .sort((a, b) => b.fecha - a.fecha);

  res.json(archivos);
});

// Servir una captura de pantalla por nombre
app.get('/api/screenshots/:nombre', (req, res) => {
  const rutaImg = path.join(process.cwd(), 'screenshots', path.basename(req.params.nombre));
  if (!fs.existsSync(rutaImg)) return res.status(404).json({ error: 'Captura no encontrada' });
  res.sendFile(rutaImg);
});

// Eliminar una captura de pantalla
app.delete('/api/screenshots/:nombre', (req, res) => {
  const rutaImg = path.join(process.cwd(), 'screenshots', path.basename(req.params.nombre));
  if (!fs.existsSync(rutaImg)) return res.status(404).json({ error: 'Captura no encontrada' });
  try {
    fs.unlinkSync(rutaImg);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

  socket.emit('auth_estado', getEstadoAutenticacion());

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

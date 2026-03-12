import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';
import {
  cancelarSesionInteractivaWeb,
  finalizarSesionInteractivaWeb,
  getEstadoAutenticacion,
  iniciarSesionInteractivaWeb
} from './auth.js';
import { subirReelAFacebook } from './facebook.js';
import { config } from '../config.js';
import { iniciarBot } from './telegram.js';
import { getEstadoSeries, getPromptSiguiente, marcarReelCompletado, reiniciarProgreso } from './series.js';

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
    headless: config.headless,
    telegramActivo: !!config.telegram.token,
    telegramToken: config.telegram.token ? config.telegram.token.substring(0, 8) + '...' : '',
    googleSheetId: config.googleSheetId,
    googleSheetUrl: config.googleSheetId
      ? `https://docs.google.com/spreadsheets/d/${config.googleSheetId}/edit`
      : ''
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
  const { tema, duracion, qwenChatUrl, telegramToken, googleSheetUrl } = req.body;

  if (estadoAutomatizacion.ejecutando) {
    return res.status(400).json({ error: 'No se puede cambiar la configuracion mientras se ejecuta una automatizacion' });
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

  if (telegramToken) {
    config.telegram.token = telegramToken;
    process.env.TELEGRAM_BOT_TOKEN = telegramToken;
    persistirVariableEnv('TELEGRAM_BOT_TOKEN', telegramToken);
  }

  if (googleSheetUrl) {
    // Aceptar la URL completa o directamente el ID
    const match = googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const sheetId = match ? match[1] : googleSheetUrl.trim();
    config.googleSheetId = sheetId;
    process.env.GOOGLE_SHEET_ID = sheetId;
    persistirVariableEnv('GOOGLE_SHEET_ID', sheetId);
    // Invalida cache de series para que descargue la nueva hoja
    import('./series.js').then(m => m.cargarSeries(true)).catch(() => { });
  }

  res.json({
    mensaje: 'Configuracion actualizada',
    config: {
      tema: config.video.tema,
      duracion: config.video.duracion,
      qwenChatUrl: config.qwenChatUrl,
      googleSheetId: config.googleSheetId,
      telegramActivo: !!config.telegram.token
    },
    nota: (telegramToken)
      ? 'El token de Telegram se guardara en .env. Reinicia el contenedor para activarlo.'
      : undefined
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

    const resultadoVeed = await generarVideo(guion);
    const urlVideo = resultadoVeed.url;
    const localVideo = resultadoVeed.localUrl;

    emitirEstado('Video generado exitosamente en Veed.io', 100, 'success');

    estadoAutomatizacion.ultimoVideo = {
      url: urlVideo,
      localUrl: localVideo,
      fecha: new Date().toISOString()
    };

    res.json({
      exito: true,
      videoUrl: urlVideo,
      localUrl: localVideo,
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
    const resultadoVeed = await generarVideo(guion);
    const urlVideo = resultadoVeed.url;
    const localVideo = resultadoVeed.localUrl;

    emitirEstado('Video generado exitosamente', 90, 'success');

    // Escribir JSON con metadatos del video 
    // Para conservar la descripción de Qwen y poder publicarlo en FB luego
    if (localVideo) {
      const nombreBase = path.basename(localVideo, '.mp4');
      const rutaJson = path.join(process.cwd(), 'public', 'videos', `${nombreBase}.json`);
      fs.writeFileSync(rutaJson, JSON.stringify({
        nombre: path.basename(localVideo),
        descripcion: descripcion || config.video.tema,
        fecha: new Date().toISOString()
      }, null, 2), 'utf-8');
    }

    // Módulos posteriores: Subida a Facebook
    if (localVideo && config.facebook.pageId && config.facebook.accessToken) {
      try {
        emitirEstado('Iniciando subida a Facebook Reels...', 95, 'info');
        const rutaAbsolutaVideo = path.join(process.cwd(), 'public', localVideo);
        // Fallback a tema si el guion no trajo descripción separada
        const textoPost = descripcion || config.video.tema;

        await subirReelAFacebook(rutaAbsolutaVideo, textoPost, (msg) => {
          emitirEstado(`[FB] ${msg}`, 95, 'info');
        });
        emitirEstado('Proceso de publicación en Facebook terminado.', 98, 'success');
      } catch (fbError) {
        emitirEstado(`Error subiendo a Facebook: ${fbError.message}`, 95, 'error');
        // No fallamos toda la automatización por culpa de Facebook
      }
    } else {
      emitirEstado('Omitiendo subida a Facebook (Falta Configuración o MP4)', 95, 'info');
    }

    estadoAutomatizacion.ultimoVideo = {
      url: urlVideo,
      localUrl: localVideo,
      fecha: new Date().toISOString()
    };

    guardarLog('video', 'Video generado', { url: urlVideo, localUrl: localVideo });

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

// ── API Videos Guardados ────────────────────────────────────────────────────
const videosDir = path.join(__dirname, '../public/videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

app.get('/api/videos', (req, res) => {
  try {
    const files = fs.readdirSync(videosDir)
      .filter(f => f.endsWith('.mp4'))
      .map(file => {
        const stats = fs.statSync(path.join(videosDir, file));

        let descripcionItem = '';
        const jsonPath = path.join(videosDir, file.replace('.mp4', '.json'));
        if (fs.existsSync(jsonPath)) {
          try {
            descripcionItem = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).descripcion || '';
          } catch (e) { }
        }

        return {
          nombre: file,
          url: `/videos/${file}`,
          descripcion: descripcionItem,
          fecha: stats.mtime,
          tamaño: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
        };
      })
      .sort((a, b) => b.fecha - a.fecha);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/videos/:nombre', (req, res) => {
  try {
    const { nombre } = req.params;
    const rutaVideo = path.join(videosDir, nombre);
    if (!fs.existsSync(rutaVideo)) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }
    fs.unlinkSync(rutaVideo);

    // Eliminar tb el JSON asociado si existe
    const rutaJson = path.join(videosDir, nombre.replace('.mp4', '.json'));
    if (fs.existsSync(rutaJson)) {
      fs.unlinkSync(rutaJson);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── API Facebook Configuración y Upload ──────────────────────────────────────────

app.get('/api/facebook/config', (req, res) => {
  res.json(config.facebook);
});

app.post('/api/facebook/config', (req, res) => {
  try {
    const { pageId, accessToken } = req.body;

    // Validar formato mínimo
    if (pageId !== undefined) config.facebook.pageId = String(pageId).trim();
    if (accessToken !== undefined) config.facebook.accessToken = String(accessToken).trim();

    // Persistir usando el helper `persistirVariableEnv` o similar si ya existiera,
    // o simplemente manipularíamos manualmente el `.env`. 
    // Como el script pide inyectarlos en el .env:
    let envContent = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf-8') : '';

    const upsertEnv = (key, value) => {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    };

    upsertEnv('FB_PAGE_ID', config.facebook.pageId);
    upsertEnv('FB_ACCESS_TOKEN', config.facebook.accessToken);

    fs.writeFileSync('.env', envContent.trim() + '\n', 'utf-8');

    res.json({ ok: true, mensaje: 'Credenciales de Facebook guardadas en .env y memoria.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/facebook/upload', async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre del video' });

  const localVideoPath = path.join(videosDir, nombre);
  if (!fs.existsSync(localVideoPath)) return res.status(404).json({ error: 'El archivo MP4 no existe' });

  // Como la subida a fb es pesada, respondemos de inmediato y la procesamos en bg.
  res.json({ ok: true, mensaje: `Iniciando subida manual de ${nombre} a Facebook...` });

  try {
    emitirEstado(`Iniciando subida Manual a FB Reels de ${nombre}...`, 0, 'info');
    await subirReelAFacebook(localVideoPath, descripcion || '', (msg) => {
      emitirEstado(`[FB Manual] ${msg}`, 0, 'info');
    });
    emitirEstado(`[FB Manual] Proceso de ${nombre} finalizado.`, 0, 'success');
  } catch (e) {
    emitirEstado(`[FB Manual] Error: ${e.message}`, 0, 'error');
  }
});

// Obtener historial
app.get('/api/historial', (req, res) => {
  res.json(estadoAutomatizacion.historial);
});

// ── API Programación de Horarios ──────────────────────────────────────────────
import { initScheduler, getState as getScheduleState, guardarConfiguracion as saveSchedule } from './scheduler.js';

app.get('/api/schedule', (req, res) => {
  res.json(getScheduleState());
});

app.post('/api/schedule', (req, res) => {
  const { active, times } = req.body;
  saveSchedule(active, times);
  res.json({ ok: true });
});

// Inicializar el programador (Cron-like)
initScheduler(async () => {
  // Lógica de disparo programado
  if (estadoAutomatizacion.ejecutando) {
    console.log('[Scheduler] ⏰ Se intentó iniciar ejecución programada pero ya hay otra en curso.');
    return;
  }

  try {
    console.log('═'.repeat(60));
    console.log('[Scheduler] 🚀 Iniciando flujo completo de serie programado!');
    console.log('═'.repeat(60));

    const { getPromptSiguiente, marcarReelCompletado } = await import('./series.js');
    const sig = await getPromptSiguiente();
    const prompt = sig.prompt;

    console.log(`[Scheduler] Prompt a usar: "${prompt}"`);

    const sessionDir = path.join(process.cwd(), 'sesiones', Date.now().toString());
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    estadoAutomatizacion = {
      ejecutando: true,
      paso: 'Iniciando automatización programada',
      progreso: 0,
      historial: []
    };
    emitirEstado();

    // 1. Qwen
    const qwenUrl = config.qwenChatUrl;
    const { generarGuion } = await import('./qwen.js');
    const resultadoQwen = await generarGuion(prompt, sessionDir, qwenUrl, emitirEstado);

    // 2. Veed
    const { generarVideo } = await import('./veed.js');
    const resultadoVeed = await generarVideo(resultadoQwen.guion, sessionDir, emitirEstado);

    estadoAutomatizacion.ultimoVideo = {
      url: resultadoVeed.url,
      localUrl: resultadoVeed.localUrl,
      fecha: new Date().toISOString()
    };

    // 3. Terminar
    estadoAutomatizacion.ejecutando = false;
    estadoAutomatizacion.paso = 'Completado';
    estadoAutomatizacion.progreso = 100;
    emitirEstado('success');

    // 4. Avanzar Serie
    await marcarReelCompletado();
    console.log('[Scheduler] ✅ Reel programado completado y serie avanzada automáticamente.');

  } catch (err) {
    console.error('[Scheduler] ❌ Error en flujo programado:', err);
    estadoAutomatizacion.ejecutando = false;
    estadoAutomatizacion.paso = `Error: ${err.message}`;
    emitirEstado('error');
  }
});


// ── Series API ──────────────────────────────────────────────────────────────

app.get('/api/series', async (req, res) => {
  try {
    const estado = await getEstadoSeries();
    const siguiente = await getPromptSiguiente();
    res.json({ ...estado, siguientePrompt: siguiente.prompt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/series/avanzar', async (req, res) => {
  try {
    const nuevo = await marcarReelCompletado();
    const estado = await getEstadoSeries();
    res.json({ ok: true, ...estado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/series/reiniciar', (req, res) => {
  reiniciarProgreso();
  res.json({ ok: true, mensaje: 'Progreso reiniciado' });
});

app.post('/api/series/seleccionar', async (req, res) => {
  try {
    const { serieIndex, reelIndex } = req.body;
    if (serieIndex === undefined) return res.status(400).json({ error: 'Falta serieIndex' });
    import('./series.js').then(async m => {
      await m.seleccionarSerie(parseInt(serieIndex), parseInt(reelIndex || 0));
      res.json({ ok: true, mensaje: 'Serie seleccionada manual' });
    }).catch(e => res.status(500).json({ error: e.message }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Iniciar bot de Telegram (si hay token configurado)
iniciarBot(emitirEstado);

export { app, io };

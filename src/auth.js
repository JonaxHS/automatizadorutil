import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const AUTH_DIR = path.join(process.cwd(), '.auth');
const STORAGE_STATE_FILE = path.join(AUTH_DIR, 'storage-state.json');
const BROWSER_STATE_FILE = path.join(AUTH_DIR, 'browser-state.json');
const activeSessions = new Map();

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function getStorageStatePath() {
  ensureAuthDir();
  return STORAGE_STATE_FILE;
}

export function getSesionMetadata() {
  if (!fs.existsSync(BROWSER_STATE_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(BROWSER_STATE_FILE, 'utf-8'));
  } catch (error) {
    return null;
  }
}

export async function crearNavegadorConSesion(headless = false) {
  ensureAuthDir();

  const browser = await chromium.launch({
    headless,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  let context;

  if (fs.existsSync(STORAGE_STATE_FILE)) {
    try {
      context = await browser.newContext({
        viewport: null,
        storageState: STORAGE_STATE_FILE
      });
      console.log('Sesion guardada cargada.');
    } catch (error) {
      console.log('No se pudo cargar sesion guardada, creando contexto limpio.');
      context = await browser.newContext({ viewport: null });
    }
  } else {
    context = await browser.newContext({ viewport: null });
  }

  const page = await context.newPage();
  return { browser, context, page };
}

export async function guardarSesion(context) {
  const storageStatePath = getStorageStatePath();

  await context.storageState({ path: storageStatePath });

  const metadata = {
    fecha: new Date().toISOString(),
    mensaje: 'Sesion del navegador guardada'
  };

  fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(metadata, null, 2));
}

export async function estaAutenticado(page, url, indicadoresAutenticacion) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    for (const selector of indicadoresAutenticacion) {
      try {
        const elemento = await page.$(selector);
        if (elemento) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

export async function iniciarSesionInteractivaWeb(servicio, url) {
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.servicio === servicio) {
      return {
        sessionId,
        servicio: session.servicio,
        url: session.url,
        iniciadaEn: session.iniciadaEn,
        display: process.env.DISPLAY || ':99',
        reutilizada: true
      };
    }
  }

  const { browser, context, page } = await crearNavegadorConSesion(false);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const sessionId = `${servicio}-${Date.now()}`;
  const data = {
    sessionId,
    servicio,
    url,
    browser,
    context,
    page,
    iniciadaEn: new Date().toISOString()
  };

  activeSessions.set(sessionId, data);

  browser.on('disconnected', () => {
    activeSessions.delete(sessionId);
  });

  return {
    sessionId,
    servicio,
    url,
    iniciadaEn: data.iniciadaEn,
    display: process.env.DISPLAY || ':99',
    reutilizada: false
  };
}

export async function finalizarSesionInteractivaWeb(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Sesion interactiva no encontrada o ya cerrada.');
  }

  await guardarSesion(session.context);
  await session.browser.close();
  activeSessions.delete(sessionId);

  return {
    ok: true,
    sessionId,
    servicio: session.servicio,
    guardadaEn: new Date().toISOString()
  };
}

export async function cancelarSesionInteractivaWeb(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Sesion interactiva no encontrada o ya cerrada.');
  }

  await session.browser.close();
  activeSessions.delete(sessionId);

  return {
    ok: true,
    sessionId,
    servicio: session.servicio,
    canceladaEn: new Date().toISOString()
  };
}

export function getEstadoAutenticacion() {
  const metadata = getSesionMetadata();
  const sesionesActivas = Array.from(activeSessions.values()).map((s) => ({
    sessionId: s.sessionId,
    servicio: s.servicio,
    url: s.url,
    iniciadaEn: s.iniciadaEn
  }));

  return {
    tieneSesionGuardada: fs.existsSync(STORAGE_STATE_FILE),
    metadata,
    sesionesActivas,
    display: process.env.DISPLAY || ':99'
  };
}

export async function autenticacionInteractiva(servicio, url) {
  const { browser, context, page } = await crearNavegadorConSesion(false);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log(`\nLogin manual requerido para ${servicio}.`);
  console.log('Completa el login en el navegador y presiona ENTER aqui para guardar la sesion.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('Presiona ENTER para guardar sesion: ', () => resolve()));
  rl.close();

  await guardarSesion(context);
  await browser.close();
}

export function limpiarSesiones() {
  if (fs.existsSync(STORAGE_STATE_FILE)) {
    fs.unlinkSync(STORAGE_STATE_FILE);
  }

  if (fs.existsSync(BROWSER_STATE_FILE)) {
    fs.unlinkSync(BROWSER_STATE_FILE);
  }
}

export function tieneSesionGuardada() {
  return fs.existsSync(STORAGE_STATE_FILE);
}

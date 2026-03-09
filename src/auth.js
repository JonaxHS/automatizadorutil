import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Gestiona la autenticación y persistencia de sesiones del navegador
 */

const AUTH_DIR = path.join(process.cwd(), '.auth');
const BROWSER_STATE_FILE = path.join(AUTH_DIR, 'browser-state.json');

/**
 * Crea el navegador con contexto persistente
 * @param {boolean} headless - Si debe ejecutarse en modo headless
 * @returns {Promise<{browser, context, page}>}
 */
export async function crearNavegadorConSesion(headless = false) {
  // Crear directorio de autenticación si no existe
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
  
  const browser = await chromium.launch({
    headless: headless,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  let context;
  
  // Intentar cargar estado del navegador guardado
  const storageStatePath = path.join(AUTH_DIR, 'storage-state.json');
  
  if (fs.existsSync(storageStatePath)) {
    console.log('📂 Cargando sesión guardada...');
    try {
      context = await browser.newContext({
        viewport: null,
        storageState: storageStatePath
      });
    } catch (error) {
      console.log('⚠️  No se pudo cargar la sesión guardada, creando nueva...');
      context = await browser.newContext({ viewport: null });
    }
  } else {
    console.log('🆕 Creando nueva sesión del navegador...');
    context = await browser.newContext({ viewport: null });
  }
  
  const page = await context.newPage();
  
  return { browser, context, page };
}

/**
 * Guarda el estado del navegador para reutilizarlo
 * @param {BrowserContext} context - Contexto del navegador
 */
export async function guardarSesion(context) {
  const storageStatePath = path.join(AUTH_DIR, 'storage-state.json');
  
  try {
    await context.storageState({ path: storageStatePath });
    console.log('💾 Sesión guardada exitosamente');
    
    // Guardar metadatos
    const metadata = {
      fecha: new Date().toISOString(),
      mensaje: 'Sesión del navegador guardada'
    };
    
    fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('❌ Error al guardar sesión:', error.message);
  }
}

/**
 * Verifica si el usuario está autenticado en un sitio
 * @param {Page} page - Página de Playwright
 * @param {string} url - URL del sitio
 * @param {Array<string>} indicadoresAutenticacion - Selectores que indican que está logueado
 * @returns {Promise<boolean>}
 */
export async function estaAutenticado(page, url, indicadoresAutenticacion) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Verificar si existe algún indicador de autenticación
    for (const selector of indicadoresAutenticacion) {
      try {
        const elemento = await page.$(selector);
        if (elemento) {
          console.log(`✅ Usuario autenticado (encontrado: ${selector})`);
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Proceso interactivo de autenticación (primera vez)
 * @param {string} servicio - Nombre del servicio (Qwen/Veed)
 * @param {string} url - URL para autenticación
 * @returns {Promise<{browser, context, page}>}
 */
export async function autenticacionInteractiva(servicio, url) {
  console.log('');
  console.log('═'.repeat(60));
  console.log(`🔐 Configuración de Autenticación: ${servicio}`);
  console.log('═'.repeat(60));
  console.log('');
  console.log('Abriremos el navegador para que inicies sesión manualmente.');
  console.log('');
  console.log('📋 INSTRUCCIONES:');
  console.log('  1. Se abrirá una ventana del navegador');
  console.log('  2. Inicia sesión con tu cuenta de Google');
  console.log('  3. Espera a estar completamente autenticado');
  console.log('  4. Cierra el navegador cuando termines');
  console.log('');
  console.log('💾 Tu sesión se guardará para futuros usos automáticos.');
  console.log('');
  
  const { browser, context, page } = await crearNavegadorConSesion(false);
  
  await page.goto(url, { waitUntil: 'networkidle' });
  
  console.log('🌐 Navegador abierto. Inicia sesión y cierra cuando termines...');
  console.log('');
  
  // Esperar a que el usuario cierre el navegador
  await new Promise((resolve) => {
    browser.on('disconnected', resolve);
  });
  
  // Guardar sesión antes de cerrar
  await guardarSesion(context);
  
  console.log('✅ Sesión configurada correctamente');
  console.log('');
  
  return { browser, context, page };
}

/**
 * Limpia las sesiones guardadas
 */
export function limpiarSesiones() {
  const storageStatePath = path.join(AUTH_DIR, 'storage-state.json');
  
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('🗑️  Sesiones eliminadas');
  }
  
  if (fs.existsSync(BROWSER_STATE_FILE)) {
    fs.unlinkSync(BROWSER_STATE_FILE);
  }
}

/**
 * Verifica si hay sesiones guardadas
 * @returns {boolean}
 */
export function tieneSesionGuardada() {
  const storageStatePath = path.join(AUTH_DIR, 'storage-state.json');
  return fs.existsSync(storageStatePath);
}

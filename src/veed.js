import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado } from './auth.js';

/**
 * Genera un video en Veed.io usando el guion proporcionado
 * @param {string} guion - Guion del video
 * @returns {Promise<string>} - URL o estado del video generado
 */
export async function generarVideo(guion) {
  console.log('🎬 Iniciando generación de video en Veed.io...');
  
  // Crear navegador con sesión persistente
  const { browser, context, page } = await crearNavegadorConSesion(config.headless);
  
  try {
    // Navegar a Veed.io
    console.log(`📍 Navegando a ${config.veedUrl}...`);
    await page.goto(config.veedUrl, { 
      waitUntil: 'networkidle',
      timeout: config.timeouts.navigation 
    });
    
    // Verificar autenticación
    const indicadoresAuth = [
      '[aria-label*="user"]',
      '[aria-label*="account"]',
      '[data-testid*="user"]',
      '.user-avatar',
      'button[aria-label*="Profile"]',
      'img[alt*="avatar"]',
      '[class*="avatar"]'
    ];
    
    await page.waitForTimeout(2000);
    
    const autenticado = await estaAutenticado(page, config.veedUrl, indicadoresAuth);
    
    if (!autenticado) {
      console.log('⚠️  No se detectó sesión activa en Veed.io.');
      console.log('💡 Ejecuta primero: npm run setup-auth');
      throw new Error('No autenticado en Veed.io. Ejecuta "npm run setup-auth" primero.');
    }
    
    // Esperar en la página principal
    await page.waitForTimeout(2000);
    
    console.log('🔍 Buscando generador de IA...');
    
    // Buscar enlaces/botones relacionados con AI o generación de videos
    const aiSelectors = [
      'text=/.*AI.*video.*/i',
      'text=/.*video.*AI.*/i',
      'text=/.*generate.*video.*/i',
      'a:has-text("AI")',
      'button:has-text("AI")',
      'a[href*="ai"]',
      'a[href*="generate"]',
      '[aria-label*="AI"]'
    ];
    
    let aiLink = null;
    for (const selector of aiSelectors) {
      try {
        aiLink = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (aiLink) {
          console.log(`✅ Encontrado enlace AI: ${selector}`);
          await aiLink.click();
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!aiLink) {
      // Intentar navegar directamente a la ruta de AI
      const aiPaths = [
        '/ai-video-generator',
        '/ai/video',
        '/ai',
        '/tools/ai-video-generator',
        '/create/ai'
      ];
      
      for (const path of aiPaths) {
        try { (ya no debería ser necesario con sesión persistente)
    const loginButtons = await page.$$('text=/.*sign in.*/i, text=/.*log in.*/i, text=/.*login.*/i');
    
    if (loginButtons.length > 0) {
      console.log('⚠️  Se detectó que se requiere login. La sesión guardada puede haber expirado.');
      console.log('💡 Ejecuta: npm run setup-auth');
      throw new Error('Sesión expirada. Re-ejecuta "npm run setup-auth".'$$('text=/.*sign in.*/i, text=/.*log in.*/i, text=/.*login.*/i');
    
    if (loginButtons.length > 0 && config.veed.email && config.veed.password) {
      console.log('🔐 Iniciando sesión...');
      
      // Click en botón de login
      await loginButtons[0].click();
      await page.waitForTimeout(2000);
      
      // Llenar credenciales
      const emailInput = await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 5000 });
      await emailInput.fill(config.veed.email);
      
      const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 5000 });
      await passwordInput.fill(config.veed.password);
      
      // Click en botón de submit
      const submitButton = await page.waitForSelector('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
      await submitButton.click();
      
      console.log('✅ Sesión iniciada');
      await page.waitForTimeout(3000);
    }
    
    // Buscar el campo para pegar el guion
    console.log('📝 Buscando campo de texto para el guion...');
    
    const textareaSelectors = [
      'textarea[placeholder*="script"]',
      'textarea[placeholder*="text"]',
      'textarea[placeholder*="describe"]',
      'textarea[placeholder*="prompt"]',
      'textarea',
      '.editor textarea',
      '[contenteditable="true"]'
    ];
    
    let scriptInput = null;
    for (const selector of textareaSelectors) {
      try {
        scriptInput = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (scriptInput) {
          console.log(`✅ Campo de texto encontrado: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!scriptInput) {
      await page.screenshot({ path: 'screenshots/veed-no-input.png' });
      throw new Error('No se pudo encontrar el campo para el guion. Revisa screenshots/veed-no-input.png');
    }
    
    // Pegar el guion
    console.log('✍️  Pegando guion en el generador...');
    await scriptInput.fill(guion);
    await page.waitForTimeout(1000);
    
    // Buscar el botón de generar
    console.log('🎬 Buscando botón de generar video...');
    
    const generateButtons = [
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("Generar")',
      'button:has-text("Crear")',
      'button[type="submit"]',
      'button:has-text("Start")',
      'button:has-text("Make")'
    ];
    
    let generateButton = null;
    for (const selector of generateButtons) {
      try {
        generateButton = await page.$(selector);
        if (generateButton) {
          const isVisible = await generateButton.isVisible();
          const isEnabled = await generateButton.isEnabled();
          
          if (isVisible && isEnabled) {
            console.log(`✅ Botón de generar encontrado: ${selector}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!generateButton) {
      await page.screenshot({ path: 'screenshots/veed-no-button.png' });
      throw new Error('No se pudo encontrar el botón de generar. Revisa screenshots/veed-no-button.png');
    }
    
    // Click en generar
    console.log('🚀 Generando video...');
    await generateButton.click();
    
    // Esperar a que el video se genere
    console.log('⏳ Esperando generación del video (esto puede tardar varios minutos)...');
    
    // Buscar indicadores de progreso o finalización
    let videoGenerado = false;
    let tiempoEsperado = 0;
    const maxTiempoEspera = config.timeouts.generation; // 3 minutos por defecto
    
    while (tiempoEsperado < maxTiempoEspera) {
      // Verificar si hay mensajes de éxito, preview del video, o opciones de descarga
      const successIndicators = await page.$$('text=/.*success.*/i, text=/.*complete.*/i, text=/.*done.*/i, video, .video-player, [class*="preview"]');
      
      if (successIndicators.length > 0) {
        videoGenerado = true;
        console.log('✅ Video generado exitosamente');
        break;
      }
      
      // Verificar si hay errores
      const errorIndicators = await page.$$('text=/.*error.*/i, text=/.*failed.*/i, .error');
      if (errorIndicators.length > 0) {
        const errorText = await errorIndicators[0].innerText();
        throw new Error(`Error en la generación: ${errorText}`);
      }
      
      await page.waitForTimeout(5000); // Esperar 5 segundos
      tiempoEsperado += 5000;
      
      if (tiempoEsperado % 30000 === 0) { // Cada 30 segundos
        console.log(`⏳ Esperando... (${tiempoEsperado / 1000}s / ${maxTiempoEspera / 1000}s)`);
      }
    }
    
    if (!videoGenerado) {
      await page.screenshot({ path: 'screenshots/veed-timeout.png' });
      console.log('⚠️  Timeout alcanzado. El video puede seguir generándose en segundo plano.');
    }
    
    // Tomar screenshot final
    await page.screenshot({ path: 'screenshots/veed-final.png', fullPage: true });
    console.log('📸 Screenshot guardado en screenshots/veed-final.png');
    
    // Obtener la URL actual
    const finalUrl = page.url();
    console.log('🔗 URL del proyecto:', finalUrl);
    
    // Mantener el navegador abierto si no está en modo headless
    if (!config.headless) {
      console.log('🌐 Navegador permanece abierto para que puedas revisar el resultado.');
      console.log('💡 Presiona Ctrl+C cuando termines.');
      
      // Esperar indefinidamente
      await new Promise(() => {});
    }
    
    return finalUrl;
    
  } catch (error) {
    console.error('❌ Error al generar video:', error.message);
    await page.screenshot({ path: 'screenshots/veed-error.png' });
    throw error;
  } finally {
    if Guardar sesión actualizada
    await guardarSesion(context);
    
    // (config.headless) {
      await browser.close();
    }
  }
}

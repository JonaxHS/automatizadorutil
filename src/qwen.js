import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado } from './auth.js';

/**
 * Genera un guion usando Qwen AI
 * @param {string} tema - Tema del video
 * @returns {Promise<string>} - Guion generado
 */
export async function generarGuion(tema) {
  console.log('🤖 Iniciando generación de guion con Qwen AI...');
  
  // Crear navegador con sesión persistente
  const { browser, context, page } = await crearNavegadorConSesion(config.headless);
  
  try {
    // Navegar directamente al chat específico de Qwen AI
    console.log(`📍 Navegando al chat de Qwen AI...`);
    await page.goto(config.qwenChatUrl, { 
      waitUntil: 'networkidle',
      timeout: config.timeouts.navigation 
    });
        // Verificar autenticación
    const indicadoresAuth = [
      '[aria-label*="user"]',
      '[data-testid*="user"]',
      '.user-menu',
      'button[aria-label*="Account"]',
      'img[alt*="profile"]'
    ];
    
    const autenticado = await estaAutenticado(page, config.qwenChatUrl, indicadoresAuth);
    
    if (!autenticado) {
      console.log('⚠️  No se detectó sesión activa.');
      console.log('💡 Ejecuta primero: npm run setup-auth');
      throw new Error('No autenticado en Qwen AI. Ejecuta "npm run setup-auth" primero.');
    }
        // Esperar a que cargue la interfaz de chat
    console.log('⏳ Esperando interfaz de chat...');
    
    // Intentar diferentes selectores comunes para campos de chat
    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Type"]',
      'textarea',
      'input[type="text"]',
      '.chat-input',
      '#chat-input'
    ];
    
    let chatInput = null;
    for (const selector of selectors) {
      try {
        chatInput = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (chatInput) {
          console.log(`✅ Campo de chat encontrado: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!chatInput) {
      throw new Error('No se pudo encontrar el campo de entrada del chat');
    }
    
    // Crear el prompt para el guion
    const prompt = `Crea un guion de video de aproximadamente ${config.video.duracion} segundos sobre: ${tema}

El guion debe:
- Ser atractivo y fácil de entender
- Tener un inicio impactante
- Incluir información valiosa
- Terminar con una conclusión clara
- Estar escrito en un tono conversacional

Por favor, proporciona solo el guion sin explicaciones adicionales.`;
    
    console.log('✍️  Escribiendo prompt en el chat...');
    await chatInput.fill(prompt);
    
    // Buscar y hacer click en el botón de enviar
    const sendButtons = [
      'button[type="submit"]',
      'button:has-text("Send")',
      'button:has-text("Enviar")',
      'button:has-text("发送")',
      '[aria-label*="Send"]',
      '[aria-label*="submit"]'
    ];
    
    let sent = false;
    for (const selector of sendButtons) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          console.log('📤 Mensaje enviado');
          sent = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!sent) {
      // Intentar presionar Enter como alternativa
      await chatInput.press('Enter');
      console.log('📤 Mensaje enviado con Enter');
    }
    
    // Esperar la respuesta
    console.log('⏳ Esperando respuesta de Qwen AI...');
    await page.waitForTimeout(3000); // Esperar a que comience a generar
    
    // Esperar a que termine de generar (buscar indicadores de que terminó)
    let guion = '';
    let intentos = 0;
    const maxIntentos = 60; // 60 segundos máximo
    
    while (intentos < maxIntentos) {
      try {
        // Intentar obtener el último mensaje del asistente
        const mensajes = await page.$$('.message, .chat-message, [class*="message"], [class*="response"]');
        
        if (mensajes.length > 0) {
          const ultimoMensaje = mensajes[mensajes.length - 1];
          const texto = await ultimoMensaje.innerText();
          
          if (texto && texto.length > 50) { // Si tiene contenido sustancial
            guion = texto;
            
            // Verificar si hay un indicador de que terminó de generar
            const isGenerating = await page.$('[class*="generating"], [class*="typing"], .loading');
            
            if (!isGenerating) {
              break;
            }
          }
        }
      } catch (e) {
        // Continuar esperando
    // Guardar sesión actualizada
    await guardarSesion(context);
    
      }
      
      await page.waitForTimeout(1000);
      intentos++;
    }
    
    if (!guion) {
      // Si no se pudo extraer automáticamente, tomar screenshot para debugging
      await page.screenshot({ path: 'screenshots/qwen-error.png' });
      throw new Error('No se pudo extraer el guion generado. Revisa screenshots/qwen-error.png');
    }
    
    console.log('✅ Guion generado exitosamente');
    console.log('📝 Primeros 100 caracteres:', guion.substring(0, 100) + '...');
    
    return guion;
    
  } catch (error) {
    console.error('❌ Error al generar guion:', error.message);
    await page.screenshot({ path: 'screenshots/qwen-error.png' });
    throw error;
  } finally {
    await browser.close();
  }
}

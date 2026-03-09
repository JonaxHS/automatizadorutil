import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado } from './auth.js';

/**
 * Genera un guion usando Qwen AI.
 * @param {string} tema
 * @returns {Promise<string>}
 */
export async function generarGuion(tema) {
  console.log('Iniciando generacion de guion con Qwen AI...');

  const { browser, context, page } = await crearNavegadorConSesion(config.headless);

  try {
    await page.goto(config.qwenChatUrl, {
      waitUntil: 'networkidle',
      timeout: config.timeouts.navigation
    });

    const indicadoresAuth = [
      '[aria-label*="user"]',
      '[data-testid*="user"]',
      '.user-menu',
      'button[aria-label*="Account"]',
      'img[alt*="profile"]'
    ];

    const autenticado = await estaAutenticado(page, config.qwenChatUrl, indicadoresAuth);
    if (!autenticado) {
      throw new Error('No autenticado en Qwen AI. Inicia sesion desde la interfaz o ejecuta npm run setup-auth.');
    }

    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea',
      'input[type="text"]',
      '.chat-input',
      '[contenteditable="true"]'
    ];

    let chatInput = null;
    for (const selector of selectors) {
      try {
        chatInput = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (chatInput) {
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!chatInput) {
      throw new Error('No se encontro el campo de entrada del chat en Qwen.');
    }

    const prompt = `Crea un guion de video de aproximadamente ${config.video.duracion} segundos sobre: ${tema}

El guion debe:
- Ser atractivo y facil de entender
- Tener un inicio impactante
- Incluir informacion valiosa
- Terminar con un llamado a la accion

Solo proporciona el texto del guion, sin explicaciones adicionales.`;

    await chatInput.fill(prompt);

    const sendButtons = [
      'button[type="submit"]',
      'button:has-text("Send")',
      'button:has-text("Enviar")',
      '[aria-label*="Send"]',
      '[aria-label*="submit"]'
    ];

    let sent = false;
    for (const selector of sendButtons) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 3000 });
        if (button) {
          await button.click();
          sent = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!sent) {
      await chatInput.press('Enter');
    }

    await page.waitForTimeout(3000);

    let guion = '';
    let intentos = 0;
    const maxIntentos = 60;

    while (intentos < maxIntentos) {
      try {
        const mensajes = await page.$$('.message, [class*="message"], [data-testid*="message"]');
        if (mensajes.length > 0) {
          const ultimoMensaje = mensajes[mensajes.length - 1];
          const texto = await ultimoMensaje.innerText();

          if (texto && texto.length > 50) {
            guion = texto;
            console.log('Guion capturado exitosamente');

            const isGenerating = await page.$('[aria-label*="generating"], [class*="generating"]');
            if (!isGenerating) {
              break;
            }
          }
        }
      } catch (error) {
        // continuar esperando
      }

      await page.waitForTimeout(1000);
      intentos += 1;
    }

    if (!guion) {
      await page.screenshot({ path: 'screenshots/qwen-error.png' });
      throw new Error('No se pudo extraer el guion de Qwen AI');
    }

    console.log('Guion generado correctamente');
    return guion;

  } catch (error) {
    console.error('Error al generar guion:', error.message);
    await page.screenshot({ path: 'screenshots/qwen-error.png' });
    throw error;
  } finally {
    try {
      await guardarSesion(context);
    } catch (error) {
      console.error('No se pudo guardar sesion de Qwen:', error.message);
    }

    await browser.close();
  }
}

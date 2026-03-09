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

    // Tomar screenshot inicial para debug
    await page.screenshot({ path: 'screenshots/qwen-1-inicial.png', fullPage: true });

    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="问"]',
      'textarea[data-testid*="input"]',
      'textarea[class*="input"]',
      'textarea',
      'input[type="text"]',
      '.chat-input',
      '[contenteditable="true"]',
      '#chat-input'
    ];

    let chatInput = null;
    for (const selector of selectors) {
      try {
        chatInput = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (chatInput) {
          console.log(`Campo de entrada encontrado con selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!chatInput) {
      await page.screenshot({ path: 'screenshots/qwen-error-no-input.png', fullPage: true });
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
    await page.screenshot({ path: 'screenshots/qwen-2-prompt-filled.png', fullPage: true });

    const sendButtons = [
      'button[type="submit"]',
      'button[aria-label*="send"]',
      'button[aria-label*="Send"]',
      'button:has-text("Send")',
      'button:has-text("Enviar")',
      'button:has-text("发送")',
      '[aria-label*="Send"]',
      '[aria-label*="submit"]',
      '[data-testid*="send"]'
    ];

    let sent = false;
    for (const selector of sendButtons) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 3000 });
        if (button) {
          await button.click();
          console.log(`Mensaje enviado con selector: ${selector}`);
          sent = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!sent) {
      console.log('No se encontró botón de envío, usando Enter');
      await chatInput.press('Enter');
    }

    await page.screenshot({ path: 'screenshots/qwen-3-message-sent.png', fullPage: true });
    await page.waitForTimeout(5000);

    let guion = '';
    let intentos = 0;
    const maxIntentos = 60;

    while (intentos < maxIntentos) {
      try {
        // Intentar esperar a que aparezca contenido de respuesta
        await page.waitForTimeout(2000);
        
        // Buscar mensajes del asistente (varios selectores para diferentes versiones de Qwen)
        const respuesta = await page.evaluate(() => {
          // Buscar por diferentes patrones
          const selectores = [
            '[class*="AssistantMessage"]',
            '[data-role="assistant"]',
            '[class*="markdown-body"]',
            'div[class*="message"][class*="assistant"]',
            'div[class*="answer"]',
            'div[class*="response"][class*="ai"]'
          ];
          
          for (const selector of selectores) {
            const elementos = document.querySelectorAll(selector);
            if (elementos.length > 0) {
              const ultimo = elementos[elementos.length - 1];
              const texto = ultimo.innerText || ultimo.textContent;
              if (texto && texto.trim().length > 50) {
                return { texto: texto.trim(), selector };
              }
            }
          }
          
          // Si no funciona, buscar el div más grande con texto después del prompt del usuario
          const todos = Array.from(document.querySelectorAll('div'));
          const conTexto = todos
            .filter(div => {
              const texto = div.innerText || div.textContent;
              return texto && texto.trim().length > 100 && texto.trim().length < 10000;
            })
            .sort((a, b) => {
              const textoA = (a.innerText || a.textContent || '').trim();
              const textoB = (b.innerText || b.textContent || '').trim();
              return textoB.length - textoA.length;
            });
          
          if (conTexto.length > 0) {
            const texto = (conTexto[0].innerText || conTexto[0].textContent).trim();
            return { texto, selector: 'div-grande' };
          }
          
          return null;
        });

        if (respuesta && respuesta.texto) {
          guion = respuesta.texto;
          console.log(`Guion capturado con selector '${respuesta.selector}': ${respuesta.texto.substring(0, 150)}...`);
          console.log(`Longitud del guion: ${guion.length} caracteres`);

          // Verificar si sigue generando
          const isGenerating = await page.$('[aria-label*="generating"], [class*="generating"], [class*="typing"], [class*="loading"]');
          if (!isGenerating && guion.length > 100) {
            console.log('Generación completada');
            await page.screenshot({ path: 'screenshots/qwen-respuesta-capturada.png', fullPage: true });
            break;
          } else if (isGenerating) {
            console.log('Aún generando, esperando...');
          }
        } else {
          console.log(`Intento ${intentos + 1}: No se encontró respuesta válida`);
        }
      } catch (error) {
        console.log(`Error en intento ${intentos + 1}: ${error.message}`);
      }

      await page.waitForTimeout(2000);
      intentos += 1;
    }

    if (!guion) {
      await page.screenshot({ path: 'screenshots/qwen-error-no-response.png', fullPage: true });
      
      // Debug: intentar capturar cualquier texto visible
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Texto de página completo (primeros 500 chars):', bodyText.substring(0, 500));
      
      throw new Error('No se pudo extraer el guion de Qwen AI');
    }

    console.log('Guion generado correctamente');
    await page.screenshot({ path: 'screenshots/qwen-4-success.png', fullPage: true });
    return guion;

  } catch (error) {
    console.error('Error al generar guion:', error.message);
    await page.screenshot({ path: 'screenshots/qwen-error-final.png', fullPage: true });
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

import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado } from './auth.js';

/**
 * Genera un video en Veed.io usando el guion proporcionado.
 * @param {string} guion
 * @returns {Promise<string>}
 */
export async function generarVideo(guion) {
  console.log('Iniciando generacion de video en Veed.io...');

  const { browser, context, page } = await crearNavegadorConSesion(config.headless);

  try {
    console.log(`Navegando a ${config.veedUrl}...`);
    await page.goto(config.veedUrl, {
      waitUntil: 'networkidle',
      timeout: config.timeouts.navigation
    });

    const indicadoresAuth = [
      '[aria-label*="user"]',
      '[aria-label*="account"]',
      '[data-testid*="user"]',
      '.user-avatar',
      'button[aria-label*="Profile"]',
      'img[alt*="avatar"]',
      '[class*="avatar"]'
    ];

    const autenticado = await estaAutenticado(page, config.veedUrl, indicadoresAuth);
    if (!autenticado) {
      throw new Error('No autenticado en Veed.io. Inicia sesion desde la interfaz o ejecuta npm run setup-auth.');
    }

    await page.waitForTimeout(2000);

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
          await aiLink.click();
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!aiLink) {
      const aiPaths = ['/ai-video-generator', '/ai/video', '/ai', '/tools/ai-video-generator', '/create/ai'];
      for (const path of aiPaths) {
        try {
          await page.goto(`${config.veedUrl}${path}`, {
            waitUntil: 'networkidle',
            timeout: 10000
          });

          const hasContent = await page.$('textarea, input[type="text"], .editor, [contenteditable="true"]');
          if (hasContent) {
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    await page.waitForTimeout(3000);

    const loginButtons = await page.$$('text=/.*sign in.*/i, text=/.*log in.*/i, text=/.*login.*/i');
    if (loginButtons.length > 0) {
      throw new Error('Sesion expirada en Veed.io. Inicia sesion nuevamente desde la interfaz web.');
    }

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
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!scriptInput) {
      await page.screenshot({ path: 'screenshots/veed-no-input.png' });
      throw new Error('No se encontro el campo para pegar el guion.');
    }

    await scriptInput.fill(guion);
    await page.waitForTimeout(1000);

    const generateButtons = [
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("Generar")',
      'button:has-text("Crear")',
      'button[type="submit"]',
      '[aria-label*="generate"]',
      '[aria-label*="create"]'
    ];

    let generateButton = null;
    for (const selector of generateButtons) {
      try {
        const btn = await page.waitForSelector(selector, { timeout: 3000 });
        if (btn) {
          const isVisible = await btn.isVisible();
          const isEnabled = await btn.isEnabled();
          if (isVisible && isEnabled) {
            generateButton = btn;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (!generateButton) {
      await page.screenshot({ path: 'screenshots/veed-no-button.png' });
      throw new Error('No se encontro el boton para generar video.');
    }

    await generateButton.click();

    let videoGenerado = false;
    let tiempoEsperado = 0;
    const maxTiempoEspera = config.timeouts.generation;

    while (tiempoEsperado < maxTiempoEspera) {
      const successIndicators = await page.$$('text=/.*success.*/i, text=/.*complete.*/i, text=/.*done.*/i, video, .video-player, [class*="preview"]');
      if (successIndicators.length > 0) {
        videoGenerado = true;
        break;
      }

      const errorIndicators = await page.$$('text=/.*error.*/i, text=/.*failed.*/i, .error');
      if (errorIndicators.length > 0) {
        const errorText = await errorIndicators[0].innerText();
        throw new Error(`Error en la generacion: ${errorText}`);
      }

      await page.waitForTimeout(5000);
      tiempoEsperado += 5000;
    }

    if (!videoGenerado) {
      await page.screenshot({ path: 'screenshots/veed-timeout.png' });
    }

    await page.screenshot({ path: 'screenshots/veed-final.png', fullPage: true });

    const finalUrl = page.url();
    console.log('URL del proyecto:', finalUrl);

    return finalUrl;
  } catch (error) {
    console.error('Error al generar video:', error.message);
    await page.screenshot({ path: 'screenshots/veed-error.png' });
    throw error;
  } finally {
    try {
      await guardarSesion(context);
    } catch (error) {
      console.error('No se pudo guardar sesion de Veed:', error.message);
    }

    await browser.close();
  }
}

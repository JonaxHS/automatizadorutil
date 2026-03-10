import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado } from './auth.js';

/**
 * Genera un video en Veed.io AI Studio usando el guion proporcionado.
 * @param {string} guion
 * @returns {Promise<string>}
 */
export async function generarVideo(guion) {
  console.log('Iniciando generacion de video en Veed.io AI Studio...');

  const { browser, context, page } = await crearNavegadorConSesion(config.headless);

  try {
    // Navegar directamente a AI Studio
    const aiStudioUrl = 'https://www.veed.io/ai-studio';
    console.log(`Navegando a ${aiStudioUrl}...`);
    
    // Intentar navegación con estrategia más tolerante
    try {
      await page.goto(aiStudioUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
    } catch (error) {
      console.log('Primera navegación falló, reintentando con load...');
      await page.goto(aiStudioUrl, {
        waitUntil: 'load',
        timeout: 90000
      });
    }
    
    // Esperar a que la página esté lista
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'screenshots/veed-1-ai-studio.png', fullPage: true });

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

    const autenticado = await estaAutenticado(page, aiStudioUrl, indicadoresAuth);
    if (!autenticado) {
      throw new Error('No autenticado en Veed.io. Inicia sesion desde la interfaz o ejecuta npm run setup-auth.');
    }

    await page.waitForTimeout(2000);

    // Buscar el campo de texto para pegar el guion
    console.log('Buscando campo de texto para el guion...');
    const textareaSelectors = [
      'textarea[placeholder*="script"]',
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="text"]',
      'textarea[placeholder*="describe"]',
      'textarea',
      '[contenteditable="true"]',
      'input[type="text"]'
    ];

    let scriptInput = null;
    for (const selector of textareaSelectors) {
      try {
        scriptInput = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (scriptInput) {
          console.log(`Campo encontrado con selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!scriptInput) {
      await page.screenshot({ path: 'screenshots/veed-no-input.png', fullPage: true });
      throw new Error('No se encontro el campo para pegar el guion en AI Studio.');
    }

    // Pegar el guion
    console.log('Pegando guion en el campo de texto...');
    await scriptInput.click();
    await page.waitForTimeout(500);
    await scriptInput.fill(guion);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/veed-2-guion-pegado.png', fullPage: true });

    // Buscar y hacer clic en el botón "Generate"
    console.log('Buscando boton Generate...');
    const generateSelectors = [
      'button:has-text("Generate")',
      'button:has-text("generate")',
      'button:has-text("GENERATE")',
      'button[type="submit"]',
      'button:has-text("Generar")',
      '[aria-label*="generate"]'
    ];

    let generateButton = null;
    for (const selector of generateSelectors) {
      try {
        generateButton = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (generateButton) {
          const isEnabled = await generateButton.isEnabled();
          if (isEnabled) {
            console.log(`Boton Generate encontrado con selector: ${selector}`);
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (!generateButton) {
      await page.screenshot({ path: 'screenshots/veed-no-generate-button.png', fullPage: true });
      throw new Error('No se encontro el boton Generate.');
    }

    await generateButton.click();
    console.log('Boton Generate clickeado, esperando generacion...');
    await page.screenshot({ path: 'screenshots/veed-3-generate-clicked.png', fullPage: true });

    // Esperar hasta 5 minutos para que aparezcan las opciones
    console.log('Esperando opciones de configuracion (hasta 5 minutos)...');
    let opcionesEncontradas = false;
    let tiempoEsperado = 0;
    const maxTiempoGeneracion = 300000; // 5 minutos

    while (tiempoEsperado < maxTiempoGeneracion) {
      // Buscar indicadores de que aparecieron las opciones
      const opcionSelectors = [
        'text=/.*solo voz.*/i',
        'text=/.*voice only.*/i',
        'text=/.*spanish.*/i',
        'text=/.*español.*/i',
        'text=/.*idioma.*/i',
        'text=/.*language.*/i',
        'text=/.*alex.*/i',
        'text=/.*carolina.*/i'
      ];

      for (const selector of opcionSelectors) {
        try {
          const elemento = await page.$(selector);
          if (elemento) {
            opcionesEncontradas = true;
            console.log('Opciones de configuracion encontradas!');
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (opcionesEncontradas) break;

      // Verificar si hay errores
      const errorIndicators = await page.$$('text=/.*error.*/i, text=/.*failed.*/i, .error');
      if (errorIndicators.length > 0) {
        const errorText = await errorIndicators[0].innerText();
        await page.screenshot({ path: 'screenshots/veed-error-generacion.png', fullPage: true });
        throw new Error(`Error en la generacion: ${errorText}`);
      }

      await page.waitForTimeout(5000);
      tiempoEsperado += 5000;
      
      if (tiempoEsperado % 30000 === 0) {
        console.log(`Esperando... ${tiempoEsperado / 1000}s de ${maxTiempoGeneracion / 1000}s`);
        await page.screenshot({ path: `screenshots/veed-esperando-${tiempoEsperado / 1000}s.png`, fullPage: true });
      }
    }

    if (!opcionesEncontradas) {
      await page.screenshot({ path: 'screenshots/veed-timeout-opciones.png', fullPage: true });
      throw new Error('Timeout esperando las opciones de configuracion.');
    }

    await page.screenshot({ path: 'screenshots/veed-4-opciones-aparecieron.png', fullPage: true });

    // Seleccionar "solo voz" (voice only)
    console.log('Seleccionando opcion "solo voz"...');
    const soloVozSelectors = [
      'text=/.*solo voz.*/i',
      'text=/.*voice only.*/i',
      'button:has-text("solo voz")',
      'button:has-text("Voice only")'
    ];

    let soloVozButton = null;
    for (const selector of soloVozSelectors) {
      try {
        soloVozButton = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (soloVozButton) {
          await soloVozButton.click();
          console.log('Opcion "solo voz" seleccionada');
          await page.waitForTimeout(1000);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    await page.screenshot({ path: 'screenshots/veed-5-solo-voz.png', fullPage: true });

    // Seleccionar idioma español
    console.log('Seleccionando idioma Spanish...');
    const spanishSelectors = [
      'text=/.*spanish.*/i',
      'text=/.*español.*/i',
      'select option:has-text("Spanish")',
      '[value*="spanish"]',
      '[value*="es"]'
    ];

    for (const selector of spanishSelectors) {
      try {
        const spanishOption = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (spanishOption) {
          await spanishOption.click();
          console.log('Idioma Spanish seleccionado');
          await page.waitForTimeout(1000);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    await page.screenshot({ path: 'screenshots/veed-6-spanish.png', fullPage: true });

    // Seleccionar voz Alex o Carolina
    console.log('Seleccionando voz (Alex o Carolina)...');
    const voiceSelectors = [
      'text=/.*alex.*/i',
      'text=/.*carolina.*/i',
      'button:has-text("Alex")',
      'button:has-text("Carolina")'
    ];

    let voiceSelected = false;
    for (const selector of voiceSelectors) {
      try {
        const voiceButton = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (voiceButton) {
          await voiceButton.click();
          const voiceName = await voiceButton.innerText();
          console.log(`Voz seleccionada: ${voiceName}`);
          await page.waitForTimeout(1000);
          voiceSelected = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!voiceSelected) {
      console.log('No se pudo seleccionar voz especifica, continuando...');
    }

    await page.screenshot({ path: 'screenshots/veed-7-voz.png', fullPage: true });

    // Seleccionar subtítulos "boba"
    console.log('Seleccionando subtitulos "boba"...');
    const subtitulosSelectors = [
      'text=/.*boba.*/i',
      'button:has-text("boba")',
      'button:has-text("Boba")',
      '[value*="boba"]'
    ];

    for (const selector of subtitulosSelectors) {
      try {
        const subtitulosButton = await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        if (subtitulosButton) {
          await subtitulosButton.click();
          console.log('Subtitulos "boba" seleccionados');
          await page.waitForTimeout(1000);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    await page.screenshot({ path: 'screenshots/veed-8-subtitulos.png', fullPage: true });

    // Buscar y hacer clic en el botón "Hecho"
    console.log('Buscando boton "Hecho"...');
    const hechoSelectors = [
      'button:has-text("Hecho")',
      'button:has-text("hecho")',
      'button:has-text("Done")',
      'button:has-text("done")',
      'button:has-text("Finish")',
      'button:has-text("Complete")'
    ];

    let hechoButton = null;
    for (const selector of hechoSelectors) {
      try {
        hechoButton = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (hechoButton) {
          const isEnabled = await hechoButton.isEnabled();
          if (isEnabled) {
            console.log(`Boton Hecho encontrado con selector: ${selector}`);
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (!hechoButton) {
      await page.screenshot({ path: 'screenshots/veed-no-hecho-button.png', fullPage: true });
      throw new Error('No se encontro el boton Hecho.');
    }

    await hechoButton.click();
    console.log('Boton Hecho clickeado, comenzando renderizado...');
    await page.screenshot({ path: 'screenshots/veed-9-hecho-clicked.png', fullPage: true });

    // Esperar el renderizado final (puede tardar varios minutos)
    console.log('Esperando renderizado final...');
    let videoGenerado = false;
    tiempoEsperado = 0;
    const maxTiempoRender = config.timeouts.generation;

    while (tiempoEsperado < maxTiempoRender) {
      const successIndicators = await page.$$('text=/.*complete.*/i, text=/.*success.*/i, text=/.*listo.*/i, text=/.*ready.*/i, video, .video-player, [class*="preview"], [class*="player"]');
      if (successIndicators.length > 0) {
        videoGenerado = true;
        console.log('Video renderizado exitosamente!');
        break;
      }

      const errorIndicators = await page.$$('text=/.*error.*/i, text=/.*failed.*/i, .error');
      if (errorIndicators.length > 0) {
        const errorText = await errorIndicators[0].innerText();
        await page.screenshot({ path: 'screenshots/veed-error-render.png', fullPage: true });
        throw new Error(`Error en el renderizado: ${errorText}`);
      }

      await page.waitForTimeout(5000);
      tiempoEsperado += 5000;

      if (tiempoEsperado % 30000 === 0) {
        console.log(`Renderizando... ${tiempoEsperado / 1000}s de ${maxTiempoRender / 1000}s`);
        await page.screenshot({ path: `screenshots/veed-render-${tiempoEsperado / 1000}s.png`, fullPage: true });
      }
    }

    if (!videoGenerado) {
      await page.screenshot({ path: 'screenshots/veed-timeout-render.png', fullPage: true });
      console.log('Timeout esperando renderizado, pero continuando...');
    }

    await page.screenshot({ path: 'screenshots/veed-10-final.png', fullPage: true });

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

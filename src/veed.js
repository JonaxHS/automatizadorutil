import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, DESKTOP_CONTEXT } from './auth.js';

/**
 * Toma un screenshot de forma segura. Si falla (timeout, page crash, etc.)
 * solo lo loguea y continúa — los screenshots son solo para debug.
 */
async function safeScreenshot(page, opts) {
  try {
    await page.screenshot({ timeout: 15000, ...opts });
  } catch (err) {
    console.warn(`[screenshot] No se pudo guardar ${opts.path || ''}: ${err.message}`);
  }
}

/**
 * Lanza un error especial si Veed muestra el modal de límite diario.
 * Texto de referencia: "You've Reached Your Daily Limit"
 */
class LimiteVeedError extends Error {
  constructor() {
    super('LIMITE_DIARIO_VEED: Has alcanzado el limite de videos por dia en Veed.io. Vuelve mañana o mejora tu plan.');
    this.name = 'LimiteVeedError';
  }
}

async function checkLimiteVeed(page) {
  try {
    const texto = ((await page.locator('body').innerText({ timeout: 3000 })) || '').toLowerCase();
    if (
      texto.includes("you've reached your daily limit") ||
      texto.includes('reached your daily limit') ||
      texto.includes('daily limit') ||
      texto.includes('has alcanzado tu límite diario') ||
      texto.includes('limite diario')
    ) {
      console.error('[VEED] Limite diario detectado. Deteniendo script.');
      throw new LimiteVeedError();
    }
  } catch (err) {
    if (err instanceof LimiteVeedError) throw err;
    // Ignorar errores al leer el body (page crashed, etc.)
  }
}

/**
 * Genera un video en Veed.io AI Studio usando el guion proporcionado.
 * @param {string} guion
 * @returns {Promise<string>}
 */
export async function generarVideo(guion) {
  console.log('Iniciando generacion de video en Veed.io AI Studio...');

  const { browser, context, page } = await crearNavegadorConSesion(config.headless, DESKTOP_CONTEXT);

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

    await safeScreenshot(page, { path: 'screenshots/veed-1-ai-studio.png', fullPage: true });

    // Verificar autenticación (sin volver a navegar)
    console.log('Verificando autenticación en Veed.io...');
    const indicadoresAuth = [
      '[aria-label*="user" i]',
      '[aria-label*="account" i]',
      '[data-testid*="user" i]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="menu" i]',
      '[class*="avatar"]',
      '[class*="user"]',
      'button:has-text("Upgrade")',
      'button:has-text("Pro")',
      'a[href*="/workspace"]',
      'a[href*="/projects"]'
    ];

    let autenticado = false;
    for (const selector of indicadoresAuth) {
      try {
        const elemento = await page.$(selector);
        if (elemento) {
          const isVisible = await elemento.isVisible();
          if (isVisible) {
            console.log(`Autenticación detectada con selector: ${selector}`);
            autenticado = true;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (!autenticado) {
      // Verificar si hay indicadores que requieren login
      console.log('No se detectó autenticación, verificando indicadores de login...');
      let loginDetectado = false;

      const loginSelectors = [
        'text=/.*sign in.*/i',
        'text=/.*log in.*/i',
        'text=/.*login.*/i',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'a:has-text("Sign in")'
      ];

      for (const selector of loginSelectors) {
        try {
          const loginElements = await page.$$(selector);
          if (loginElements.length > 0) {
            console.log(`Indicador de login encontrado: ${selector}`);
            loginDetectado = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (loginDetectado) {
        await safeScreenshot(page, { path: 'screenshots/veed-no-auth.png', fullPage: true });
        throw new Error('No autenticado en Veed.io. Inicia sesion desde la interfaz web. Revisa el screenshot: screenshots/veed-no-auth.png');
      }

      // Si no hay indicadores de login, asumir que está autenticado
      console.log('No se encontraron indicadores de login, continuando...');
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
      await safeScreenshot(page, { path: 'screenshots/veed-no-input.png', fullPage: true });
      throw new Error('No se encontro el campo para pegar el guion en AI Studio.');
    }

    // Pegar el guion
    console.log('Pegando guion en el campo de texto...');
    await scriptInput.click();
    await page.waitForTimeout(500);
    await scriptInput.fill(guion);
    await page.waitForTimeout(1000);
    await safeScreenshot(page, { path: 'screenshots/veed-2-guion-pegado.png', fullPage: true });

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
    await page.waitForTimeout(2000);
    await checkLimiteVeed(page); // ← detectar paywall justo después de Generate
    await safeScreenshot(page, { path: 'screenshots/veed-3-generate-clicked.png', fullPage: true });

    // Veed muestra un estado intermedio "Generar video..." con skeletons.
    // Esperamos a que termine para poder editar parametros de forma estable.
    console.log('Esperando que termine la carga inicial de Veed...');
    let cargaInicialLista = false;
    let flujoDirectoRender = false;
    for (let i = 0; i < 24; i++) {
      try {
        const loadingSelectors = [
          'text=/.*generar video.*instantes.*/i',
          'text=/.*generating.*moments.*/i',
          'text=/.*this may take a moment.*/i',
          'text=/.*estamos generando su vídeo.*/i',
          'text=/.*estamos generando su video.*/i'
        ];

        let loadingHints = 0;
        for (const selector of loadingSelectors) {
          try {
            const els = await page.$$(selector);
            loadingHints += els.length;
          } catch (error) {
            continue;
          }
        }

        const panelAjustesSelectors = ['text=/.*ajustes.*/i', 'text=/.*settings.*/i'];
        let panelAjustes = 0;
        for (const selector of panelAjustesSelectors) {
          try {
            const els = await page.$$(selector);
            panelAjustes += els.length;
          } catch (error) {
            continue;
          }
        }

        const renderSelectors = [
          'text=/.*renderización del vídeo.*/i',
          'text=/.*renderizacion del video.*/i',
          'text=/.*rendering video.*/i',
          'text=/.*estamos generando su vídeo.*/i'
        ];
        let renderHints = 0;
        for (const selector of renderSelectors) {
          try {
            const els = await page.$$(selector);
            renderHints += els.length;
          } catch (error) {
            continue;
          }
        }

        if (renderHints > 0) {
          flujoDirectoRender = true;
          console.log('Veed entró en flujo directo de render. Se omite espera de opciones.');
          break;
        }

        if (panelAjustes > 0 && loadingHints === 0) {
          cargaInicialLista = true;
          break;
        }
      } catch (error) {
        if (error instanceof LimiteVeedError) throw error;
        // continuar reintentando
      }

      await page.waitForTimeout(5000);
      await checkLimiteVeed(page);
    }
    if (cargaInicialLista) {
      console.log('Carga inicial completada, procediendo a ajustar parametros.');
    } else {
      console.log('Carga inicial no confirmada totalmente, intentando continuar con cuidado.');
    }

    // Esperar hasta 5 minutos para que aparezcan las opciones
    console.log('Esperando opciones de configuracion (hasta 5 minutos)...');
    console.log('Veed.io está procesando el guion y generando el video inicial...');
    let opcionesEncontradas = false;
    let tiempoEsperado = 0;
    const maxTiempoGeneracion = 300000; // 5 minutos

    while (tiempoEsperado < maxTiempoGeneracion) {
      // Si Veed ya pasó a renderizado, no esperar opciones.
      try {
        const renderEarlySelectors = [
          'text=/.*renderización del vídeo.*/i',
          'text=/.*renderizacion del video.*/i',
          'text=/.*rendering video.*/i',
          'text=/.*estamos generando su vídeo.*/i'
        ];

        let renderEarlyCount = 0;
        for (const selector of renderEarlySelectors) {
          try {
            const els = await page.$$(selector);
            renderEarlyCount += els.length;
          } catch (error) {
            continue;
          }
        }

        if (renderEarlyCount > 0) {
          flujoDirectoRender = true;
          console.log('Renderización detectada durante espera de opciones. Continuando...');
          break;
        }
      } catch (error) {
        // ignorar y continuar
      }

      // Buscar indicadores de que aparecieron las opciones
      const opcionSelectors = [
        'text=/.*solo voz.*/i',
        'text=/.*sólo voz.*/i',
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
            const isVisible = await elemento.isVisible();
            if (isVisible) {
              opcionesEncontradas = true;
              console.log(`Opciones de configuracion encontradas con selector: ${selector}`);
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }

      if (opcionesEncontradas) break;

      // Verificar si hay errores reales (con texto visible)
      const errorSelectors = [
        'text=/error:/i',
        'text=/failed/i',
        '[role="alert"]',
        '.error-message',
        '[class*="error-text"]',
        '[data-testid*="error"]'
      ];

      let errorReal = null;
      for (const selector of errorSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const text = await element.innerText();
              if (text && text.trim().length > 0) {
                errorReal = text.trim();
                console.log(`Error detectado con selector ${selector}: ${errorReal}`);
                break;
              }
            }
          }
          if (errorReal) break;
        } catch (error) {
          continue;
        }
      }

      if (errorReal) {
        await page.screenshot({ path: 'screenshots/veed-error-generacion.png', fullPage: true });
        throw new Error(`Error en la generacion: ${errorReal}`);
      }

      await page.waitForTimeout(5000);
      tiempoEsperado += 5000;

      if (tiempoEsperado % 30000 === 0) {
        console.log(`Esperando... ${tiempoEsperado / 1000}s de ${maxTiempoGeneracion / 1000}s`);
        await safeScreenshot(page, { path: `screenshots/veed-esperando-${tiempoEsperado / 1000}s.png`, fullPage: true });
      }
    }

    if (!opcionesEncontradas || flujoDirectoRender) {
      // Algunos flujos de Veed avanzan directo al render sin este panel.
      console.log('No aparecieron opciones avanzadas. Continuando flujo directo a renderizado...');
      await safeScreenshot(page, { path: 'screenshots/veed-timeout-opciones-continuando.png', fullPage: true });
    } else {
      await safeScreenshot(page, { path: 'screenshots/veed-4-opciones-aparecieron.png', fullPage: true });

      // Seleccionar "solo voz" (voice only)
      console.log('Seleccionando opcion "solo voz"...');
      const soloVozSelectors = [
        'text=/.*solo voz.*/i',
        'text=/.*sólo voz.*/i',
        'text=/.*voice only.*/i',
        'button:has-text("solo voz")',
        'button:has-text("Sólo voz")',
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

      await safeScreenshot(page, { path: 'screenshots/veed-5-solo-voz.png', fullPage: true });

      // --- Helper robusto para dropdowns (listas) de Veed ---
      // --- Helper robusto para dropdowns (listas) de Veed ---
      const seleccionarEnDropdown = async (page, targetName, labelLocators, optionTexts) => {
        console.log(`Intentando seleccionar ${targetName} en lista...`);

        // 1. Verificar si la opción ya parece estar seleccionada
        // Buscamos si alguno de los textos deseados ya es visible en la pantalla
        // cerca de donde se asume que está el dropdown.
        for (const loc of labelLocators) {
          try {
            const els = await page.$$(loc);
            for (const el of els) {
              if (await el.isVisible()) {
                const labelText = await page.evaluate(el => el.parentElement.innerText, el);
                if (labelText) {
                  for (const textOpt of optionTexts) {
                    if (labelText.toLowerCase().includes(textOpt.toLowerCase())) {
                      console.log(`[Veed] ${targetName} ya parece estar seleccionado por defecto: "${textOpt}". Omitiendo clic.`);
                      return true;
                    }
                  }
                }
              }
            }
          } catch (e) { }
        }

        // 2. Abrir la lista clickeando justo debajo de la etiqueta (Language, Voice, Subtitles)
        let menuAbierto = false;
        for (const loc of labelLocators) {
          try {
            const els = await page.$$(loc);
            for (const el of els) {
              if (await el.isVisible()) {
                const box = await el.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                  console.log(`[Veed] Clickeando el combobox debajo de la etiqueta "${loc}"...`);
                  // Clic geométrico infalible: 20px bajo la caja del texto
                  await page.mouse.click(box.x + 20, box.y + box.height + 20);
                  await page.waitForTimeout(1500); // Esperar animación de la lista
                  menuAbierto = true;
                  break;
                }
              }
            }
          } catch (e) { }
          if (menuAbierto) break;
        }

        if (!menuAbierto) {
          console.log(`[Veed] No se pudo encontrar la etiqueta para abrir ${targetName}. Se intentará buscar la opción directamente.`);
        }

        // 3. Buscar y hacer clic en la opción dentro del menú abierto
        for (const textOpt of optionTexts) {
          try {
            // Estrategia 1: usando getByRole('option')
            const safeRegex = new RegExp(textOpt.replace(/[()]/g, '\\$&'), 'i');
            const arrElements = await page.getByRole('option', { name: safeRegex }).all();
            for (const el of arrElements) {
              if (await el.isVisible()) {
                await el.click();
                console.log(`[Veed] ${targetName} seleccionado (getByRole).`);
                await page.waitForTimeout(1000);
                // Pulsar Escape para cerrar por si acaso
                await page.keyboard.press('Escape');
                return true;
              }
            }

            // Estrategia 2: Selectores de texto genéricos pero buscando el que esté visible
            const fallbacks = await page.$$(`text="${textOpt}"`);
            for (const el of fallbacks) {
              if (await el.isVisible()) {
                await el.click();
                console.log(`[Veed] ${targetName} seleccionado (text fallback).`);
                await page.waitForTimeout(1000);
                await page.keyboard.press('Escape');
                return true;
              }
            }
          } catch (e) { }
        }

        console.log(`[Veed] Fallo al encontrar la opción de ${targetName} en el dropdown.`);
        await page.keyboard.press('Escape');
        return false;
      };

      // Seleccionar idioma español
      await seleccionarEnDropdown(
        page,
        'Idioma Spanish',
        ['text=/^LaNgUaGe$/i', 'text=/^Language$/i', 'text=/^Idioma$/i'],
        ['Spanish (Spain)', 'Spanish', 'Español']
      );
      await page.waitForTimeout(2000); // esperar que el idioma cargue las voces
      await safeScreenshot(page, { path: 'screenshots/veed-6-spanish.png', fullPage: true });

      // Seleccionar voz Alex o Carolina
      const voiceSelected = await seleccionarEnDropdown(
        page,
        'Voz Carolina/Alex',
        ['text=/^Voice$/i', 'text=/^Voz$/i'],
        ['Carolina (female)', 'Alex (male)', 'Carolina', 'Alex']
      );
      if (!voiceSelected) console.log('No se pudo encontrar en la lista, continuando...');
      await safeScreenshot(page, { path: 'screenshots/veed-7-voz.png', fullPage: true });

      // Seleccionar subtítulos "Boba" o "Slay"
      await seleccionarEnDropdown(
        page,
        'Subtitulos Boba/Slay',
        ['text=/^Subtitles$/i', 'text=/^Subtítulos$/i'],
        ['Boba', 'Slay']
      );
      await safeScreenshot(page, { path: 'screenshots/veed-8-subtitulos.png', fullPage: true });

      // Esperar el estado final de ajustes antes de presionar "Hecho"
      // (como en la captura: panel estable y sin mensaje de carga).
      console.log('Validando estado listo antes de hacer click en "Hecho"...');
      const maxTiempoListo = 120000;
      let tiempoListo = 0;
      let estadoListo = false;

      while (tiempoListo < maxTiempoListo) {
        try {
          const bodyText = await page.locator('body').innerText();
          const texto = (bodyText || '').toLowerCase();

          const sinCarga =
            !texto.includes('esto puede tardar unos instantes') &&
            !texto.includes('this may take a moment') &&
            !texto.includes('generar video. esto puede tardar');

          const tieneIdioma = /spanish|español/.test(texto);
          const tieneVoz = /alex|carolina/.test(texto);
          const tieneSubtitulos = /boba|slay/.test(texto);

          // Además validar que el botón Hecho exista y esté habilitado.
          const botonHechoVisible = await page.$(
            'button:has-text("Hecho"), button:has-text("Done"), button:has-text("Finish"), button:has-text("Complete")'
          );

          let hechoHabilitado = false;
          if (botonHechoVisible) {
            try {
              hechoHabilitado = await botonHechoVisible.isEnabled();
            } catch (error) {
              hechoHabilitado = false;
            }
          }

          if (sinCarga && tieneIdioma && tieneVoz && tieneSubtitulos && hechoHabilitado) {
            estadoListo = true;
            console.log('Estado listo detectado: parametros visibles y boton Hecho habilitado.');
            break;
          }
        } catch (error) {
          // Seguimos esperando
        }

        await page.waitForTimeout(3000);
        tiempoListo += 3000;
      }

      if (!estadoListo) {
        console.log('No se pudo confirmar estado listo completo, intentando continuar con el mejor estado disponible.');
        await safeScreenshot(page, { path: 'screenshots/veed-8b-estado-no-confirmado.png', fullPage: true });
      } else {
        await safeScreenshot(page, { path: 'screenshots/veed-8b-estado-listo.png', fullPage: true });
      }

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
        console.log('No se encontró botón Hecho. Continuando, puede que el flujo ya esté en render.');
      } else {
        await hechoButton.click();
        console.log('Boton Hecho clickeado, comenzando renderizado...');
        await safeScreenshot(page, { path: 'screenshots/veed-9-hecho-clicked.png', fullPage: true });
      }
    }

    // Esperar el renderizado final (puede tardar varios minutos)
    console.log('Esperando renderizado final...');

    // Después de "Hecho" normalmente aparece una pantalla intermedia:
    // "Estamos generando su video...". La detectamos y esperamos a que desaparezca.
    const pantallaGenerandoSelectors = [
      'text=/.*estamos generando su vídeo.*/i',
      'text=/.*estamos generando su video.*/i',
      'text=/.*siéntate tranquilo, tu vídeo estará listo pronto.*/i',
      'text=/.*sientate tranquilo, tu video estara listo pronto.*/i',
      'text=/.*we are generating your video.*/i',
      'text=/.*your video will be ready soon.*/i'
    ];

    let pantallaGenerandoDetectada = false;
    for (const selector of pantallaGenerandoSelectors) {
      try {
        const el = await page.$(selector);
        if (el && (await el.isVisible())) {
          pantallaGenerandoDetectada = true;
          console.log(`Pantalla de generacion detectada con selector: ${selector}`);
          await safeScreenshot(page, { path: 'screenshots/veed-9b-generando.png', fullPage: true });
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (pantallaGenerandoDetectada) {
      let tiempoGenerando = 0;
      const maxTiempoPantallaGenerando = Math.min(config.timeouts.generation, 300000);

      while (tiempoGenerando < maxTiempoPantallaGenerando) {
        let sigueGenerando = false;

        for (const selector of pantallaGenerandoSelectors) {
          try {
            const el = await page.$(selector);
            if (el && (await el.isVisible())) {
              sigueGenerando = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (!sigueGenerando) {
          console.log('Pantalla de generacion finalizada. Continuando a deteccion de video listo...');
          break;
        }

        await page.waitForTimeout(5000);
        tiempoGenerando += 5000;

        if (tiempoGenerando % 30000 === 0) {
          console.log(`Generando video... ${tiempoGenerando / 1000}s`);
        }
      }
    }

    let videoGenerado = false;
    tiempoEsperado = 0;
    const maxTiempoRender = config.timeouts.generation;
    let ultimoPorcentajeRender = -1;

    while (tiempoEsperado < maxTiempoRender) {
      let textoPantalla = '';
      let enPantallaRender = false;
      let porcentajeRender = null;

      try {
        textoPantalla = ((await page.locator('body').innerText()) || '').toLowerCase();
        enPantallaRender =
          textoPantalla.includes('renderización del vídeo') ||
          textoPantalla.includes('renderizacion del video') ||
          textoPantalla.includes('rendering video') ||
          textoPantalla.includes('video rendering');

        const matchPorcentaje = textoPantalla.match(/\b(\d{1,3})\s*%\b/);
        if (matchPorcentaje) {
          porcentajeRender = Number.parseInt(matchPorcentaje[1], 10);
        }
      } catch (error) {
        // continuar con selectores alternativos
      }

      // Si estamos en la pantalla de render, esperar explícitamente al 100%
      if (enPantallaRender) {
        if (Number.isInteger(porcentajeRender)) {
          if (porcentajeRender !== ultimoPorcentajeRender) {
            ultimoPorcentajeRender = porcentajeRender;
            console.log(`Renderización del video: ${porcentajeRender}%`);
          }

          if (porcentajeRender >= 100) {
            videoGenerado = true;
            console.log('Renderización llegó a 100%. Video listo.');
            break;
          }
        } else {
          console.log('Pantalla de render detectada, esperando porcentaje...');
        }
      }

      const successSelectors = [
        'text=/.*complete.*/i',
        'text=/.*success.*/i',
        'text=/.*listo.*/i',
        'text=/.*ready.*/i',
        'video',
        '.video-player',
        '[class*="preview"]',
        '[class*="player"]',
        'button:has-text("Vista previa")',
        'button:has-text("Preview")',
        'button:has-text("Copiar enlace")',
        'button:has-text("Copy link")'
      ];

      // Si no estamos en pantalla de render, usar detectores generales.
      if (!enPantallaRender) {
        for (const selector of successSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              videoGenerado = true;
              console.log(`Video renderizado detectado con selector: ${selector}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
      if (videoGenerado) {
        break;
      }

      // Verificar si hay errores reales durante el renderizado
      const errorSelectors = [
        'text=/error:/i',
        'text=/failed/i',
        '[role="alert"]',
        '.error-message',
        '[class*="error-text"]',
        '[data-testid*="error"]'
      ];

      let errorReal = null;
      for (const selector of errorSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const text = await element.innerText();
              if (text && text.trim().length > 0) {
                errorReal = text.trim();
                console.log(`Error detectado en renderizado con selector ${selector}: ${errorReal}`);
                break;
              }
            }
          }
          if (errorReal) break;
        } catch (error) {
          continue;
        }
      }

      if (errorReal) {
        await page.screenshot({ path: 'screenshots/veed-error-render.png', fullPage: true });
        throw new Error(`Error en el renderizado: ${errorReal}`);
      }

      await page.waitForTimeout(5000);
      tiempoEsperado += 5000;
      await checkLimiteVeed(page); // ← verificar durante el render

      if (tiempoEsperado % 30000 === 0) {
        console.log(`Renderizando... ${tiempoEsperado / 1000}s de ${maxTiempoRender / 1000}s`);
        await safeScreenshot(page, { path: `screenshots/veed-render-${tiempoEsperado / 1000}s.png`, fullPage: true });
      }
    }

    if (!videoGenerado) {
      await safeScreenshot(page, { path: 'screenshots/veed-timeout-render.png', fullPage: true });
      console.log('Timeout esperando renderizado, pero continuando...');
    }

    await safeScreenshot(page, { path: 'screenshots/veed-10-final.png', fullPage: true });

    const finalUrl = page.url();
    console.log('URL del proyecto:', finalUrl);

    // ==========================================
    // Descargar el Video MP4 a local
    // ==========================================
    let localUrl = null;
    try {
      console.log('Intentando descargar el video MP4 localmente...');
      if (typeof emitirEstado === 'function') {
        emitirEstado('Descargando MP4 desde Veed...', 95, 'info');
      }

      const downloadSelectors = [
        // 1. Botón con texto exacto adentro (clásicos)
        'button:has-text("Download MP4")',
        'button:has-text("Descargar MP4")',
        // 2. Localizadores que interceptan la caja visible de "Share this video" (icono descargar)
        'button[title="Download"]',
        'button[title="Descargar"]',
        'button[aria-label="Download"]',
        'button[aria-label="Descargar"]',
        // 3. Icono SVG específico que tiene un atributo con "download" en alguna parte del padre
        '.share-video-buttons button svg path[d*="M2 12v3"]', // aproximación al path de descarga
        'text="Download"',
        'text="Descargar"',
        'a[download]',
        '[aria-label*="download"]'
      ];

      let btnDescarga = null;
      for (const selector of downloadSelectors) {
        try {
          // Si el selector busca explícitamente un texto genérico "Download",
          // evitemos que haga clic en un tooltip flotante y le damos al botón
          const els = await page.$$(selector);
          for (const el of els) {
            if (await el.isVisible()) {
              // Buscamos el elemento button más cercano si es que clickeamos un span o svg
              const isBtn = await el.evaluate(n => n.tagName === 'BUTTON' || n.tagName === 'A');
              let targetEl = el;
              if (!isBtn) {
                const parentBtn = await el.evaluateHandle(n => n.closest('button, a'));
                if (parentBtn && await parentBtn.isVisible()) {
                  targetEl = parentBtn;
                }
              }

              btnDescarga = targetEl;
              console.log(`Botón Descargar encontrado con selector: ${selector}`);
              break;
            }
          }
          if (btnDescarga) break;
        } catch (e) { }
      }

      if (btnDescarga) {
        console.log('Iniciando descarga en Playwright...');
        // Empezar a esperar el evento de descarga ANTES de hacer click
        const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
        await btnDescarga.click();

        const download = await downloadPromise;

        const fs = await import('fs');
        const path = await import('path');
        const videosDir = path.join(process.cwd(), 'public', 'videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        const fileName = `video_${Date.now()}.mp4`;
        const localPath = path.join(videosDir, fileName);

        await download.saveAs(localPath);
        console.log(`Video descargado exitosamente en: ${localPath}`);
        localUrl = `/videos/${fileName}`;
      } else {
        console.log('No se encontro el botón de descargar, se omite guardado local.');
      }
    } catch (e) {
      console.log('Fallo al intentar descargar el video localmente:', e.message);
    }
    // ==========================================

    return { url: finalUrl, localUrl };
  } catch (error) {
    console.error('Error al generar video:', error.message);
    await safeScreenshot(page, { path: 'screenshots/veed-error.png' });
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

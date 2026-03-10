import { config } from '../config.js';
import { crearNavegadorConSesion, guardarSesion, estaAutenticado, DESKTOP_CONTEXT } from './auth.js';

function quitarBloquesCodigo(texto) {
  if (!texto) return '';

  return texto
    .replace(/^```[a-zA-Z0-9_-]*\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
}

function extraerSeccionesQwen(textoCompleto) {
  const texto = (textoCompleto || '').replace(/\r/g, '').trim();

  const guionMatch = texto.match(
    /(?:^|\n)(?:#{1,6}\s*)?📜\s*Guion[^\n:]*:?\s*\n?([\s\S]*?)(?=\n(?:#{1,6}\s*)?(?:✅\s*Detalles|🎥\s*Sugerencias|💬\s*Comentario|🚀\s*Dato\s*clave|📥|🎉|$))/i
  );

  const descripcionMatch = texto.match(
    /(?:^|\n)(?:#{1,6}\s*)?📝\s*Descripción\s*:?\s*\n?([\s\S]*?)(?=\n(?:#{1,6}\s*)?(?:📜\s*Guion|✅\s*Detalles|🎥\s*Sugerencias|💬\s*Comentario|🚀\s*Dato\s*clave|📥|🎉|$))/i
  );

  let guion = guionMatch ? quitarBloquesCodigo(guionMatch[1]) : '';
  let descripcion = descripcionMatch ? descripcionMatch[1].trim() : '';

  if (!guion) {
    const fallbackGuion = texto.match(
      /(Imagina[\s\S]*?)(?=\n(?:✅\s*Detalles|🎥\s*Sugerencias|💬\s*Comentario|🚀\s*Dato\s*clave|📥|🎉|$))/i
    );
    guion = fallbackGuion ? quitarBloquesCodigo(fallbackGuion[1]) : texto;
  }

  if (!descripcion) {
    const hashtags = texto.match(/(^#[^\n]+(?:\n#[^\n]+)*)/m);
    descripcion = hashtags ? hashtags[1].trim() : '';
  }

  return {
    guion: guion.trim(),
    descripcion: descripcion.trim(),
    respuestaCompleta: texto
  };
}

/**
 * Genera un guion usando Qwen AI.
 * @param {string} tema
 * @returns {Promise<{guion: string, descripcion: string, respuestaCompleta: string}>}
 */
export async function generarGuion(tema) {
  console.log('Iniciando generacion de guion con Qwen AI...');
  console.log(`Abriendo chat configurado: ${config.qwenChatUrl}`);

  const { browser, context, page } = await crearNavegadorConSesion(config.headless, DESKTOP_CONTEXT);

  try {
    await page.goto(config.qwenChatUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeouts.navigation
    });

    // Esperar a que la página cargue completamente
    await page.waitForTimeout(3000);

    // Permisos de portapapeles para poder leer el contenido copiado por Qwen
    try {
      const origin = new URL(config.qwenChatUrl).origin;
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    } catch (error) {
      console.log('No se pudieron otorgar permisos de portapapeles:', error.message);
    }

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
    let selectorUsado = null;
    for (const selector of selectors) {
      try {
        const candidatos = await page.$$(selector);
        for (const candidato of candidatos) {
          const esMonaco = await candidato.evaluate((el) => {
            return Boolean(el.closest('.monaco-editor, .monaco-scrollable-element, [data-mprt]'));
          });

          if (esMonaco) {
            continue;
          }

          const visible = await candidato.isVisible();
          if (!visible) {
            continue;
          }

          chatInput = candidato;
          selectorUsado = selector;
          console.log(`Campo de entrada encontrado con selector: ${selector}`);
          break;
        }

        if (chatInput) {
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

    // Solo enviar el tema - el chat ya tiene las instrucciones configuradas
    const prompt = tema;
    console.log(`Enviando tema al chat: ${tema}`);

    // Evitar click de mouse: usar focus por teclado/DOM para prevenir interceptores
    console.log('Activando campo de entrada con focus (sin click)...');
    await chatInput.focus();
    await page.waitForTimeout(300);

    // Verificar si es contenteditable
    const isContentEditable = await page.evaluate((sel) => {
      const elem = document.querySelector(sel);
      return elem && elem.getAttribute('contenteditable') === 'true';
    }, selectorUsado);

    if (isContentEditable) {
      console.log('Campo contenteditable detectado, usando evaluate para escribir');
      await page.evaluate((sel, text) => {
        const elem = document.querySelector(sel);
        elem.focus();
        elem.textContent = text;
        // Disparar eventos para simular escritura
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
      }, selectorUsado, prompt);
    } else {
      console.log('Usando type() para escribir el prompt');
      await chatInput.type(prompt, { delay: 30 });
    }

    await page.screenshot({ path: 'screenshots/qwen-2-prompt-filled.png', fullPage: true });

    console.log('Enviando mensaje con teclado (Enter / Ctrl+Enter)...');
    await chatInput.press('Enter');
    await page.waitForTimeout(500);
    await chatInput.press('Control+Enter').catch(() => { });

    await page.screenshot({ path: 'screenshots/qwen-3-message-sent.png', fullPage: true });

    console.log('Esperando respuesta de Qwen AI (puede tardar 10-60 segundos)...');
    await page.waitForTimeout(12000); // Espera inicial de 12 segundos

    const limpiarTextoPlano = (texto) => {
      return texto
        .split('\n')
        // El renderizado HTML a veces inyecta numeros de linea de bloques de codigo
        .filter((linea) => !/^\s*\d+\s*$/.test(linea))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    let respuestaQwen = '';
    let intentos = 0;
    const maxIntentos = 30; // 30 intentos x 3 segundos = 90 segundos máximo

    while (intentos < maxIntentos) {
      try {
        // Intento 1: usar boton Copiar del ultimo mensaje del asistente para mantener formato original
        const copiado = await page.evaluate(async () => {
          const contenedorSelectores = [
            '[class*="AssistantMessage"]',
            '[data-role="assistant"]',
            'div[class*="message"][class*="assistant"]',
            'div[class*="answer"]',
            'div[class*="response"][class*="ai"]',
            '[class*="markdown-body"]'
          ];

          let ultimoContenedor = null;
          for (const selector of contenedorSelectores) {
            const encontrados = Array.from(document.querySelectorAll(selector));
            if (encontrados.length > 0) {
              ultimoContenedor = encontrados[encontrados.length - 1];
            }
          }

          if (!ultimoContenedor) {
            return { ok: false };
          }

          const textoBase = (ultimoContenedor.innerText || ultimoContenedor.textContent || '').trim();
          if (textoBase.length < 50) {
            return { ok: false };
          }

          const copyBtn = ultimoContenedor.querySelector(
            'button[aria-label*="Copy"], button[aria-label*="copy"], [data-testid*="copy"], button[title*="Copy"], button[title*="copy"]'
          ) || ultimoContenedor.querySelector('button');

          if (!copyBtn) {
            return { ok: false, textoFallback: textoBase, fuente: 'sin-boton-copy' };
          }

          // Click DOM para evitar interception de pointer events
          copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

          try {
            const texto = await navigator.clipboard.readText();
            if (texto && texto.trim().length > 50) {
              return { ok: true, texto: texto.trim(), fuente: 'clipboard-copy-button' };
            }
          } catch {
            // Ignorar: se usa fallback abajo
          }

          return { ok: false, textoFallback: textoBase, fuente: 'fallback-innerText' };
        });

        const respuesta = copiado?.ok
          ? { texto: copiado.texto, selector: copiado.fuente }
          : (() => {
            if (copiado?.textoFallback) {
              return { texto: limpiarTextoPlano(copiado.textoFallback), selector: copiado.fuente || 'fallback' };
            }

            return null;
          })();

        if (respuesta && respuesta.texto) {
          respuestaQwen = respuesta.texto;
          console.log(`Respuesta capturada con selector '${respuesta.selector}': ${respuesta.texto.substring(0, 150)}...`);
          console.log(`Longitud de respuesta: ${respuestaQwen.length} caracteres`);

          // Verificar si sigue generando
          const isGenerating = await page.$('[aria-label*="generating"], [class*="generating"], [class*="typing"], [class*="loading"]');
          if (!isGenerating && respuestaQwen.length > 100) {
            console.log('Generación completada');
            await page.screenshot({ path: 'screenshots/qwen-respuesta-capturada.png', fullPage: true });
            break;
          } else if (isGenerating) {
            console.log('Aún generando, esperando...');
          }
        } else {
          console.log(`Intento ${intentos + 1}: No se encontró respuesta válida aún`);
        }
      } catch (error) {
        console.log(`Error en intento ${intentos + 1}: ${error.message}`);
      }

      await page.waitForTimeout(3000); // Esperar 3 segundos entre intentos
      intentos += 1;
    }

    if (!respuestaQwen) {
      await page.screenshot({ path: 'screenshots/qwen-error-no-response.png', fullPage: true });

      // Debug: intentar capturar cualquier texto visible
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Texto de página completo (primeros 500 chars):', bodyText.substring(0, 500));

      throw new Error('No se pudo extraer respuesta de Qwen AI');
    }

    const extraido = extraerSeccionesQwen(respuestaQwen);
    if (!extraido.guion) {
      throw new Error('No se pudo separar la sección de guion desde la respuesta de Qwen');
    }

    console.log(`Guion separado correctamente (${extraido.guion.length} chars)`);
    console.log(`Descripcion separada (${extraido.descripcion.length} chars)`);
    await page.screenshot({ path: 'screenshots/qwen-4-success.png', fullPage: true });
    return extraido;

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

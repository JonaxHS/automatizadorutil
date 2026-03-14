import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';
import { getPromptSiguiente, marcarReelCompletado, getEstadoSeries, reiniciarProgreso, REELS_POR_SERIE } from './series.js';

// ─── Estado compartido ──────────────────────────────────────────────────────
let pendienteAprobacion = null; // { chatId, guion, descripcion, resolve }
let ejecutando = false;

// Chat ID autorizado. Se obtiene del env o del primer /start recibido.
const CHAT_ID_FILE = path.join(process.cwd(), '.auth', 'telegram-chatid.txt');

function cargarChatIdAutorizado() {
    if (config.telegram.chatId) return config.telegram.chatId;
    if (fs.existsSync(CHAT_ID_FILE)) {
        return fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
    }
    return null;
}

function guardarChatIdAutorizado(chatId) {
    const dir = path.dirname(CHAT_ID_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHAT_ID_FILE, String(chatId), 'utf-8');
    console.log(`[Telegram] Chat ID autorizado guardado: ${chatId}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function truncar(texto, max = 3000) {
    if (!texto || texto.length <= max) return texto || '';
    return texto.substring(0, max) + '\n\n[... texto truncado ...]';
}

// ─── Bot principal ───────────────────────────────────────────────────────────
export function iniciarBot(emitirEstado) {
    if (!config.telegram.token) {
        console.warn('[Telegram] ⚠️ TELEGRAM_BOT_TOKEN no configurado en .env. Bot desactivado.');
        return null;
    }

    try {
        console.log('[Telegram] 🤖 Intentando iniciar bot...');
        const bot = new TelegramBot(config.telegram.token, { polling: true });

        let chatIdAutorizado = cargarChatIdAutorizado();

        bot.on('polling_error', (error) => {
            // Error común: token inválido o múltiples instancias
            if (error.message.includes('401 Unauthorized')) {
                console.error('[Telegram] ❌ Error de autenticación: El Token proporcionado es inválido.');
            } else if (error.message.includes('409 Conflict')) {
                console.error('[Telegram] ❌ Conflicto de polling: Ya hay otra instancia del bot corriendo con este token.');
            } else {
                console.error('[Telegram] ⚠️ Error de conexión/polling:', error.message);
            }
        });

        bot.getMe().then(me => {
            console.log(`[Telegram] ✅ Bot conectado exitosamente como: @${me.username}`);
            if (chatIdAutorizado) {
                console.log(`[Telegram] 🔐 Chat ID autorizado cargado: ${chatIdAutorizado}`);
            } else {
                console.log('[Telegram] 📢 Esperando primer /start de un administrador para registrar el Chat ID.');
            }
        }).catch(err => {
            console.error('[Telegram] ❌ No se pudo validar el bot con el token actual:', err.message);
        });

        // ── Middleware de autorización ────────────────────────────────────────────
        function esAutorizado(chatId) {
            return !chatIdAutorizado || String(chatId) === String(chatIdAutorizado);
        }

        async function verificar(msg) {
            const chatId = msg.chat.id;
            if (!chatIdAutorizado) {
                chatIdAutorizado = chatId;
                guardarChatIdAutorizado(chatId);
                await bot.sendMessage(chatId, '✅ Tu chat ha sido registrado como administrador del bot.');
            }
            if (!esAutorizado(chatId)) {
                await bot.sendMessage(chatId, '⛔ No estás autorizado para usar este bot.');
                return false;
            }
            return true;
        }

        // ── /start ────────────────────────────────────────────────────────────────
        bot.onText(/\/start/, async (msg) => {
            if (!await verificar(msg)) return;
            await bot.sendMessage(msg.chat.id,
                `🎬 *Automatizador de Videos*\n\n` +
                `*Comandos de tema libre:*\n` +
                `📝 /manual _<tema>_ — Genera guion y pide aprobación antes de Veed\n` +
                `🚀 /auto _<tema>_ — Completo sin confirmación\n\n` +
                `*Comandos de series (Google Sheets):*\n` +
                `📺 /series — Siguiente reel (modo manual con aprobación)\n` +
                `⚡ /seriesauto — Siguiente reel sin confirmación\n` +
                `📊 /estadoseries — Ver serie y reel actual\n` +
                `🔄 /reiniciarseries — Empezar desde la primera serie\n\n` +
                `*Utilidades:*\n` +
                `📈 /estadobot — Estado del sistema\n` +
                `❌ /cancelar — Cancelar aprobación pendiente`,
                { parse_mode: 'Markdown' }
            );
        });

        // ── /estadobot ────────────────────────────────────────────────────────────
        bot.onText(/\/(estado|estadobot)$/, async (msg) => {
            if (!await verificar(msg)) return;
            const txt = ejecutando
                ? '⏳ Hay una automatización en curso.'
                : '✅ El sistema está libre.';
            await bot.sendMessage(msg.chat.id, txt);
        });

        // ── /cancelar ─────────────────────────────────────────────────────────────
        bot.onText(/\/cancelar/, async (msg) => {
            if (!await verificar(msg)) return;
            if (pendienteAprobacion) {
                pendienteAprobacion.resolve('cancelar');
                pendienteAprobacion = null;
                await bot.sendMessage(msg.chat.id, '❌ Aprobación cancelada.');
            } else if (!ejecutando) {
                await bot.sendMessage(msg.chat.id, 'ℹ️ No hay ninguna operación en curso.');
            } else {
                await bot.sendMessage(msg.chat.id, '⚠️ Hay una automatización activa que no puede cancelarse desde aquí.');
            }
        });

        // ── Flujo base Qwen → (aprobación?) → Veed ───────────────────────────────
        async function ejecutarFlujo(chatId, tema, modoManual, onExito = null) {
            if (ejecutando) {
                await bot.sendMessage(chatId, '⚠️ Ya hay una automatización en curso. Espera a que termine.');
                return false;
            }

            ejecutando = true;
            try {
                await bot.sendMessage(chatId, `⏳ Generando guion con Qwen AI...`, { parse_mode: 'Markdown' });
                if (emitirEstado) emitirEstado('Telegram: Generando guion con Qwen...', 10, 'info');

                const resultado = await generarGuion(tema);
                const guion = typeof resultado === 'string' ? resultado : resultado.guion;
                const descripcion = typeof resultado === 'string' ? '' : resultado.descripcion;

                if (emitirEstado) emitirEstado('Telegram: Guion generado', 40, 'success');

                if (modoManual) {
                    await bot.sendMessage(chatId,
                        `📝 *Guion generado:*\n\n\`\`\`\n${truncar(guion, 3000)}\n\`\`\``,
                        { parse_mode: 'Markdown' }
                    );

                    if (descripcion) {
                        await bot.sendMessage(chatId,
                            `📄 *Descripción + hashtags:*\n\n${truncar(descripcion, 1000)}`,
                            { parse_mode: 'Markdown' }
                        );
                    }

                    await bot.sendMessage(chatId,
                        '¿Deseas enviar este guion a Veed.io para generar el video?',
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '✅ Aprobar', callback_data: 'aprobar' },
                                    { text: '❌ Cancelar', callback_data: 'cancelar' }
                                ]]
                            }
                        }
                    );

                    const decision = await new Promise((resolve) => {
                        pendienteAprobacion = { chatId, resolve };
                        setTimeout(() => {
                            if (pendienteAprobacion) { pendienteAprobacion = null; resolve('timeout'); }
                        }, 10 * 60 * 1000);
                    });

                    if (decision !== 'aprobar') {
                        await bot.sendMessage(chatId, decision === 'timeout'
                            ? '⏰ Tiempo agotado. Cancelado.'
                            : '❌ Video cancelado.');
                        return false;
                    }

                    await bot.sendMessage(chatId, '✅ Aprobado. Enviando a Veed.io...');
                    if (emitirEstado) emitirEstado('Telegram: Guion aprobado, iniciando Veed...', 50, 'info');

                } else {
                    await bot.sendMessage(chatId, `✅ Guion listo. Enviando directamente a Veed.io...`);
                    if (emitirEstado) emitirEstado('Telegram auto: enviando a Veed...', 50, 'info');
                }

                const resultadoVeed = await generarVideo(guion);
                const urlVideo = resultadoVeed.url;
                const localVideo = resultadoVeed.localUrl;

                if (emitirEstado) emitirEstado('Telegram: Video generado exitosamente', 100, 'success');

                let mensajeExito = `🎉 *¡Video generado exitosamente!*\n\n🔗 [Abrir en Veed.io](${urlVideo})`;
                if (localVideo) {
                    mensajeExito += `\n📥 *Descargado localmente:* \`${localVideo}\``;
                }

                await bot.sendMessage(chatId, mensajeExito, { parse_mode: 'Markdown', disable_web_page_preview: true });

                if (onExito) await onExito(guion, descripcion, urlVideo);
                return true;

            } catch (error) {
                console.error('[Telegram] Error en flujo:', error.message);
                await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
                if (emitirEstado) emitirEstado(`Telegram error: ${error.message}`, 0, 'error');
                return false;
            } finally {
                ejecutando = false;
                pendienteAprobacion = null;
            }
        }

        bot.onText(/\/manual(?:\s+(.+))?/, async (msg, match) => {
            if (!await verificar(msg)) return;
            const tema = match?.[1]?.trim();
            if (!tema) {
                await bot.sendMessage(msg.chat.id, '⚠️ Escribe el tema. Ejemplo:\n`/manual inteligencia artificial`', { parse_mode: 'Markdown' });
                return;
            }
            ejecutarFlujo(msg.chat.id, tema, true);
        });

        bot.onText(/\/auto(?:\s+(.+))?/, async (msg, match) => {
            if (!await verificar(msg)) return;
            const tema = match?.[1]?.trim();
            if (!tema) {
                await bot.sendMessage(msg.chat.id, '⚠️ Escribe el tema. Ejemplo:\n`/auto computación cuántica`', { parse_mode: 'Markdown' });
                return;
            }
            ejecutarFlujo(msg.chat.id, tema, false);
        });

        async function ejecutarSiguienteReel(chatId, modoManual) {
            if (ejecutando) {
                await bot.sendMessage(chatId, '⚠️ Ya hay una automatización en curso.');
                return;
            }
            try {
                const info = await getPromptSiguiente();
                const etiqueta = info.esNuevaSerie
                    ? `🆕 *Nueva serie:* _${info.titulo}_`
                    : `📺 *Continuando:* _${info.titulo}_ — Reel ${info.reelHumano}/${REELS_POR_SERIE}`;

                await bot.sendMessage(chatId, `${etiqueta}\n\n💬 Prompt enviado a Qwen:\n\`${info.prompt}\``, { parse_mode: 'Markdown' });

                await ejecutarFlujo(chatId, info.prompt, modoManual, async () => {
                    await marcarReelCompletado();
                    const siguiente = await getPromptSiguiente();
                    const txtSig = siguiente.esNuevaSerie
                        ? `✅ Serie _"${info.titulo}"_ completada.\n🔄 Próxima: *${siguiente.titulo}*`
                        : `✅ Reel ${info.reelHumano}/${REELS_POR_SERIE} de _"${info.titulo}"_ listo.\n➡️ Siguiente: Reel ${siguiente.reelHumano}/${REELS_POR_SERIE}`;
                    await bot.sendMessage(chatId, txtSig, { parse_mode: 'Markdown' });
                });
            } catch (error) {
                console.error('[Telegram/series] Error:', error.message);
                await bot.sendMessage(chatId, `❌ Error al cargar series: ${error.message}`);
            }
        }

        bot.onText(/\/series$/, async (msg) => {
            if (!await verificar(msg)) return;
            ejecutarSiguienteReel(msg.chat.id, true);
        });

        bot.onText(/\/seriesauto/, async (msg) => {
            if (!await verificar(msg)) return;
            ejecutarSiguienteReel(msg.chat.id, false);
        });

        bot.onText(/\/estadoseries/, async (msg) => {
            if (!await verificar(msg)) return;
            try {
                const e = await getEstadoSeries();
                if (e.error) { await bot.sendMessage(msg.chat.id, `❌ ${e.error}`); return; }
                const barraLlena = '█'.repeat(e.reelActual);
                const barraVacia = '░'.repeat(REELS_POR_SERIE - e.reelActual);
                await bot.sendMessage(msg.chat.id,
                    `📊 *Estado de Series*\n\n` +
                    `📺 Serie: *${e.serieActual}*\n` +
                    `🎯 Reel: *${e.reelActual}/${e.totalReelsSerie}*  ${barraLlena}${barraVacia}\n` +
                    `📌 Serie ${e.serieIndex + 1} de ${e.totalSeries}\n` +
                    `📌 Reels completados: ${e.completados} / ${e.total}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                await bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
            }
        });

        bot.onText(/\/reiniciarseries/, async (msg) => {
            if (!await verificar(msg)) return;
            reiniciarProgreso();
            await bot.sendMessage(msg.chat.id, '🔄 Progreso reiniciado. Comenzará desde la primera serie.');
        });

        bot.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            if (!esAutorizado(chatId)) return;
            await bot.answerCallbackQuery(query.id);
            if (!pendienteAprobacion || pendienteAprobacion.chatId !== chatId) return;
            const decision = query.data;
            pendienteAprobacion.resolve(decision);
            pendienteAprobacion = null;
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });
            } catch (_) { }
        });

        return bot;

    } catch (err) {
        console.error('[Telegram] ❌ Error fatal al iniciar el bot:', err.message);
        return null;
    }
}

/**
 * Envía un mensaje proactivo al chat autorizado.
 * @param {string} mensaje 
 * @param {string} imagenPath (Opcional) Ruta local a una imagen
 */
export async function notificarEvento(mensaje, imagenPath = null) {
    const chatId = cargarChatIdAutorizado();
    if (!chatId || !config.telegram.token) return;

    // Usamos una instancia temporal si no hay una activa o simplemente fetch
    // Pero como server.js tiene la instancia, lo ideal es que server.js maneje la instancia.
    // Para simplificar y no depender de estados globales complejos, usamos un bot temporal ligero para el envío
    const botTransmisor = new TelegramBot(config.telegram.token);

    try {
        if (imagenPath && fs.existsSync(imagenPath)) {
            await botTransmisor.sendPhoto(chatId, imagenPath, {
                caption: mensaje,
                parse_mode: 'Markdown'
            });
        } else {
            await botTransmisor.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('[Telegram Notify] Error enviando notificación:', error.message);
    }
}

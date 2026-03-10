import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';

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
        console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado. Bot desactivado.');
        return null;
    }

    const bot = new TelegramBot(config.telegram.token, { polling: true });
    let chatIdAutorizado = cargarChatIdAutorizado();

    console.log('[Telegram] Bot iniciado correctamente.');
    if (chatIdAutorizado) {
        console.log(`[Telegram] Chat ID autorizado: ${chatIdAutorizado}`);
    } else {
        console.log('[Telegram] Esperando primer /start para registrar chat ID...');
    }

    // ── Middleware de autorización ────────────────────────────────────────────
    function esAutorizado(chatId) {
        return !chatIdAutorizado || String(chatId) === String(chatIdAutorizado);
    }

    async function verificar(msg) {
        const chatId = msg.chat.id;
        // Si no hay chat registrado, registrar al primer usuario
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
            `Comandos disponibles:\n\n` +
            `📝 */manual <tema>*\n` +
            `Genera el guion con Qwen y lo envía para que lo revises antes de pasar a Veed.io\n\n` +
            `🚀 */auto <tema>*\n` +
            `Genera el guion y el video automáticamente sin confirmación\n\n` +
            `📊 */estado* — Estado actual\n` +
            `❌ */cancelar* — Cancelar operación en curso`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── /estado ───────────────────────────────────────────────────────────────
    bot.onText(/\/estado/, async (msg) => {
        if (!await verificar(msg)) return;
        const estado = ejecutando
            ? '⏳ Hay una automatización en curso.'
            : '✅ El sistema está libre, listo para usarse.';
        await bot.sendMessage(msg.chat.id, estado);
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
            await bot.sendMessage(msg.chat.id, '⚠️ Hay una automatización en curso que no puede cancelarse desde aquí.');
        }
    });

    // ── Flujo compartido Qwen → (aprobación?) → Veed ─────────────────────────
    async function ejecutarFlujo(chatId, tema, modoManual) {
        if (ejecutando) {
            await bot.sendMessage(chatId, '⚠️ Ya hay una automatización en curso. Espera a que termine.');
            return;
        }

        ejecutando = true;
        try {
            // PASO 1: Generar guion con Qwen
            await bot.sendMessage(chatId, `⏳ Generando guion con Qwen AI para el tema:\n_${tema}_`, { parse_mode: 'Markdown' });
            if (emitirEstado) emitirEstado('Telegram: Generando guion con Qwen...', 10, 'info');

            const resultado = await generarGuion(tema);
            const guion = typeof resultado === 'string' ? resultado : resultado.guion;
            const descripcion = typeof resultado === 'string' ? '' : resultado.descripcion;

            if (emitirEstado) emitirEstado('Telegram: Guion generado', 40, 'success');

            if (modoManual) {
                // ── Modo Manual: enviar para revisión ──────────────────────────────
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

                // Esperar respuesta del inline keyboard (timeout 10 min)
                const decision = await new Promise((resolve) => {
                    pendienteAprobacion = { chatId, guion, descripcion, resolve };
                    setTimeout(() => {
                        if (pendienteAprobacion) {
                            pendienteAprobacion = null;
                            resolve('timeout');
                        }
                    }, 10 * 60 * 1000);
                });

                if (decision !== 'aprobar') {
                    await bot.sendMessage(chatId, decision === 'timeout'
                        ? '⏰ Tiempo agotado. La generación del video fue cancelada.'
                        : '❌ Video cancelado.');
                    return;
                }

                await bot.sendMessage(chatId, '✅ Guion aprobado. Enviando a Veed.io...');
                if (emitirEstado) emitirEstado('Telegram: Guion aprobado, iniciando Veed...', 50, 'info');
                await generarYNotificar(chatId, guion, emitirEstado);

            } else {
                // ── Modo Automático ─────────────────────────────────────────────────
                await bot.sendMessage(chatId,
                    `✅ Guion listo (${guion.length} caracteres). Enviando directamente a Veed.io...`
                );
                if (emitirEstado) emitirEstado('Telegram auto: enviando a Veed...', 50, 'info');
                await generarYNotificar(chatId, guion, emitirEstado);
            }

        } catch (error) {
            console.error('[Telegram] Error en flujo:', error.message);
            await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            if (emitirEstado) emitirEstado(`Telegram error: ${error.message}`, 0, 'error');
        } finally {
            ejecutando = false;
            pendienteAprobacion = null;
        }
    }

    async function generarYNotificar(chatId, guion, emitirEstado) {
        await bot.sendMessage(chatId, '🎬 Generando video en Veed.io... (puede tardar varios minutos)');
        const urlVideo = await generarVideo(guion);
        if (emitirEstado) emitirEstado('Telegram: Video generado exitosamente', 100, 'success');
        await bot.sendMessage(chatId,
            `🎉 *¡Video generado exitosamente!*\n\n🔗 [Abrir en Veed.io](${urlVideo})`,
            { parse_mode: 'Markdown' }
        );
    }

    // ── /manual <tema> ────────────────────────────────────────────────────────
    bot.onText(/\/manual(?:\s+(.+))?/, async (msg, match) => {
        if (!await verificar(msg)) return;
        const tema = match?.[1]?.trim();
        if (!tema) {
            await bot.sendMessage(msg.chat.id, '⚠️ Escribe el tema. Ejemplo:\n`/manual inteligencia artificial`', { parse_mode: 'Markdown' });
            return;
        }
        ejecutarFlujo(msg.chat.id, tema, true);
    });

    // ── /auto <tema> ──────────────────────────────────────────────────────────
    bot.onText(/\/auto(?:\s+(.+))?/, async (msg, match) => {
        if (!await verificar(msg)) return;
        const tema = match?.[1]?.trim();
        if (!tema) {
            await bot.sendMessage(msg.chat.id, '⚠️ Escribe el tema. Ejemplo:\n`/auto computación cuántica`', { parse_mode: 'Markdown' });
            return;
        }
        ejecutarFlujo(msg.chat.id, tema, false);
    });

    // ── Inline keyboard callbacks (aprobar / cancelar) ────────────────────────
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        if (!esAutorizado(chatId)) return;

        await bot.answerCallbackQuery(query.id);

        if (!pendienteAprobacion || pendienteAprobacion.chatId !== chatId) {
            await bot.sendMessage(chatId, 'ℹ️ No hay ninguna aprobación pendiente.');
            return;
        }

        const decision = query.data; // 'aprobar' | 'cancelar'
        pendienteAprobacion.resolve(decision);
        pendienteAprobacion = null;

        // Editar el mensaje del botón para mostrar la decisión
        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { chat_id: chatId, message_id: query.message.message_id }
            );
        } catch (_) { }
    });

    bot.on('polling_error', (error) => {
        console.error('[Telegram] Polling error:', error.message);
    });

    return bot;
}

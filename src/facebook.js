import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Módulo para interactuar con la Graph API de Meta
 * para la publicación de Reels en una Página de Facebook.
 */

const API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Función principal para subir el reel a la página de Facebook
 * y monitorear si pasa la revisión de derechos de autor.
 * @param {string} localVideoPath - Ruta absoluta o relativa al video MP4.
 * @param {string} descripcion - Texto para la descripción del Reel.
 * @param {function} onProgress - Callback(string) para reportar estado.
 * @returns {Promise<boolean>} - True si se publicó con éxito, False si falló.
 */
export async function subirReelAFacebook(localVideoPath, descripcion, onProgress = console.log) {
    const { pageId, accessToken } = config.facebook;

    if (!pageId || !accessToken) {
        onProgress('⚠️ Credentials de Facebook ausentes en config. Omitiendo subida a Facebook.');
        throw new Error('No se ha configurado FB_PAGE_ID o FB_ACCESS_TOKEN.');
    }

    try {
        // 1. Inicializar sesión de subida
        onProgress('Iniciando sesión de subida con Meta Graph API...');
        const videoId = await initUploadSession(pageId, accessToken);
        onProgress(`Sesión inicializada. ID del video: ${videoId}. Subiendo archivo binario...`);

        // 2. Subir el archivo de video pesado
        const uploadSuccess = await uploadVideoContent(pageId, videoId, accessToken, localVideoPath);
        if (!uploadSuccess) throw new Error('Falló la transferencia binaria del video a Meta.');

        // 3. Finalizar y publicar en formato DRAFT primero para revisión de copyright
        onProgress('Transferecia completa. Configurando parámetros del Reel e iniciando revisión...');
        await finishUploadAndPublish(pageId, videoId, accessToken, descripcion, 'DRAFT');

        // 4. Polling (Chequeo de estado y derechos de autor)
        onProgress('El video ha sido recibido por Facebook. Esperando revisión de Copyright... (esto puede tomar un par de minutos)');
        const passedCopyright = await poolCopyrightStatus(videoId, accessToken, onProgress);

        if (passedCopyright) {
            onProgress('✅ ¡Revisión de Copyright pasada exitosamente! Publicando reel en el muro...');
            // Le pedimos explícitamente a Facebook que si era DRAFT lo mude a PUBLISHED
            await updateVideoStatus(videoId, accessToken, 'PUBLISHED');
            onProgress('🎬 ¡Reel publicado correctamente en la página de Facebook!');
            return true;
        } else {
            onProgress('❌ Precaución: El video NO superó la prueba limpia de Copyright o hubo demora. Se dejará como Borrador (DRAFT).');
            return false;
        }

    } catch (error) {
        onProgress(`❌ Error grave interactuando con Facebook API: ${error.message}`);
        throw error;
    }
}


/**
 * PASO 1: Pedir a Facebook un session_id (VIDEO_ID)
 */
async function initUploadSession(pageId, accessToken) {
    const url = `${BASE_URL}/${pageId}/video_reels`;
    const body = new URLSearchParams({
        access_token: accessToken,
        upload_phase: 'start'
    });

    const res = await fetch(url, {
        method: 'POST',
        body: body.toString(),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const data = await res.json();
    if (data.error) throw new Error(`[Start] ${data.error.message}`);
    if (!data.video_id) throw new Error('No se recibió un video_id de Facebook.');

    return data.video_id;
}


/**
 * PASO 2: Leer archivo local con fs, meterlo en un Blob y enviarlo usando fetch
 */
async function uploadVideoContent(pageId, videoId, accessToken, localVideoPath) {
    // Construimos un FormData nativo que Node 18+ soporta
    const url = `https://rupload.facebook.com/video-upload/${API_VERSION}/${videoId}`;

    // Facebook recomienda mandar el Auth Token como parámetro o en la URL
    // En este endpoint de rupload, mandamos el token por Header de Authorization explícitamente
    const buffer = fs.readFileSync(localVideoPath);
    const fileSize = fs.statSync(localVideoPath).size;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${accessToken}`,
            'offset': '0',
            'file_size': String(fileSize),
            'Content-Type': 'application/octet-stream' // Para carga binaria directa
        },
        body: buffer
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`[Upload] ${data.error.message}`);
    }
    return true;
}


/**
 * PASO 3: Dar por cerrado el stream y configurar el titulo (Descripción) e indicarle estado de Borrador
 */
async function finishUploadAndPublish(pageId, videoId, accessToken, descripcion, state = 'DRAFT') {
    const url = `${BASE_URL}/${pageId}/video_reels`;
    const body = new URLSearchParams({
        access_token: accessToken,
        video_id: videoId,
        upload_phase: 'finish',
        video_state: state,
        description: descripcion
    });

    const res = await fetch(url, {
        method: 'POST',
        body: body.toString(),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const data = await res.json();
    if (data.error) throw new Error(`[Finish] ${data.error.message}`);
    if (!data.success) throw new Error('Facebook no devolvió success en finish_upload');
    return true;
}

/**
 * Función repetitiva (Polling) que interroga por el Status del video a FB cada cierto tiempo
 * Esperando a que 'status.video_status' cambie a 'ready'
 * Y comprobando 'status.copyright_check_status'
 */
async function poolCopyrightStatus(videoId, accessToken, onProgress, maxRetries = 60) {
    const url = `${BASE_URL}/${videoId}?fields=status&access_token=${accessToken}`;

    for (let i = 0; i < maxRetries; i++) {
        // Dormimos 15 segundos
        await new Promise(r => setTimeout(r, 15000));

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.error) {
                onProgress(`[Status Checker] API devolvió error temporal... Ignorando.`);
                continue;
            }

            if (data.status) {
                const phase = data.status.video_status;
                const { status: copyStatus } = data.status.copyright_check_status || {};

                const textLog = `[Status FB] Fase render: ${phase} | Copyright: ${copyStatus?.status || 'check_running'}`;
                onProgress(textLog);

                // Si el procesamiento del video falla gravemente
                if (phase === 'error') {
                    throw new Error('Facebook falló al procesar internamente el video.');
                }

                // Si el video ya está listo internamente para ser publicado pero esperamos el check...
                if (phase === 'ready' || phase === 'published') {

                    // Evaluamos la info del Copyright 
                    if (copyStatus && copyStatus.status === 'check_passed') {
                        return true; // Todo en verde!
                    } else if (copyStatus && (copyStatus.status === 'check_failed' || copyStatus.status === 'matches_found')) {
                        return false; // Alerta de copyright! Dejarlo en draft.
                    }

                    // Si el test de copyright aún está corriendo ("check_running"), esperamos la siguiente vuelta.
                    // Si el objeto ni siquiera viene (casos raros), asumimos verde tras 15 intentos en 'ready'
                    if (!copyStatus && i > 15) {
                        onProgress('Facebook omitió metadatos del copyright tras mucho esperar. Asumiendo Safe.');
                        return true;
                    }
                }
            }
        } catch (err) {
            onProgress(`[Status checker loop err] ${err.message}`);
        }
    }

    // Si pasamos todos los intentos y nunca respondió "check_passed"
    onProgress('⏰ Se acabo el tiempo máximo esperando revisión de Meta. Se quedará en borradores.');
    return false;
}

/**
 * PASO ADICIONAL: Muda un video publicado desde Draft a otro Status (como 'PUBLISHED')
 */
async function updateVideoStatus(videoId, accessToken, newStatus = 'PUBLISHED') {
    const url = `${BASE_URL}/${videoId}`;
    const body = new URLSearchParams({
        access_token: accessToken,
        video_state: newStatus
    });

    const res = await fetch(url, {
        method: 'POST',
        body: body.toString(),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const data = await res.json();
    if (data.error) throw new Error(`[Update Status] ${data.error.message}`);
    return true;
}

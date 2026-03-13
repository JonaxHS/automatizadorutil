import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Módulo para interactuar con la Graph API de Meta
 * para la publicación de Reels en una Página de Facebook.
 */

const API_VERSION = 'v22.0';
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

        // 3. Finalizar y publicar en formato DRAFT primero para revisión de copyright obligatoria
        onProgress('Transferecia completa. Configurando parámetros del Reel e iniciando revisión de Derechos de Autor...');
        await finishUploadAndPublish(pageId, videoId, accessToken, descripcion, 'DRAFT');

        // 4. Polling (Chequeo de estado y derechos de autor)
        onProgress('El video ha sido recibido por Facebook. Esperando revisión de Copyright... (Advertencia: Facebook puede tardar hasta 15 minutos en validar)');
        const passedCopyright = await poolCopyrightStatus(videoId, accessToken, onProgress);

        if (passedCopyright) {
            onProgress('✅ ¡Revisión de Copyright pasada exitosamente! Publicando reel en el muro de tu página...');
            // Le pedimos explícitamente a Facebook que si era DRAFT lo mude a PUBLISHED y le reinyectamos la descripción
            await updateVideoStatus(pageId, videoId, accessToken, 'PUBLISHED', descripcion);
            onProgress('🎬 ¡Reel publicado correctamente en la página de Facebook!');
            return true;
        } else {
            onProgress('❌ Precaución: El video NO superó la prueba limpia de Copyright o la API de Facebook sigue estancada. El video NO será publicado y se quedó como Borrador (DRAFT) por seguridad.');
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
 * Extraído de la documentación oficial de Video Reels: fields=copyright_check_information
 */
async function poolCopyrightStatus(videoId, accessToken, onProgress, maxRetries = 60) {
    const url = `${BASE_URL}/${videoId}?fields=copyright_check_information&access_token=${accessToken}`;

    for (let i = 0; i < maxRetries; i++) {
        // Dormimos 15 segundos entre cada consulta
        await new Promise(r => setTimeout(r, 15000));

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.error) {
                onProgress(`[Status Checker] API devolvió error temporal... Ignorando.`);
                continue;
            }

            const copyInfo = data.copyright_check_information;
            if (!copyInfo || !copyInfo.status) {
                onProgress('[Status FB] Esperando a que Meta encole el chequeo de Copyright (metadata aún no disponible)...');
                continue; // Los primeros segundos FB no devuelve el objeto
            }

            const currentStatus = copyInfo.status.status; // 'in_progress' o 'complete'
            const hasMatches = copyInfo.status.matches_found; // boolean

            onProgress(`[Status FB] Estado del Copyright: ${currentStatus}`);

            if (currentStatus === 'complete') {
                if (hasMatches === true) {
                    onProgress('❌ ¡Peligro! Meta detectó música o segmentos con Copyright. Dejando el video en Borradores (DRAFT).');
                    return false;
                } else {
                    return true; // Terminado y sin coincidencias. ¡Listo para publicar!
                }
            } else if (currentStatus === 'error') {
                // Si falla internamente el chequeo
                onProgress('❌ Falló el motor de revisión de Meta ("error"). Por seguridad se dejará como DRAFT.');
                return false;
            }

            // Si es 'in_progress', el for loop saltará a la siguiente vuelta tras 15 seg.

        } catch (err) {
            onProgress(`[Status checker loop err] ${err.message}`);
        }
    }

    // Si pasamos todos los intentos y nunca respondió "complete"
    onProgress('⏰ Se acabo el tiempo máximo esperando revisión de Meta (15 mins). Se quedará en borradores por seguridad.');
    return false;
}

/**
 * PASO ADICIONAL: Muda un video publicado desde Draft a otro Status (como 'PUBLISHED')
 * Para Reels, enviar la descripción aquí de nuevo asegura que Meta no la pierda al sacarlo de Borradores.
 * Importante: Debe hacerse sobre /page_id/video_reels repitiendo 'finish' o lo pasa a post normal sin texto.
 */
async function updateVideoStatus(pageId, videoId, accessToken, newStatus = 'PUBLISHED', descripcion = '') {
    const url = `${BASE_URL}/${pageId}/video_reels`;
    const body = new URLSearchParams({
        access_token: accessToken,
        video_id: videoId,
        upload_phase: 'finish',
        video_state: newStatus,
        description: descripcion // Re-enviar descripción para evitar que FB la borre
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

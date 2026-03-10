import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const STATE_FILE = path.join(process.cwd(), '.auth', 'series-state.json');
const REELS_POR_SERIE = 5;

// ─── Cargar / guardar estado ─────────────────────────────────────────────────
function leerEstado() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (_) { }
    return { serieIndex: 0, reelIndex: 0 };
}

function guardarEstado(estado) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(estado, null, 2), 'utf-8');
}

// ─── Descargar y parsear Google Sheet como CSV ───────────────────────────────
let seriesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

export async function cargarSeries(forzar = false) {
    const ahora = Date.now();
    if (seriesCache && !forzar && ahora - cacheTimestamp < CACHE_TTL) {
        return seriesCache;
    }

    const sheetId = config.googleSheetId;
    if (!sheetId) throw new Error('GOOGLE_SHEET_ID no configurado en .env');

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    console.log(`[Series] Descargando hoja de Google Sheets: ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error al descargar la hoja: HTTP ${response.status}`);

    const csv = await response.text();
    const series = parsearCSV(csv);

    if (series.length === 0) throw new Error('No se encontraron series en la hoja de Google Sheets');

    console.log(`[Series] ${series.length} series cargadas.`);
    seriesCache = series;
    cacheTimestamp = ahora;
    return series;
}

function parsearCSV(csv) {
    const lineas = csv.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return [];

    // Primera fila: encabezados
    const encabezados = parsearFila(lineas[0]).map(h => h.toLowerCase().trim());
    const colTitulo = encabezados.findIndex(h =>
        h.includes('título de la serie') ||
        h.includes('titulo de la serie') ||
        h.includes('título') ||
        h.includes('titulo')
    );

    if (colTitulo === -1) {
        console.warn('[Series] No se encontró columna "Título de la Serie". Usando columna 1 (índice 1).');
    }

    const idx = colTitulo >= 0 ? colTitulo : 1;

    const titulos = [];
    for (let i = 1; i < lineas.length; i++) {
        const cols = parsearFila(lineas[i]);
        const titulo = (cols[idx] || '').trim();
        if (titulo) titulos.push(titulo);
    }
    return titulos;
}

// Parser CSV mínimo que maneja campos entre comillas
function parsearFila(linea) {
    const campos = [];
    let campo = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (c === '"') {
            if (dentroComillas && linea[i + 1] === '"') { campo += '"'; i++; }
            else dentroComillas = !dentroComillas;
        } else if (c === ',' && !dentroComillas) {
            campos.push(campo);
            campo = '';
        } else {
            campo += c;
        }
    }
    campos.push(campo);
    return campos;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Devuelve el prompt que debe enviarse a Qwen para el siguiente reel.
 * También retorna metadata del estado actual.
 */
export async function getPromptSiguiente() {
    const series = await cargarSeries();
    const estado = leerEstado();

    // Asegurar índices válidos
    const serieIndex = Math.min(estado.serieIndex, series.length - 1);
    const reelIndex = Math.min(estado.reelIndex, REELS_POR_SERIE - 1);

    const titulo = series[serieIndex];
    const esNuevaSerie = reelIndex === 0;

    const prompt = esNuevaSerie
        ? `dame un nuevo reel de una nueva serie que se llame "${titulo}"`
        : `dame un nuevo reel`;

    return {
        prompt,
        titulo,
        serieIndex,
        reelIndex,
        totalSeries: series.length,
        esNuevaSerie,
        reelHumano: reelIndex + 1,       // 1-5
        seriesRestantes: series.length - serieIndex - 1
    };
}

/**
 * Avanza el estado al siguiente reel (o siguiente serie si ya completó los 5).
 * Cicla al principio cuando se acaban todas las series.
 */
export async function marcarReelCompletado() {
    const series = await cargarSeries();
    const estado = leerEstado();

    let { serieIndex, reelIndex } = estado;
    reelIndex += 1;

    if (reelIndex >= REELS_POR_SERIE) {
        reelIndex = 0;
        serieIndex = (serieIndex + 1) % series.length;
        console.log(`[Series] Serie completada. Siguiente: "${series[serieIndex]}" (índice ${serieIndex})`);
    }

    const nuevoEstado = { serieIndex, reelIndex };
    guardarEstado(nuevoEstado);
    return nuevoEstado;
}

/**
 * Retorna el estado actual formateado para mostrar en UI / Telegram.
 */
export async function getEstadoSeries() {
    try {
        const series = await cargarSeries();
        const estado = leerEstado();
        const serieIndex = Math.min(estado.serieIndex, series.length - 1);
        const reelIndex = Math.min(estado.reelIndex, REELS_POR_SERIE - 1);
        return {
            serieActual: series[serieIndex],
            serieIndex,
            reelActual: reelIndex + 1,
            totalReelsSerie: REELS_POR_SERIE,
            totalSeries: series.length,
            completados: serieIndex * REELS_POR_SERIE + reelIndex,
            total: series.length * REELS_POR_SERIE,
            seriesArray: series
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Reinicia el progreso al principio (serie 0, reel 0).
 */
export function reiniciarProgreso() {
    guardarEstado({ serieIndex: 0, reelIndex: 0 });
    console.log('[Series] Progreso reiniciado.');
}

/**
 * Salta a un índice de serie específico y al reel especificado (0-4).
 */
export async function seleccionarSerie(serieIndex, reelIndex = 0) {
    const series = await cargarSeries();
    if (serieIndex < 0 || serieIndex >= series.length) {
        throw new Error('Índice de serie fuera de rango');
    }
    const safeReelIndex = Math.max(0, Math.min(reelIndex, REELS_POR_SERIE - 1));
    guardarEstado({ serieIndex, reelIndex: safeReelIndex });
    console.log(`[Series] Saltando a serie "${series[serieIndex]}" (id: ${serieIndex}), reel: ${safeReelIndex}`);
}

export { REELS_POR_SERIE };

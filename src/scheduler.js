import fs from 'fs';
import path from 'path';

const SCHEDULE_FILE = path.join(process.cwd(), '.auth', 'schedule.json');

// Estado interno del scheduler
let isActive = false;
let scheduleTimes = ["09:00", "12:00", "15:00", "18:00", "21:00"]; // horas por defecto
let intervalId = null;
let callbackEjecucion = null;
let ultimaHoraEjecutada = null;

export function initScheduler(onTrigger) {
    callbackEjecucion = onTrigger;
    cargarConfiguracion();

    // Revisar cada minuto
    intervalId = setInterval(checkSchedule, 60000);
    // Revisar inmediatamente al iniciar
    checkSchedule();
}

function cargarConfiguracion() {
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const data = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
            isActive = !!data.active;
            if (Array.isArray(data.times) && data.times.length === 5) {
                scheduleTimes = data.times;
            }
        }
    } catch (e) {
        console.error('[Scheduler] Error cargando configuración:', e);
    }
}

export function guardarConfiguracion(active, times) {
    isActive = !!active;
    if (Array.isArray(times) && times.length === 5) {
        scheduleTimes = times;
    }

    const dir = path.dirname(SCHEDULE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
        active: isActive,
        times: scheduleTimes
    }, null, 2));

    console.log(`[Scheduler] Guardado. Activo: ${isActive}, Horas: ${scheduleTimes.join(', ')}`);
}

export function getState() {
    cargarConfiguracion();
    return {
        active: isActive,
        times: scheduleTimes
    };
}

function checkSchedule() {
    if (!isActive || !callbackEjecucion) return;

    const ahora = new Date();
    // Obtener hora en formato HH:MM (local del servidor)
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;

    // Si ya ejecutamos a esta hora exacta, no volver a ejecutar
    if (ultimaHoraEjecutada === horaActual) return;

    if (scheduleTimes.includes(horaActual)) {
        console.log(`[Scheduler] ⏰ Es la hora programada (${horaActual})! Iniciando ejecución...`);
        ultimaHoraEjecutada = horaActual;
        callbackEjecucion();
    }
}

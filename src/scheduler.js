import fs from 'fs';
import path from 'path';

const SCHEDULE_FILE = path.join(process.cwd(), '.auth', 'schedule.json');
const STATE_FILE = path.join(process.cwd(), '.auth', 'scheduler_state.json');

// Estado interno del scheduler
let isActive = false;
let scheduleTimes = ["09:00", "12:00", "15:00", "18:00", "21:00"]; // horas por defecto
let intervalId = null;
let callbackEjecucion = null;
let ultimaHoraEjecutada = null; // Formato "YYYY-MM-DD HH:MM"

export function initScheduler(onTrigger) {
    callbackEjecucion = onTrigger;
    cargarConfiguracion();
    cargarEstado();

    // Revisar cada 30 segundos para mayor precisión
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkSchedule, 30000);

    // Revisar inmediatamente al iniciar
    checkSchedule();
}

function cargarConfiguracion() {
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const data = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
            isActive = !!data.active;
            if (Array.isArray(data.times)) {
                scheduleTimes = data.times;
            }
        }
    } catch (e) {
        console.error('[Scheduler] Error cargando configuración:', e);
    }
}

function cargarEstado() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            ultimaHoraEjecutada = data.ultimaEjecucion || null;
            console.log(`[Scheduler] Estado cargado. Última ejecución: ${ultimaHoraEjecutada}`);
        }
    } catch (e) {
        console.error('[Scheduler] Error cargando estado:', e);
    }
}

function guardarEstado(fechaHora) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(STATE_FILE, JSON.stringify({
            ultimaEjecucion: fechaHora,
            timestamp: new Date().toISOString()
        }, null, 2));
        ultimaHoraEjecutada = fechaHora;
    } catch (e) {
        console.error('[Scheduler] Error guardando estado:', e);
    }
}

export function guardarConfiguracion(active, times) {
    isActive = !!active;
    if (Array.isArray(times)) {
        scheduleTimes = times;
    }

    const dir = path.dirname(SCHEDULE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
        active: isActive,
        times: scheduleTimes
    }, null, 2));

    console.log(`[Scheduler] Configuración guardada. Activo: ${isActive}, Horas: ${scheduleTimes.join(', ')}`);
}

export function getState() {
    cargarConfiguracion();
    return {
        active: isActive,
        times: scheduleTimes,
        ultimaEjecucion: ultimaHoraEjecutada
    };
}

function checkSchedule() {
    if (!isActive || !callbackEjecucion) return;

    const ahora = new Date();

    // Formato para comparación (YYYY-MM-DD)
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    const fechaActual = `${yyyy}-${mm}-${dd}`;

    // Formato HH:MM para coincidir con la programación
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActualStr = `${horas}:${minutos}`;

    const fechaHoraActual = `${fechaActual} ${horaActualStr}`;

    // Si ya ejecutamos en esta combinación exacta de día y minuto, no hacer nada
    if (ultimaHoraEjecutada === fechaHoraActual) return;

    if (scheduleTimes.includes(horaActualStr)) {
        console.log(`[Scheduler] ⏰ Hora programada detectada: ${horaActualStr} (Hora servidor: ${ahora.toLocaleTimeString()})`);

        // Registrar ejecución ANTES de llamar al callback para evitar loops si el callback falla
        guardarEstado(fechaHoraActual);

        console.log(`[Scheduler] 🚀 Iniciando tarea programada para: ${fechaHoraActual}`);
        callbackEjecucion();
    }
}

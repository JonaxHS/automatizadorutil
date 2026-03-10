// Conectar con el servidor via WebSocket
const socket = io();

// Elementos del DOM
const btnIniciar = document.getElementById('btnIniciar');
const btnTestQwen = document.getElementById('btnTestQwen');
const btnGuardarConfig = document.getElementById('btnGuardarConfig');
const btnActualizarGuiones = document.getElementById('btnActualizarGuiones');
const btnCopiarGuion = document.getElementById('btnCopiarGuion');
const btnCopiarGuionModal = document.getElementById('btnCopiarGuionModal');
const btnEnviarVeed = document.getElementById('btnEnviarVeed');
const btnAuthQwen = document.getElementById('btnAuthQwen');
const btnAuthVeed = document.getElementById('btnAuthVeed');
const btnAuthFinish = document.getElementById('btnAuthFinish');
const btnAuthCancel = document.getElementById('btnAuthCancel');
const btnAuthRefresh = document.getElementById('btnAuthRefresh');

const inputTema = document.getElementById('tema');
const inputQwenChatUrl = document.getElementById('qwenChatUrl');

const statusPanel = document.getElementById('statusPanel');
const resultsPanel = document.getElementById('resultsPanel');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const statusMessage = document.getElementById('statusMessage');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logsContainer = document.getElementById('logs');
const guionPreview = document.getElementById('guionPreview');
const descripcionPreview = document.getElementById('descripcionPreview');
const videoResult = document.getElementById('videoResult');
const historialContainer = document.getElementById('historial');
const guionesLista = document.getElementById('guionesLista');
const connectionStatus = document.getElementById('connectionStatus');
const authStatus = document.getElementById('authStatus');
const authSessionInfo = document.getElementById('authSessionInfo');
const authVncLink = document.getElementById('authVncLink');

const modal = document.getElementById('modalGuion');
const modalClose = document.querySelector('.modal-close');
const modalTitulo = document.getElementById('modalGuionTitulo');
const modalContenido = document.getElementById('modalGuionContenido');

// Estado actual
let estadoActual = {
    ejecutando: false,
    guionActual: null
};

let authState = {
    sessionIdActiva: null,
    noVncUrl: null
};

// Inicialización
window.addEventListener('DOMContentLoaded', () => {
    cargarConfiguracion();
    cargarHistorial();
    cargarGuiones();
    cargarEstadoAuth();
});

// WebSocket eventos
socket.on('connect', () => {
    console.log('Conectado al servidor');
    connectionStatus.textContent = '✓';
    connectionStatus.className = 'connected';
});

socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
    connectionStatus.textContent = '✗';
    connectionStatus.className = 'disconnected';
});

socket.on('estado', (data) => {
    console.log('Estado recibido:', data);
    actualizarEstado(data);
});

socket.on('auth_estado', () => {
    cargarEstadoAuth();
});

async function cargarEstadoAuth() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();

        authState.noVncUrl = data.noVncUrl;

        if (data.sesionesActivas && data.sesionesActivas.length > 0) {
            const sesion = data.sesionesActivas[0];
            authState.sessionIdActiva = sesion.sessionId;
            btnAuthFinish.disabled = false;
            btnAuthCancel.disabled = false;
            authSessionInfo.textContent = `Sesion activa: ${sesion.servicio} (${sesion.sessionId})`;
        } else {
            authState.sessionIdActiva = null;
            btnAuthFinish.disabled = true;
            btnAuthCancel.disabled = true;
            authSessionInfo.textContent = 'No hay sesiones de login activas.';
        }

        authStatus.textContent = data.tieneSesionGuardada
            ? `Sesion guardada detectada. Ultima actualizacion: ${data.metadata?.fecha || 'desconocida'}`
            : 'No hay sesion guardada aun. Inicia login en Qwen y Veed.';

        if (data.noVncUrl) {
            authVncLink.style.display = 'inline-block';
            authVncLink.href = data.noVncUrl;
        }
    } catch (error) {
        authStatus.textContent = 'No se pudo obtener estado de autenticacion.';
    }
}

async function iniciarAuth(servicio) {
    try {
        const response = await fetch('/api/auth/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servicio })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'No se pudo iniciar login.');
        }

        authState.sessionIdActiva = result.sessionId;
        btnAuthFinish.disabled = false;
        btnAuthCancel.disabled = false;

        mostrarNotificacion(`Login de ${servicio} iniciado. Completa login y pulsa Guardar Sesion Actual.`, 'success');

        if (authState.noVncUrl) {
            authVncLink.style.display = 'inline-block';
            authVncLink.href = authState.noVncUrl;
        }

        await cargarEstadoAuth();
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

async function finalizarAuth() {
    if (!authState.sessionIdActiva) {
        mostrarNotificacion('No hay sesion activa para guardar.', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/auth/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: authState.sessionIdActiva })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'No se pudo guardar la sesion.');
        }

        mostrarNotificacion('Sesion guardada correctamente.', 'success');
        await cargarEstadoAuth();
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

async function cancelarAuth() {
    if (!authState.sessionIdActiva) {
        mostrarNotificacion('No hay sesion activa para cancelar.', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/auth/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: authState.sessionIdActiva })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'No se pudo cancelar la sesion.');
        }

        mostrarNotificacion('Sesion de login cancelada.', 'success');
        await cargarEstadoAuth();
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

btnAuthQwen?.addEventListener('click', () => iniciarAuth('qwen'));
btnAuthVeed?.addEventListener('click', () => iniciarAuth('veed'));
btnAuthFinish?.addEventListener('click', finalizarAuth);
btnAuthCancel?.addEventListener('click', cancelarAuth);
btnAuthRefresh?.addEventListener('click', cargarEstadoAuth);

// Enviar guion a Veed.io
btnEnviarVeed?.addEventListener('click', async () => {
    if (!estadoActual.guionActual) {
        mostrarNotificacion('No hay guion disponible. Genera uno primero con Qwen.', 'warning');
        return;
    }

    if (estadoActual.ejecutando) {
        mostrarNotificacion('Ya hay una operación en ejecución', 'warning');
        return;
    }

    const confirmar = confirm('¿Enviar este guion a Veed.io para generar el video? El proceso puede tardar varios minutos.');
    if (!confirmar) return;

    try {
        btnEnviarVeed.disabled = true;
        btnTestQwen.disabled = true;
        btnIniciar.disabled = true;
        estadoActual.ejecutando = true;
        statusPanel.style.display = 'block';
        
        mostrarNotificacion('Enviando guion a Veed.io...', 'info');
        
        const response = await fetch('/api/test-veed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guion: estadoActual.guionActual })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('✅ Video generado en Veed.io exitosamente', 'success');
            videoResult.innerHTML = `<a href="${result.videoUrl}" target="_blank" class="video-link">🎬 Abrir Video en Veed.io</a>`;
        } else {
            mostrarNotificacion(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al enviar a Veed.io', 'error');
        console.error(error);
    } finally {
        btnEnviarVeed.disabled = false;
        btnTestQwen.disabled = false;
        btnIniciar.disabled = false;
        estadoActual.ejecutando = false;
    }
});

// Cargar configuración inicial
async function cargarConfiguracion() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        inputTema.value = config.tema;
        inputQwenChatUrl.value = config.qwenChatUrl || '';
    } catch (error) {
        console.error('Error al cargar configuración:', error);
    }
}

// Guardar configuración
btnGuardarConfig.addEventListener('click', async () => {
    const tema = inputTema.value.trim();
    const qwenChatUrl = inputQwenChatUrl.value.trim();
    
    if (!tema) {
        mostrarNotificacion('Por favor, ingresa un tema', 'error');
        return;
    }

    if (!qwenChatUrl || !qwenChatUrl.startsWith('http')) {
        mostrarNotificacion('Ingresa una URL valida para el chat de Qwen', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tema, qwenChatUrl })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('Configuración guardada', 'success');
        } else {
            mostrarNotificacion(result.error, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al guardar configuración', 'error');
    }
});

// Probar solo generación de guion con Qwen
btnTestQwen.addEventListener('click', async () => {
    const tema = inputTema.value.trim();
    
    if (!tema) {
        mostrarNotificacion('Por favor, ingresa un tema para el guion', 'error');
        return;
    }

    if (estadoActual.ejecutando) {
        mostrarNotificacion('Ya hay una operación en ejecución', 'warning');
        return;
    }
    
    try {
        estadoActual.ejecutando = true;
        btnTestQwen.disabled = true;
        btnIniciar.disabled = true;
        btnEnviarVeed.disabled = true;
        statusPanel.style.display = 'block';
        
        const response = await fetch('/api/test-qwen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tema })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('✅ Guion generado con Qwen exitosamente', 'success');
            resultsPanel.style.display = 'block';
            guionPreview.textContent = result.guion || 'Sin guion detectado';
            descripcionPreview.textContent = result.descripcion || 'Sin descripción detectada';
            
            // Guardar guion para enviarlo a Veed después
            estadoActual.guionActual = result.guion;
            btnEnviarVeed.style.display = 'inline-block';
            
            cargarGuiones();
        } else {
            mostrarNotificacion(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al probar Qwen', 'error');
        console.error(error);
    } finally {
        estadoActual.ejecutando = false;
        btnTestQwen.disabled = false;
        btnIniciar.disabled = false;
        btnEnviarVeed.disabled = false;
    }
});

// Iniciar automatización
btnIniciar.addEventListener('click', async () => {
    const tema = inputTema.value.trim();
    
    if (!tema) {
        mostrarNotificacion('Por favor, ingresa un tema', 'error');
        return;
    }
    
    if (estadoActual.ejecutando) {
        mostrarNotificacion('Ya hay una automatización en ejecución', 'warning');
        return;
    }
    
    btnIniciar.disabled = true;
    btnGuardarConfig.disabled = true;
    inputTema.disabled = true;
    
    statusPanel.style.display = 'block';
    resultsPanel.style.display = 'none';
    logsContainer.innerHTML = '';
    
    try {
        const response = await fetch('/api/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tema })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('Automatización iniciada', 'success');
        } else {
            mostrarNotificacion(result.error, 'error');
            habilitarControles();
        }
    } catch (error) {
        mostrarNotificacion('Error al iniciar automatización', 'error');
        habilitarControles();
    }
});

// Actualizar estado en la UI
function actualizarEstado(data) {
    estadoActual.ejecutando = data.ejecutando;
    
    // Actualizar badge
    statusBadge.className = 'status-badge';
    
    if (data.ejecutando) {
        statusBadge.classList.add('ejecutando');
        statusText.textContent = 'Ejecutando';
    } else if (data.tipo === 'success' && data.progreso === 100) {
        statusBadge.classList.add('completado');
        statusText.textContent = 'Completado';
        habilitarControles();
        cargarHistorial();
        cargarGuiones();
        mostrarResultados();
    } else if (data.tipo === 'error') {
        statusBadge.classList.add('error');
        statusText.textContent = 'Error';
        habilitarControles();
        cargarHistorial();
    } else {
        statusText.textContent = 'Inactivo';
    }
    
    // Actualizar progreso
    progressFill.style.width = data.progreso + '%';
    progressText.textContent = data.progreso + '%';
    
    // Actualizar mensaje
    statusMessage.textContent = data.paso;
    
    // Agregar log
    if (data.paso) {
        agregarLog(data.paso, data.tipo, data.timestamp);
    }
}

// Agregar entrada de log
function agregarLog(mensaje, tipo, timestamp) {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${tipo}`;
    
    const time = new Date(timestamp).toLocaleTimeString();
    logEntry.textContent = `[${time}] ${mensaje}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Habilitar controles
function habilitarControles() {
    btnIniciar.disabled = false;
    btnGuardarConfig.disabled = false;
    inputTema.disabled = false;
}

// Mostrar resultados
async function mostrarResultados() {
    try {
        const response = await fetch('/api/estado');
        const estado = await response.json();
        
        resultsPanel.style.display = 'block';
        
        // Mostrar guion y descripcion
        if (estado.ultimoGuion) {
            guionPreview.textContent = estado.ultimoGuion.contenido || '';
            descripcionPreview.textContent = estado.ultimoGuion.descripcion || 'Sin descripción detectada';
            btnCopiarGuion.style.display = 'inline-flex';
            btnCopiarGuion.onclick = () => copiarTexto(estado.ultimoGuion.contenido || '');
        }
        
        // Mostrar video
        if (estado.ultimoVideo) {
            videoResult.innerHTML = `
                <a href="${estado.ultimoVideo.url}" target="_blank" class="btn btn-primary">
                    🎬 Abrir Video en Veed.io
                </a>
                <p style="margin-top: 10px; color: var(--text-secondary); font-size: 0.9rem;">
                    ${estado.ultimoVideo.url}
                </p>
            `;
        }
    } catch (error) {
        console.error('Error al cargar resultados:', error);
    }
}

// Cargar historial
async function cargarHistorial() {
    try {
        const response = await fetch('/api/historial');
        const historial = await response.json();
        
        if (historial.length === 0) {
            historialContainer.innerHTML = '<p class="placeholder">No hay ejecuciones previas</p>';
            return;
        }
        
        historialContainer.innerHTML = '';
        
        historial.forEach(item => {
            const div = document.createElement('div');
            div.className = `history-item ${item.exito ? 'success' : 'error'}`;
            
            const fecha = new Date(item.fecha).toLocaleString();
            const icono = item.exito ? '✅' : '❌';
            
            div.innerHTML = `
                <div class="history-item-header">
                    <span class="history-item-title">${icono} ${item.exito ? 'Exitoso' : 'Error'}</span>
                    <span class="history-item-date">${fecha}</span>
                </div>
                <div class="history-item-tema">${item.tema}</div>
                ${item.error ? `<div style="color: var(--error); font-size: 0.85rem; margin-top: 5px;">Error: ${item.error}</div>` : ''}
            `;
            
            if (item.guion) {
                div.style.cursor = 'pointer';
                div.onclick = () => verGuion(item.guion);
            }
            
            historialContainer.appendChild(div);
        });
    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

// Cargar guiones
async function cargarGuiones() {
    try {
        const response = await fetch('/api/guiones');
        const guiones = await response.json();
        
        if (guiones.length === 0) {
            guionesLista.innerHTML = '<p class="placeholder">No hay guiones guardados</p>';
            return;
        }
        
        guionesLista.innerHTML = '';
        
        guiones.forEach(guion => {
            const div = document.createElement('div');
            div.className = 'script-item';
            div.onclick = () => verGuion(guion.nombre);
            
            const fecha = new Date(guion.fecha).toLocaleString();
            const tamano = (guion.tamano / 1024).toFixed(2);
            
            div.innerHTML = `
                <div class="script-item-name">📝 ${guion.nombre}</div>
                <div class="script-item-info">${fecha} • ${tamano} KB</div>
            `;
            
            guionesLista.appendChild(div);
        });
    } catch (error) {
        console.error('Error al cargar guiones:', error);
    }
}

// Ver guion en modal
async function verGuion(nombre) {
    try {
        const response = await fetch(`/api/guiones/${nombre}`);
        const data = await response.json();
        
        modalTitulo.textContent = data.nombre;
        modalContenido.textContent = data.contenido;
        
        modal.classList.add('show');
        
        btnCopiarGuionModal.onclick = () => {
            copiarTexto(data.contenido);
            mostrarNotificacion('Guion copiado al portapapeles', 'success');
        };
    } catch (error) {
        mostrarNotificacion('Error al cargar guion', 'error');
    }
}

// Cerrar modal
modalClose.onclick = () => {
    modal.classList.remove('show');
};

modal.onclick = (e) => {
    if (e.target === modal) {
        modal.classList.remove('show');
    }
};

// Actualizar guiones
btnActualizarGuiones.addEventListener('click', cargarGuiones);

// Copiar texto al portapapeles
function copiarTexto(texto) {
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('Copiado al portapapeles', 'success');
    }).catch(() => {
        mostrarNotificacion('Error al copiar', 'error');
    });
}

// Mostrar notificación (simple)
function mostrarNotificacion(mensaje, tipo) {
    // Crear elemento de notificación temporal
    const notif = document.createElement('div');
    notif.textContent = mensaje;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${tipo === 'success' ? 'var(--success)' : tipo === 'error' ? 'var(--error)' : 'var(--warning)'};
        color: white;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// Agregar estilos para animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

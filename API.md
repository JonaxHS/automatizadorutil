# 🔌 Ejemplos de Uso de la API

Esta guía muestra cómo integrar y usar la API del automatizador programáticamente.

## Base URL

- **Local**: `http://localhost:3000`
- **VPS**: `http://tu-servidor.com`

## Endpoints Disponibles

### 1. Obtener Estado Actual

```bash
curl http://localhost:3000/api/estado
```

**Respuesta:**
```json
{
  "ejecutando": false,
  "paso": "Completado",
  "progreso": 100,
  "ultimoError": null,
  "ultimoGuion": {
    "archivo": "guion-2024-01-15.txt",
    "contenido": "...",
    "fecha": "2024-01-15T10:30:00.000Z"
  },
  "ultimoVideo": {
    "url": "https://veed.io/...",
    "fecha": "2024-01-15T10:45:00.000Z"
  },
  "historial": [...]
}
```

### 2. Obtener Configuración

```bash
curl http://localhost:3000/api/config
```

**Respuesta:**
```json
{
  "tema": "Tutorial sobre IA",
  "duracion": 60,
  "qwenChatUrl": "https://chat.qwen.ai/c/...",
  "veedUrl": "https://www.veed.io",
  "headless": false
}
```

### 3. Actualizar Configuración

```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "tema": "Nuevo tema del video",
    "duracion": 90
  }'
```

### 4. Iniciar Automatización

```bash
curl -X POST http://localhost:3000/api/iniciar \
  -H "Content-Type: application/json" \
  -d '{
    "tema": "Explica la inteligencia artificial",
    "duracion": 60
  }'
```

**Respuesta:**
```json
{
  "mensaje": "Automatización iniciada",
  "id": 1705315800000
}
```

### 5. Listar Guiones Guardados

```bash
curl http://localhost:3000/api/guiones
```

**Respuesta:**
```json
[
  {
    "nombre": "guion-2024-01-15T10-30-00.txt",
    "fecha": "2024-01-15T10:30:00.000Z",
    "tamano": 2048
  },
  ...
]
```

### 6. Obtener un Guion Específico

```bash
curl http://localhost:3000/api/guiones/guion-2024-01-15T10-30-00.txt
```

**Respuesta:**
```json
{
  "nombre": "guion-2024-01-15T10-30-00.txt",
  "contenido": "Contenido completo del guion..."
}
```

### 7. Obtener Historial

```bash
curl http://localhost:3000/api/historial
```

**Respuesta:**
```json
[
  {
    "id": 1705315800000,
    "fecha": "2024-01-15T10:30:00.000Z",
    "tema": "Tutorial sobre IA",
    "guion": "guion-2024-01-15T10-30-00.txt",
    "video": "https://veed.io/...",
    "exito": true
  },
  ...
]
```

## WebSocket (Tiempo Real)

### JavaScript

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Conectarse
socket.on('connect', () => {
  console.log('Conectado al servidor');
});

// Recibir actualizaciones de estado
socket.on('estado', (data) => {
  console.log('Estado:', data);
  // {
  //   ejecutando: true,
  //   paso: "Generando guion...",
  //   progreso: 25,
  //   tipo: "info",
  //   timestamp: "2024-01-15T10:30:00.000Z"
  // }
});

// Desconexión
socket.on('disconnect', () => {
  console.log('Desconectado');
});
```

### Python

```python
import socketio

sio = socketio.Client()

@sio.on('connect')
def on_connect():
    print('Conectado al servidor')

@sio.on('estado')
def on_estado(data):
    print('Estado:', data)

@sio.on('disconnect')
def on_disconnect():
    print('Desconectado')

# Conectar
sio.connect('http://localhost:3000')
sio.wait()
```

## Ejemplos de Integración

### Script de Automatización Batch (Bash)

```bash
#!/bin/bash

# Array de temas
temas=(
  "Tutorial sobre Machine Learning"
  "Beneficios de la meditación"
  "Introducción a Python"
  "Historia del Internet"
)

# Procesar cada tema
for tema in "${temas[@]}"; do
  echo "Iniciando: $tema"
  
  curl -X POST http://localhost:3000/api/iniciar \
    -H "Content-Type: application/json" \
    -d "{\"tema\": \"$tema\", \"duracion\": 60}"
  
  # Esperar a que termine (polling cada 30 segundos)
  while true; do
    estado=$(curl -s http://localhost:3000/api/estado | jq -r '.ejecutando')
    
    if [ "$estado" == "false" ]; then
      echo "Completado: $tema"
      break
    fi
    
    sleep 30
  done
  
  # Esperar 1 minuto antes del siguiente
  sleep 60
done

echo "Todos los videos generados!"
```

### Integración con Node.js

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

async function generarVideo(tema, duracion = 60) {
  try {
    // Iniciar automatización
    const { data } = await axios.post(`${API_BASE}/iniciar`, {
      tema,
      duracion
    });
    
    console.log('Automatización iniciada:', data.id);
    
    // Polling para verificar estado
    return await esperarCompletado();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function esperarCompletado() {
  while (true) {
    const { data } = await axios.get(`${API_BASE}/estado`);
    
    if (!data.ejecutando) {
      if (data.ultimoVideo) {
        return {
          exito: true,
          guion: data.ultimoGuion,
          video: data.ultimoVideo
        };
      } else {
        return {
          exito: false,
          error: data.ultimoError
        };
      }
    }
    
    // Esperar 5 segundos antes de verificar de nuevo
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Uso
(async () => {
  const resultado = await generarVideo('Tutorial sobre Docker');
  
  if (resultado.exito) {
    console.log('✅ Video generado:', resultado.video.url);
    console.log('📝 Guion guardado:', resultado.guion.archivo);
  } else {
    console.log('❌ Error:', resultado.error);
  }
})();
```

### Integración con Python

```python
import requests
import time
import json

API_BASE = 'http://localhost:3000/api'

def generar_video(tema, duracion=60):
    # Iniciar automatización
    response = requests.post(
        f'{API_BASE}/iniciar',
        json={'tema': tema, 'duracion': duracion}
    )
    
    if response.status_code == 200:
        print(f"Automatización iniciada: {response.json()['id']}")
        return esperar_completado()
    else:
        print(f"Error: {response.json()['error']}")
        return None

def esperar_completado():
    while True:
        response = requests.get(f'{API_BASE}/estado')
        data = response.json()
        
        if not data['ejecutando']:
            if data['ultimoVideo']:
                return {
                    'exito': True,
                    'guion': data['ultimoGuion'],
                    'video': data['ultimoVideo']
                }
            else:
                return {
                    'exito': False,
                    'error': data['ultimoError']
                }
        
        # Esperar 5 segundos
        time.sleep(5)

# Uso
if __name__ == '__main__':
    resultado = generar_video('Tutorial sobre Kubernetes')
    
    if resultado and resultado['exito']:
        print(f"✅ Video generado: {resultado['video']['url']}")
        print(f"📝 Guion guardado: {resultado['guion']['archivo']}")
    else:
        print(f"❌ Error: {resultado['error']}")
```

## Webhooks (Futuro)

En futuras versiones se podrá configurar webhooks para recibir notificaciones cuando termine una automatización:

```javascript
// Configuración futura
POST /api/webhooks
{
  "url": "https://tu-servidor.com/webhook",
  "eventos": ["completado", "error"]
}
```

## Rate Limiting

Actualmente no hay límites de rate, pero se recomienda:
- No iniciar más de 1 automatización simultánea
- Esperar al menos 2 minutos entre automatizaciones
- Monitorear el estado antes de iniciar una nueva

## Autenticación

En esta versión no hay autenticación. Para producción, considera:
- Configurar autenticación básica en Nginx
- Usar un VPN para acceso restringido
- Implementar tokens JWT (futura mejora)

## Soporte CORS

Si necesitas hacer peticiones desde otro dominio:

Modifica `src/server.js`:

```javascript
import cors from 'cors';

app.use(cors({
  origin: 'https://tu-frontend.com',
  credentials: true
}));
```

---

¿Tienes más preguntas? Revisa el [README.md](README.md) principal.

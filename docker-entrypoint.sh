#!/usr/bin/env bash
set -e

export DISPLAY=${DISPLAY:-:99}
export NOVNC_PORT=${NOVNC_PORT:-6080}
export APP_PORT=${PORT:-3000}

echo "Iniciando entorno grafico virtual en ${DISPLAY}..."
Xvfb "${DISPLAY}" -screen 0 1920x1080x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &

sleep 1

echo "Iniciando window manager (fluxbox)..."
fluxbox >/tmp/fluxbox.log 2>&1 &

echo "Iniciando servidor VNC (x11vnc)..."
x11vnc -display "${DISPLAY}" -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &

echo "Iniciando noVNC/websockify en puerto ${NOVNC_PORT}..."
websockify --web=/usr/share/novnc/ "${NOVNC_PORT}" localhost:5900 >/tmp/novnc.log 2>&1 &

echo "Iniciando servidor web Node en puerto ${APP_PORT}..."
exec node src/server.js

#!/usr/bin/env bash
set -e

REPO_URL="${REPO_URL:-https://github.com/JonaxHS/automatizadorutil.git}"
APP_DIR="${APP_DIR:-/opt/automatizadorutil}"
APP_PORT="${APP_PORT:-3000}"
NOVNC_PORT="${NOVNC_PORT:-6080}"

if [[ "$EUID" -ne 0 ]]; then
  echo "Ejecuta este instalador como root o con sudo."
  exit 1
fi

echo "[1/7] Instalando dependencias del sistema..."
apt-get update -y
apt-get install -y ca-certificates curl git ufw

echo "[2/7] Instalando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "[3/7] Instalando Docker Compose plugin..."
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

echo "[4/7] Descargando/actualizando proyecto en ${APP_DIR}..."
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" pull --ff-only
else
  rm -rf "${APP_DIR}"
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

echo "[5/7] Configurando entorno..."
if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# Forzar modo recomendado para VPS
if grep -q '^HEADLESS=' .env; then
  sed -i 's/^HEADLESS=.*/HEADLESS=true/' .env
else
  echo 'HEADLESS=true' >> .env
fi

if grep -q '^PORT=' .env; then
  sed -i "s/^PORT=.*/PORT=${APP_PORT}/" .env
else
  echo "PORT=${APP_PORT}" >> .env
fi

if grep -q '^NOVNC_PORT=' .env; then
  sed -i "s/^NOVNC_PORT=.*/NOVNC_PORT=${NOVNC_PORT}/" .env
else
  echo "NOVNC_PORT=${NOVNC_PORT}" >> .env
fi

echo "[6/7] Levantando contenedores..."
docker compose down || true
docker compose build --no-cache
docker compose up -d

echo "[7/7] Configurando firewall (si esta activo ufw)..."
if ufw status | grep -q "Status: active"; then
  ufw allow "${APP_PORT}/tcp" || true
  ufw allow "${NOVNC_PORT}/tcp" || true
fi

IP_ADDR=$(hostname -I | awk '{print $1}')

echo ""
echo "Instalacion completada."
echo "Panel web:      http://${IP_ADDR}:${APP_PORT}"
echo "Escritorio VNC: http://${IP_ADDR}:${NOVNC_PORT}/vnc.html?autoconnect=true&resize=remote"
echo ""
echo "Flujo de login desde interfaz:"
echo "1) Abre el panel web y usa 'Iniciar Login Qwen'/'Iniciar Login Veed'."
echo "2) Abre noVNC para interactuar con el navegador remoto."
echo "3) Luego pulsa 'Guardar Sesion Actual' en el panel."

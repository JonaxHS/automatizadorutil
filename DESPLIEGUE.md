# 🚀 Guía de Despliegue en VPS con Docker

Esta guía te ayudará a desplegar el automatizador de videos en un VPS usando Docker.

## 📋 Requisitos del VPS

- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **RAM**: Mínimo 4GB (Recomendado 8GB)
- **CPU**: Mínimo 2 cores
- **Disco**: Mínimo 20GB
- **Software necesario**: Docker y Docker Compose

## 🔧 Instalación en el VPS

### 1. Conectarse al VPS

```bash
ssh usuario@tu-vps-ip
```

### 2. Instalar Docker y Docker Compose

#### En Ubuntu/Debian:

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Agregar tu usuario al grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose -y

# Verificar instalación
docker --version
docker-compose --version
```

#### En CentOS/RHEL:

```bash
# Instalar Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io -y

# Iniciar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. Subir el Proyecto al VPS

#### Opción A: Usando Git (Recomendado)

```bash
# En tu VPS
cd /opt
sudo git clone https://github.com/tu-usuario/automatizador-veed.git
cd automatizador-veed
```

#### Opción B: Usando SCP/SFTP

```bash
# Desde tu computadora local
scp -r /ruta/al/proyecto usuario@tu-vps-ip:/opt/automatizador-veed
```

#### Opción C: Usando rsync

```bash
# Desde tu computadora local
rsync -avz --progress /ruta/al/proyecto/ usuario@tu-vps-ip:/opt/automatizador-veed/
```

### 4. Configurar Variables de Entorno

```bash
cd /opt/automatizador-veed

# Copiar el archivo de ejemplo
cp .env.example .env

# Editar el archivo .env
nano .env
```

Configuración recomendada para VPS:

```env
# IMPORTANTE: En VPS, HEADLESS debe ser true
HEADLESS=true

# URLs
QWEN_CHAT_URL=https://chat.qwen.ai/c/tu-chat-id-aqui
VEED_URL=https://www.veed.io

# Credenciales de Veed.io (si es necesario)
VEED_EMAIL=
VEED_PASSWORD=

# Configuración del video
VIDEO_TEMA=Crea un tutorial interesante
VIDEO_DURACION=60

# Timeouts (en milisegundos)
TIMEOUT_NAVIGATION=90000
TIMEOUT_GENERATION=300000

# Puerto del servidor web
PORT=3000
```

### 5. Construir y Ejecutar el Contenedor

```bash
# Construir la imagen Docker
docker-compose build

# Iniciar el contenedor
docker-compose up -d

# Ver los logs
docker-compose logs -f
```

## 🌐 Configurar Acceso Web

### Opción 1: Acceso Directo por IP (Simple)

Accede a través de: `http://tu-vps-ip:3000`

### Opción 2: Configurar Nginx como Proxy Reverso (Recomendado)

#### Instalar Nginx

```bash
sudo apt install nginx -y
```

#### Crear configuración de sitio

```bash
sudo nano /etc/nginx/sites-available/automatizador
```

```nginx
server {
    listen 80;
    server_name tu-dominio.com;  # O tu IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Activar el sitio

```bash
sudo ln -s /etc/nginx/sites-available/automatizador /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Opción 3: Configurar HTTPS con Let's Encrypt (Seguro)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado SSL
sudo certbot --nginx -d tu-dominio.com

# El certificado se renovará automáticamente
```

## 🔒 Seguridad

### 1. Configurar Firewall

```bash
# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Si accedes directamente por puerto 3000
sudo ufw allow 3000/tcp

# Activar firewall
sudo ufw enable
```

### 2. Protección con Contraseña (Opcional)

Agregar autenticación básica en Nginx:

```bash
# Instalar herramientas
sudo apt install apache2-utils -y

# Crear usuario y contraseña
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Editar configuración de Nginx
sudo nano /etc/nginx/sites-available/automatizador
```

Agregar en el bloque `location /`:

```nginx
auth_basic "Área Restringida";
auth_basic_user_file /etc/nginx/.htpasswd;
```

```bash
# Reiniciar Nginx
sudo systemctl restart nginx
```

## 📊 Comandos Útiles de Docker

```bash
# Ver contenedores en ejecución
docker ps

# Ver logs en tiempo real
docker-compose logs -f

# Detener el contenedor
docker-compose down

# Reiniciar el contenedor
docker-compose restart

# Ver uso de recursos
docker stats

# Entrar al contenedor (debugging)
docker exec -it automatizador-veed bash

# Ver imágenes
docker images

# Limpiar contenedores detenidos
docker system prune -a
```

## 🔄 Actualizar la Aplicación

```bash
# Detener el contenedor
docker-compose down

# Actualizar código (si usas Git)
git pull

# Reconstruir la imagen
docker-compose build

# Iniciar nuevamente
docker-compose up -d
```

## 🐛 Solución de Problemas

### El contenedor no inicia

```bash
# Ver logs detallados
docker-compose logs

# Verificar configuración
docker-compose config
```

### Error de memoria

Aumentar recursos en `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 8G
```

### Playwright no funciona

Asegúrate de que `HEADLESS=true` en el `.env` y que el contenedor tenga suficientes recursos.

### No se puede conectar al WebSocket

Verifica la configuración de Nginx para WebSocket (sección arriba).

### Ver logs de la aplicación

```bash
# Logs del contenedor
docker-compose logs -f

# Logs de la aplicación (dentro del contenedor)
docker exec automatizador-veed tail -f logs/*.json
```

## 📈 Monitoreo

### Verificar estado del servicio

```bash
# Estado del contenedor
docker-compose ps

# Uso de recursos
docker stats automatizador-veed

# Espacio en disco
df -h
```

### Configurar auto-reinicio

El `docker-compose.yml` ya incluye `restart: unless-stopped`, lo que significa que el contenedor se reiniciará automáticamente si se detiene o si el servidor se reinicia.

## 🔐 Backup

### Hacer backup de datos importantes

```bash
# Backup de guiones, screenshots y logs
tar -czf backup-$(date +%Y%m%d).tar.gz guiones/ screenshots/ logs/ .env

# Mover backup a lugar seguro
scp backup-*.tar.gz usuario@servidor-backup:/backups/
```

### Automatizar backups con cron

```bash
crontab -e
```

Agregar:

```cron
# Backup diario a las 2 AM
0 2 * * * cd /opt/automatizador-veed && tar -czf /backups/backup-$(date +\%Y\%m\%d).tar.gz guiones/ screenshots/ logs/ .env
```

## 📱 Acceso Remoto

Una vez desplegado, accede desde cualquier lugar:

- **Sin dominio**: `http://tu-vps-ip:3000`
- **Con Nginx**: `http://tu-dominio.com`
- **Con SSL**: `https://tu-dominio.com`

## 🎉 ¡Listo!

Tu automatizador ahora está corriendo 24/7 en tu VPS y puedes acceder a él desde cualquier dispositivo con un navegador web.

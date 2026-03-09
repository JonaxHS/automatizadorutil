FROM node:20-bullseye

# Instalar dependencias del sistema necesarias para Playwright
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de la aplicación
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Instalar navegadores de Playwright
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copiar el resto de la aplicación
COPY . .

# Crear directorios necesarios
RUN mkdir -p screenshots guiones videos logs

# Exponer el puerto del servidor web
EXPOSE 3000

# Comando para iniciar el servidor
CMD ["node", "src/server.js"]

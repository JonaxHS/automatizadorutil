# 🔐 Guía de Autenticación con Google

Esta guía explica cómo configurar el inicio de sesión con Google para Qwen AI y Veed.io.

## 🎯 Cómo Funciona

El sistema utiliza **sesión persistente del navegador**, lo que significa:

1. **Primera vez**: Inicias sesión manualmente en un navegador que se abre automáticamente
2. **Guardado**: El sistema guarda todas las cookies y el estado de sesión
3. **Automático**: En futuras ejecuciones, la sesión se reutiliza sin necesidad de login manual

### Ventajas de este Método

✅ **Seguro**: No guardamos contraseñas  
✅ **Compatible**: Funciona con login de Google OAuth  
✅ **Persistente**: La sesión dura semanas/meses  
✅ **Simple**: Solo configuras una vez  
✅ **Legal**: Cumple con los términos de servicio  

## 📋 Configuración Inicial (Solo Una Vez)

### Paso 1: Ejecutar el Asistente de Configuración

```bash
npm run setup-auth
```

Este comando abrirá un asistente interactivo que te guiará paso a paso.

### Paso 2: Configurar Qwen AI

1. El navegador se abrirá en Qwen AI
2. Haz clic en "Sign In" o "Iniciar Sesión"
3. Selecciona "Continue with Google"
4. Inicia sesión con tu cuenta de Google
5. Espera a que estés completamente autenticado (verás tu avatar/nombre)
6. **Cierra el navegador** cuando estés dentro

### Paso 3: Configurar Veed.io

1. El navegador se abrirá en Veed.io
2. Haz clic en "Sign In" o "Iniciar Sesión"
3. Selecciona "Continue with Google"
4. Inicia sesión con tu cuenta de Google
5. Espera a que estés completamente autenticado
6. **Cierra el navegador** cuando estés dentro

### Paso 4: ¡Listo!

Ya puedes usar el automatizador. Las sesiones se reutilizarán automáticamente.

```bash
# Iniciar servidor web
npm start

# O modo CLI
npm run cli
```

## 🔄 Reconfigurar Sesiones

Si las sesiones expiran o cambias de cuenta:

```bash
npm run setup-auth
```

El asistente detectará que ya hay sesiones y te preguntará si deseas reconfigurar.

## 📂 Archivos de Sesión

Las sesiones se guardan en:

```
.auth/
├── storage-state.json    # Estado del navegador (cookies, localStorage)
└── browser-state.json    # Metadatos
```

**⚠️ IMPORTANTE**: Estos archivos contienen información sensible. No los compartas ni los subas a Git.

## 🐳 Configuración en Docker

Para usar autenticación en contenedores Docker:

### Opción 1: Configurar Localmente y Copiar

```bash
# 1. Configura en tu máquina local
npm run setup-auth

# 2. Copia los archivos al servidor
scp -r .auth usuario@servidor:/ruta/automatizador/

# 3. Construye y ejecuta el contenedor
docker-compose up -d
```

### Opción 2: Montar Volumen Docker

Actualiza `docker-compose.yml`:

```yaml
volumes:
  - ./.auth:/app/.auth
  - ./screenshots:/app/screenshots
  - ./guiones:/app/guiones
```

Luego ejecuta el setup:

```bash
# En el servidor, ejecuta una vez
docker-compose run automatizador npm run setup-auth
```

## 🛠️ Solución de Problemas

### "No autenticado en Qwen AI"

**Causa**: No hay sesión guardada o expiró.

**Solución**:
```bash
npm run setup-auth
```

### "Sesión expirada. Re-ejecuta setup-auth"

**Causa**: Las cookies expiraron (usualmente después de 30-90 días).

**Solución**:
```bash
npm run setup-auth
```

### El navegador no se abre durante setup-auth

**Causa**: Puede estar en modo headless.

**Solución**: Verifica que `HEADLESS=false` en `.env` durante el setup.

### "Permission denied" al guardar sesión

**Causa**: Permisos de archivos.

**Solución**:
```bash
mkdir -p .auth
chmod 755 .auth
```

### Las sesiones no se guardan en Docker

**Causa**: El volumen no está montado correctamente.

**Solución**: Verifica el `docker-compose.yml` y asegúrate de que `.auth` esté en volumes.

## 🔒 Seguridad

### ¿Es seguro guardar las sesiones?

✅ **Sí**, siempre y cuando:

- No compartas los archivos de `.auth/`
- Mantengas tu servidor seguro
- No subas `.auth/` a repositorios públicos

### ¿Qué datos se guardan?

- **Cookies de sesión**: Para mantener el login
- **localStorage**: Preferencias del navegador
- **sessionStorage**: Estado temporal

**NO se guardan**:
- ❌ Contraseñas
- ❌ Tokens de acceso permanentes
- ❌ Información de tarjetas de crédito

### Proteger los Archivos de Sesión

```bash
# Asegurar que .auth/ esté en .gitignore
echo ".auth/" >> .gitignore

# Establecer permisos restrictivos
chmod 700 .auth/
chmod 600 .auth/*
```

### En Servidores Compartidos

Si trabajas en un servidor compartido:

```bash
# Encriptar archivos de sesión
gpg -c .auth/storage-state.json

# Desencriptar antes de usar
gpg .auth/storage-state.json.gpg
```

## 📊 Verificar Estado de Sesiones

Para verificar si hay sesiones guardadas:

```bash
# Linux/Mac
ls -lah .auth/

# Verificar fecha de creación
stat .auth/storage-state.json
```

## 🔄 Ciclo de Vida de las Sesiones

```
1. Setup Initial      → npm run setup-auth
   ↓
2. Sesión Guardada    → .auth/storage-state.json
   ↓
3. Uso Normal         → 30-90 días (promedio)
   ↓
4. Sesión Expira      → Error: "No autenticado"
   ↓
5. Reconfigurar       → npm run setup-auth
```

## 💡 Consejos

1. **Ejecuta setup-auth localmente primero** (con `HEADLESS=false`) para ver el proceso
2. **Después configura en el servidor** con los volúmenes montados
3. **Verifica mensajes de consola** para detectar problemas de autenticación temprano
4. **Re-ejecuta setup-auth** si cambias de cuenta de Google
5. **Mantén backups** de `.auth/` si las sesiones son críticas

## 🌐 Usar Diferentes Cuentas

Si necesitas usar diferentes cuentas de Google:

```bash
# Opción 1: Reconfigurar con nueva cuenta
npm run setup-auth

# Opción 2: Usar perfiles separados
# Crea diferentes directorios con sus propios .env y .auth/
```

## ❓ Preguntas Frecuentes

### ¿Puedo usar sin cuenta de Google?

No, tanto Qwen AI como Veed.io requieren autenticación con Google para acceder a sus funcionalidades de IA.

### ¿Cuánto duran las sesiones?

Típicamente 30-90 días, dependiendo de las políticas de cada servicio.

### ¿Funciona en modo headless?

Sí, pero el **setup inicial debe hacerse en modo visible** (`HEADLESS=false`). Después puedes usar `HEADLESS=true`.

### ¿Puedo automatizar el login de Google?

No recomendado. Va contra los términos de servicio de Google y puede resultar en bloqueo de cuenta.

### ¿Qué pasa si Google pide verificación 2FA?

Durante el setup, completa la verificación normalmente. La sesión guardada no requerirá 2FA en futuras ejecuciones.

---

## 📞 Soporte

Si tienes problemas con la autenticación:

1. Revisa los logs en consola
2. Verifica screenshots en `screenshots/`
3. Re-ejecuta `npm run setup-auth`
4. Verifica que `.auth/` tenga los permisos correctos

---

¡Disfruta del automatizador! 🎉

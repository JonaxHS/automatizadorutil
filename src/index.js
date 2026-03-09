import fs from 'fs';
import path from 'path';
import { generarGuion } from './qwen.js';
import { generarVideo } from './veed.js';
import { config } from '../config.js';

/**
 * Script principal que coordina la generación de videos
 */
async function main() {
  console.log('🚀 Automatizador de Videos - Qwen + Veed.io');
  console.log('='.repeat(50));
  console.log('');
  
  try {
    // Crear carpetas necesarias si no existen
    const carpetas = ['screenshots', 'guiones'];
    for (const carpeta of carpetas) {
      if (!fs.existsSync(carpeta)) {
        fs.mkdirSync(carpeta, { recursive: true });
      }
    }
    
    // Obtener el tema del video
    const tema = config.video.tema;
    console.log('📋 Tema del video:', tema);
    console.log('⏱️  Duración objetivo:', config.video.duracion, 'segundos');
    console.log('');
    
    // PASO 1: Generar guion con Qwen
    console.log('═'.repeat(50));
    console.log('PASO 1: Generar guion con Qwen AI');
    console.log('═'.repeat(50));
    console.log('');
    
    const guion = await generarGuion(tema);
    
    // Guardar el guion en un archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreArchivo = `guion-${timestamp}.txt`;
    const rutaGuion = path.join('guiones', nombreArchivo);
    
    fs.writeFileSync(rutaGuion, guion, 'utf-8');
    console.log('💾 Guion guardado en:', rutaGuion);
    console.log('');
    console.log('📄 Contenido del guion:');
    console.log('-'.repeat(50));
    console.log(guion);
    console.log('-'.repeat(50));
    console.log('');
    
    // PASO 2: Generar video en Veed.io
    console.log('═'.repeat(50));
    console.log('PASO 2: Generar video en Veed.io');
    console.log('═'.repeat(50));
    console.log('');
    
    const resultado = await generarVideo(guion);
    
    console.log('');
    console.log('═'.repeat(50));
    console.log('✅ PROCESO COMPLETADO');
    console.log('═'.repeat(50));
    console.log('');
    console.log('📊 Resumen:');
    console.log('  • Guion generado:', rutaGuion);
    console.log('  • URL del proyecto:', resultado);
    console.log('  • Screenshots en: screenshots/');
    console.log('');
    console.log('🎉 ¡Video automatizado exitosamente!');
    
  } catch (error) {
    console.error('');
    console.error('═'.repeat(50));
    console.error('❌ ERROR EN EL PROCESO');
    console.error('═'.repeat(50));
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('💡 Sugerencias:');
    console.error('  • Revisa los screenshots en la carpeta screenshots/');
    console.error('  • Verifica que las URLs en .env sean correctas');
    console.error('  • Asegúrate de tener credenciales válidas si es necesario');
    console.error('  • Intenta ejecutar con HEADLESS=false para ver el proceso');
    console.error('');
    process.exit(1);
  }
}

// Ejecutar el script
main();

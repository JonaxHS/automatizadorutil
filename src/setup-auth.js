import { autenticacionInteractiva, limpiarSesiones, tieneSesionGuardada } from './auth.js';
import { config } from '../config.js';
import readline from 'readline';

/**
 * Script de configuración inicial de autenticaciones
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function pregunta(texto) {
  return new Promise((resolve) => {
    rl.question(texto, resolve);
  });
}

async function main() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🔧 CONFIGURACIÓN INICIAL DE AUTENTICACIONES');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Este asistente te ayudará a configurar las autenticaciones necesarias');
  console.log('para Qwen AI y Veed.io usando tu cuenta de Google.');
  console.log('');
  console.log('ℹ️  Solo necesitas hacer esto UNA VEZ. Después las sesiones se');
  console.log('   reutilizarán automáticamente.');
  console.log('');
  
  // Verificar si ya hay sesiones
  if (tieneSesionGuardada()) {
    console.log('⚠️  Ya existe una sesión guardada.');
    const respuesta = await pregunta('¿Deseas reconfigurar? (s/n): ');
    
    if (respuesta.toLowerCase() !== 's') {
      console.log('✅ Manteniendo sesión actual.');
      rl.close();
      return;
    }
    
    console.log('🗑️  Eliminando sesiones anteriores...');
    limpiarSesiones();
    console.log('');
  }
  
  console.log('═'.repeat(70));
  console.log('PASO 1: Configurar Qwen AI');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Se abrirá el navegador para que inicies sesión en Qwen AI.');
  console.log('');
  const respuesta1 = await pregunta('¿Continuar? (s/n): ');
  
  if (respuesta1.toLowerCase() === 's') {
    try {
      await autenticacionInteractiva('Qwen AI', config.qwenChatUrl);
      console.log('✅ Qwen AI configurado correctamente');
    } catch (error) {
      console.error('❌ Error al configurar Qwen AI:', error.message);
    }
  }
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('PASO 2: Configurar Veed.io');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Se abrirá el navegador para que inicies sesión en Veed.io.');
  console.log('');
  const respuesta2 = await pregunta('¿Continuar? (s/n): ');
  
  if (respuesta2.toLowerCase() === 's') {
    try {
      await autenticacionInteractiva('Veed.io', config.veedUrl);
      console.log('✅ Veed.io configurado correctamente');
    } catch (error) {
      console.error('❌ Error al configurar Veed.io:', error.message);
    }
  }
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('✅ CONFIGURACIÓN COMPLETADA');
  console.log('═'.repeat(70));
  console.log('');
  console.log('🎉 Ahora puedes usar el automatizador sin necesidad de iniciar sesión');
  console.log('   manualmente cada vez.');
  console.log('');
  console.log('💡 Para ejecutar el automatizador:');
  console.log('   • Modo web: npm start');
  console.log('   • Modo CLI: npm run cli');
  console.log('');
  console.log('🔄 Si necesitas reconfigurar las sesiones en el futuro:');
  console.log('   npm run setup-auth');
  console.log('');
  
  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

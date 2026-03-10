import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Configuración del navegador
  headless: process.env.HEADLESS === 'true',

  // URLs
  qwenChatUrl: process.env.QWEN_CHAT_URL || 'https://chat.qwen.ai',
  veedUrl: process.env.VEED_URL || 'https://www.veed.io',

  // Credenciales de Veed.io
  veed: {
    email: process.env.VEED_EMAIL,
    password: process.env.VEED_PASSWORD
  },

  // Configuración del video
  video: {
    tema: process.env.VIDEO_TEMA || 'Explica un tema interesante',
    duracion: parseInt(process.env.VIDEO_DURACION) || 60
  },

  // Timeouts
  timeouts: {
    navigation: parseInt(process.env.TIMEOUT_NAVIGATION) || 120000,
    generation: parseInt(process.env.TIMEOUT_GENERATION) || 300000
  },

  // Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  }
};

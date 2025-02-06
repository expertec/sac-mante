const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const QRCode = require('qrcode');

let socket; // Conexión activa
let currentQrCode = null; // QR actual en formato base64

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  try {
    const { version } = await fetchLatestBaileysVersion();

    socket = makeWASocket({
      auth: state,
      logger: Pino({ level: 'info' }),
      version,
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection, qr } = update;

      if (qr) {
        try {
          currentQrCode = await QRCode.toDataURL(qr); // Genera QR en formato base64
          console.log('QR actualizado y disponible para escanear.');
        } catch (err) {
          console.error('Error al generar el QR:', err);
        }
      } else {
        currentQrCode = null;
      }

      if (connection === 'open') {
        console.log('¡Conexión a WhatsApp exitosa!');
        currentQrCode = null;
      }

      if (connection === 'close') {
        const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Conexión cerrada. ¿Reconectar?', shouldReconnect);
        if (shouldReconnect) connectToWhatsApp();
      }
    });

    socket.ev.on('creds.update', saveCreds);
  } catch (error) {
    console.error('Error al conectar con WhatsApp:', error);
  }
}

async function sendMessage(to, message) {
  if (!socket) {
    throw new Error('WhatsApp no está conectado.');
  }

  try {
    // Verificar si se está enviando una imagen
    if (message.imageUrl) {
      await socket.sendMessage(`${to}@s.whatsapp.net`, {
        image: { url: message.imageUrl }, // Enviar la imagen desde la URL
        caption: message.text || '', // Texto opcional como pie de imagen
      });
    } else {
      // Si no hay imagen, enviar solo texto
      await socket.sendMessage(`${to}@s.whatsapp.net`, {
        text: message.text,
      });
    }
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    throw new Error('No se pudo enviar el mensaje. Verifica el número de teléfono y la conexión.');
  }
}



function getWhatsAppStatus() {
  if (socket?.user) {
    return { status: 'connected', phone: socket.user.id };
  }
  return { status: currentQrCode ? 'qr' : 'disconnected' };
}

function getCurrentQrCode() {
  return currentQrCode;
}

module.exports = {
  connectToWhatsApp,
  getCurrentQrCode,
  getWhatsAppStatus,
  sendMessage, // Verifica que esta línea esté incluida
};


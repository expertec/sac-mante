require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const db = require('./config/firebase');
const { getCurrentQrCode } = require('./whatsapp/whatsappClient');
const agentsRoutes = require("./routes/users"); // Ruta del archivo donde defines el endpoint




let currentQrCode = null;


const {
  connectToWhatsApp,
  getWhatsAppStatus,
  sendMessage, // Agregado para manejar el envío de mensajes
} = require('./whatsapp/whatsappClient');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './firebase-credentials.json';

    if (!serviceAccountPath) {
      throw new Error('La variable de entorno GOOGLE_APPLICATION_CREDENTIALS no está configurada correctamente o el archivo no existe.');
    }

    admin.initializeApp({
      credential: admin.credential.cert(require('./firebase-credentials.json')),
    });

    console.log('Firebase Admin inicializado correctamente.');
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error.message);
    process.exit(1);
  }
}

const auth = admin.auth(); // Instancia única de Firebase Auth

// Inicializar Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Aumenta el límite si el comprobante es pesado


// Ruta principal
app.get('/', (req, res) => {
  res.send('API del Backend de Autenticación');
});
app.get('/api/whatsapp/phone', (req, res) => {
  const status = getWhatsAppStatus();

  if (status.status === 'connected') {
    return res.json({ phoneNumber: status.phone });
  }

  res.status(404).json({ error: 'No hay una sesión activa de WhatsApp.' });
});

// Endpoint para enviar el comprobante por WhatsApp
app.post('/api/whatsapp/send', async (req, res) => {
  const { phoneNumber, message, imageUrl } = req.body;

  try {
    console.log('Enviando payload a WhatsApp:', { phoneNumber, message, imageUrl }); // Log para verificar datos

    const payload = { text: message };

    if (imageUrl) {
      payload.imageUrl = imageUrl; // Agregar la URL de la imagen si está disponible
    }

    await sendMessage(phoneNumber, payload); // Llama a sendMessage con el payload modificado
    res.status(200).send('Mensaje enviado exitosamente');
  } catch (error) {
    console.error('Error al enviar el mensaje:', error);
    res.status(500).send('No se pudo enviar el mensaje');
  }
});


// Registro de Usuario por Admin
app.post('/api/register-user', async (req, res) => {
  const { name, email, role } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password: 'cobrador123456', // Contraseña temporal para nuevos usuarios
      displayName: name,
    });

    const userId = userRecord.uid;

    await db.collection('users').doc(userId).set({
      name,
      email,
      role,
      createdAt: new Date(),
    });

    res.status(201).json({
      message: 'Usuario registrado con éxito.',
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ error: 'Hubo un error al registrar el usuario.' });
  }
});

// **Registro de Usuario**
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    const userId = userRecord.uid;

    await db.collection('users').doc(userId).set({
      name,
      email,
      role: 'admin',
      createdAt: new Date(),
    });

    const customToken = await auth.createCustomToken(userId);

    res.status(201).json({
      message: 'Usuario registrado con éxito',
      token: customToken,
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error al registrar usuario. Por favor intenta de nuevo.' });
  }
});



// **Inicio de Sesión**
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const userRecord = await auth.getUserByEmail(email);

    if (!userRecord) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const userDoc = await db.collection('users').doc(userRecord.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'El usuario no tiene datos en Firestore.' });
    }

    const userData = userDoc.data();
    const { role } = userData;

    if (!role) {
      return res.status(403).json({ error: 'No tienes permisos para acceder.' });
    }

    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(200).json({
      message: 'Inicio de sesión exitoso',
      token: customToken,
      role: role,
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error al iniciar sesión. Por favor, intenta de nuevo.' });
  }
});


app.get('/api/whatsapp/status', (req, res) => {
  try {
    const status = getWhatsAppStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error('Error al obtener el estado de WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/whatsapp/qr', async (req, res) => {
  try {
      const qrCode = getCurrentQrCode();
      console.log('QR solicitado:', qrCode); // Añade este log.
      if (!qrCode) {
          return res.status(404).json({ error: 'QR no disponible.' });
      }
      res.status(200).json({ qr: qrCode });
  } catch (error) {
      console.error('Error al obtener el QR:', error); // Asegúrate de que este error no aparece.
      res.status(500).json({ error: 'Error interno del servidor' });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  connectToWhatsApp();
});



// **Enviar Mensaje por WhatsApp**
app.post('/api/whatsapp/send', async (req, res) => {
  let { phoneNumber, message, image } = req.body;

  // Validar si el número ya tiene el prefijo 521, si no, agregarlo
  if (!phoneNumber.startsWith('521')) {
    phoneNumber = `521${phoneNumber}`;
  }

  if (!phoneNumber || !message || !image) {
    return res.status(400).json({ error: 'Faltan datos necesarios para enviar el mensaje.' });
  }

  try {
    // Aquí debes implementar la lógica de enviar el mensaje con WhatsApp
    await sendMessage(phoneNumber, { text: message });
    console.log('Mensaje enviado a:', phoneNumber);
    res.status(200).json({ message: 'Comprobante enviado correctamente por WhatsApp.' });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: 'Error al enviar el mensaje por WhatsApp.' });
  }
});
app.use("/api", agentsRoutes);
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

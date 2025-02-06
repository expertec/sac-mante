const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');

// Inicializar Firestore
const db = getFirestore();

// Obtener todos los agentes
router.get('/agents', async (req, res) => {
    try {
      console.log("Ruta '/agents' alcanzada");
      const usersSnapshot = await db.collection('users').where('role', '==', 'Cobrador').get();
      if (usersSnapshot.empty) {
        console.log("No se encontraron agentes");
        return res.status(404).json({ message: 'No se encontraron agentes.' });
      }
  
      const agents = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      res.status(200).json(agents);
    } catch (error) {
      console.error('Error al obtener agentes:', error);
      res.status(500).json({ message: 'Error al obtener agentes.' });
    }
  });
  

module.exports = router;

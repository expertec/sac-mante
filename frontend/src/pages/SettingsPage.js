import React, { useEffect, useState } from 'react';
import axios from 'axios';

const SettingsPage = () => {
  const [whatsappStatus, setWhatsappStatus] = useState('loading');
  const [qrCode, setQrCode] = useState(null);
  const [error, setError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState(null);

  useEffect(() => {
    const fetchWhatsAppStatus = async () => {
      try {
        const statusResponse = await axios.get('http://34.51.1.92:3000/api/whatsapp/status');
        const { status } = statusResponse.data;
        setWhatsappStatus(status);

        if (status === 'qr') {
          const qrResponse = await axios.get('http://34.51.1.92:3000/api/whatsapp/qr');
          setQrCode(qrResponse.data.qr); // Base64 del QR
          setPhoneNumber(null);
        } else if (status === 'connected') {
          const phoneResponse = await axios.get('http://34.51.1.92:3000/api/whatsapp/phone');
          setPhoneNumber(phoneResponse.data.phoneNumber);
          setQrCode(null);
        } else {
          setQrCode(null);
          setPhoneNumber(null);
        }
      } catch (err) {
        console.error('Error al obtener el estado de WhatsApp:', err);
        setError('No se pudo obtener el estado de WhatsApp.');
        setWhatsappStatus('error');
      }
    };

    fetchWhatsAppStatus();
  }, []);

  return (
    <div className="p-6 bg-primary-light rounded-lg shadow">
      <h1 className="text-3xl font-extrabold text-primary mb-6">Configuración</h1>

    </div>
  );
};

export default SettingsPage;

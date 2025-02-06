// PaymentReceipt.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { FaArrowLeft } from "react-icons/fa";

const PaymentReceipt = () => {
  const navigate = useNavigate();
  const { transaction } = useLocation().state || {};
  const [alert, setAlert] = useState(null);
  const [hasSentWhatsapp, setHasSentWhatsapp] = useState(false);

  // Función auxiliar para enviar un mensaje de plantilla con imagen a través de WhatsApp
  const sendWhatsAppImageTemplate = async (phone, imageUrl, businessName, date) => {
    const whatsappPhoneId = "561128823749562"; // Tu Phone ID
    const token =
      "EAAIambJJ7DABO52OGc1qbRFiDPERKmDeX8guAq4ycIowjbrZB0NPiZB1vfpXROJ4ldw0eOsPJ7lPZBviuIUL19Y0U938ZCZAwnyZCsoHaR4K9bmbZAy1ZAIysssZBcnb2HxxptkXYL6oOda1CN65gy37y2Y7PhnXE8qfML2yAmSSHVZAuRp4ZCp9iAS6gzOmthjjZAmc"; // Reemplaza por tu token real
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "recibo_pago_mante", // Nombre de la plantilla preaprobada para envío de imagen
        language: { code: "es_MX" },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: { link: imageUrl }
              }
            ]
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: businessName },
              { type: "text", text: date }
            ]
          }
        ]
      }
    };

    console.log("Payload para enviar a WhatsApp:", JSON.stringify(payload, null, 2));

    return await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  };

  /**
   * Función para enviar el recibo (imagen) según el comprobante generado.
   * Extrae la información del objeto transaction y envía el mensaje al número del negocio.
   * Se asegura de convertir la fecha si es necesario y de que el número esté en formato internacional.
   */
  const handleSendReceiptWhatsApp = async () => {
    try {
      if (!transaction || !transaction.receiptUrl) {
        setAlert({ type: "error", message: "No se encontró la URL del comprobante." });
        return;
      }

      // Asegurarse de que el número del negocio esté en formato internacional.
      const rawPhone = transaction.businessPhone || "";
      const phoneNumber = rawPhone.startsWith("52") ? rawPhone : "52" + rawPhone;

      // Obtener la fecha en formato legible.
      let dateText = "";
      if (transaction.date && typeof transaction.date === "object" && transaction.date.seconds) {
        dateText = new Date(transaction.date.seconds * 1000).toLocaleString();
      } else if (transaction.date) {
        dateText = new Date(transaction.date).toLocaleString();
      } else {
        dateText = new Date().toLocaleString();
      }

      const businessName = transaction.businessName || "Negocio";
      const receiptUrl = transaction.receiptUrl;

      const response = await sendWhatsAppImageTemplate(
        phoneNumber,
        receiptUrl,
        businessName,
        dateText
      );

      console.log("Respuesta de WhatsApp API (imagen):", response.data);
      setAlert({ type: "success", message: "Mensaje de recibo enviado con éxito" });
      setHasSentWhatsapp(true);
    } catch (error) {
      console.error("Error al enviar el mensaje de recibo por WhatsApp:", error);
      setAlert({ type: "error", message: "Error al enviar el mensaje de recibo por WhatsApp" });
    }
  };

  // Enviar automáticamente el WhatsApp una vez que se carga el recibo, si aún no se ha enviado.
  useEffect(() => {
    if (transaction && transaction.receiptUrl && !hasSentWhatsapp) {
      handleSendReceiptWhatsApp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction]);

  if (!transaction) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-600">Datos de la transacción no disponibles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#861E3D]">
      {/* Encabezado con ícono para volver al inicio */}
      <header className="w-full p-4 flex items-center">
        <button
          onClick={() => navigate("/cobrador")}
          className="bg-gray-300 text-gray-700 p-2 rounded-full hover:bg-gray-400"
        >
          <FaArrowLeft size={20} />
        </button>
      </header>

      <h1 className="text-2xl font-bold text-white">Recibo de Pago</h1>

      {/* Mostrar la imagen del comprobante (imagen más pequeña y con margin inferior) */}
      {transaction.receiptUrl && (
        <img
          src={transaction.receiptUrl}
          alt="Comprobante de pago"
          className="mt-4 max-w-sm border-2 border-gray-300 rounded mb-6"
        />
      )}

      {/* Nota: el mensaje de WhatsApp se envía automáticamente al cargar el recibo.
          Si deseas reenviarlo manualmente, puedes agregar un botón adicional. */}
      <button
        onClick={handleSendReceiptWhatsApp}
        className="bg-green-500 text-white px-6 py-3 rounded-lg mt-4"
      >
        Reenviar recibo por WhatsApp
      </button>

      {/* Mostrar notificaciones */}
      {alert && (
        <div
          className={`mt-4 p-4 rounded ${
            alert.type === "success" ? "bg-green-500" : "bg-red-500"
          } text-white`}
        >
          {alert.message}
        </div>
      )}
    </div>
  );
};

export default PaymentReceipt;

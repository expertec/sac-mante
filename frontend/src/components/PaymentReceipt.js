// PaymentReceipt.js
import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { FaArrowLeft } from "react-icons/fa";

const PaymentReceipt = () => {
  const navigate = useNavigate();
  const locationState = useLocation().state || {};

  // Dummy de prueba (solo para desarrollo; en producción se espera recibir la transacción dinámica)
  const dummyTransaction = {
    businessPhone: "8311760335", // Número de prueba
    businessName: "Mi Negocio de Prueba",
    receiptUrl: "https://via.placeholder.com/300", // URL dummy para la imagen del comprobante
    agentName: "Sergio",
    ownerName: "Dueño Prueba", // Nombre del propietario
    date: new Date().toISOString(),
    dayAmount: 20.0,
    totalDebt: 200.0,
    totalAmount: 50.0, // Monto del abono, por ejemplo
    tipo: "pago", // Puede ser "adeudo", "abono" o "pago"
  };

  // Se utiliza el objeto recibido por state o el dummy para pruebas
  const transaction = locationState.transaction || dummyTransaction;

  const [alert, setAlert] = useState(null);
  const [hasSentWhatsapp, setHasSentWhatsapp] = useState(false);

  // useRef para evitar envíos dobles
  const sentRef = useRef(false);

  // Función para sanitizar el número: elimina caracteres no numéricos y asegura el prefijo "52"
  const sanitizePhoneNumber = (phone) => {
    const digits = phone.replace(/\D/g, "");
    return digits.startsWith("52") ? digits : "52" + digits;
  };

  const sendWhatsAppImageTemplate = async (phone, imageUrl, ownerName, date) => {
    // Extrae solo el primer nombre
    const ownerFirstName = ownerName.trim().split(" ")[0];
  
    const whatsappPhoneId = "561128823749562"; // Tu Phone ID
    const token = "EAAIambJJ7DABO52OGc1qbRFiDPERKmDeX8guAq4ycIowjbrZB0NPiZB1vfpXROJ4ldw0eOsPJ7lPZBviuIUL19Y0U938ZCZAwnyZCsoHaR4K9bmbZAy1ZAIysssZBcnb2HxxptkXYL6oOda1CN65gy37y2Y7PhnXE8qfML2yAmSSHVZAuRp4ZCp9iAS6gzOmthjjZAmc"; // Reemplaza por tu token real
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;
  
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "recibo_pago_mante", // Plantilla para pagos
        language: { code: "es_MX" },
        components: [
          {
            type: "header",
            parameters: [{ type: "image", image: { link: imageUrl } }],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: ownerFirstName }, // Se envía solo el primer nombre
              { type: "text", text: date },
            ],
          },
        ],
      },
    };
  
    console.log("Payload para WhatsApp (pago):", JSON.stringify(payload, null, 2));
  
    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  // Función para enviar el mensaje de WhatsApp para adeudos.
  // Se añade el símbolo de moneda a los montos.
  const sendWhatsAppDebtTemplate = async (
    phone,
    imageUrl, // Se conserva para registro interno (no se envía)
    businessName,
    agentName, // Se mantiene el parámetro, pero no se utilizará
    date,
    dayAmount,
    totalDebt,
    ownerName // Recibimos el nombre completo
  ) => {
    const whatsappPhoneId = "561128823749562"; // Tu Phone ID
    const token =
      "EAAIambJJ7DABO52OGc1qbRFiDPERKmDeX8guAq4ycIowjbrZB0NPiZB1vfpXROJ4ldw0eOsPJ7lPZBviuIUL19Y0U938ZCZAwnyZCsoHaR4K9bmbZAy1ZAIysssZBcnb2HxxptkXYL6oOda1CN65gy37y2Y7PhnXE8qfML2yAmSSHVZAuRp4ZCp9iAS6gzOmthjjZAmc"; // Reemplaza por tu token real
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;
  
    // Extraer el primer nombre del dueño
    const ownerFirstName = ownerName.trim().split(" ")[0];
  
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "registro_adeudo", // Plantilla para adeudos
        language: { code: "es_MX" },
        components: [
          {
            type: "header",
            parameters: [{ type: "text", text: businessName }],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: ownerFirstName }, // Se envía solo el primer nombre
              { type: "text", text: businessName },
              { type: "text", text: date },
              { type: "text", text: "$" + dayAmount.toFixed(2) },
              { type: "text", text: "$" + totalDebt.toFixed(2) },
            ],
          },
        ],
      },
    };
  
    console.log("Payload para WhatsApp (adeudo):", JSON.stringify(payload, null, 2));
    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };
  
  // Función para enviar el mensaje de WhatsApp para abono.
  // Se añade el símbolo de moneda al saldo agregado.
  const sendWhatsAppAbonoTemplate = async (
    phone,
    ownerName,
    addedBalance,
    businessName
  ) => {
    const whatsappPhoneId = "561128823749562"; // Tu Phone ID
    const token =
      "EAAIambJJ7DABO52OGc1qbRFiDPERKmDeX8guAq4ycIowjbrZB0NPiZB1vfpXROJ4ldw0eOsPJ7lPZBviuIUL19Y0U938ZCZAwnyZCsoHaR4K9bmbZAy1ZAIysssZBcnb2HxxptkXYL6oOda1CN65gy37y2Y7PhnXE8qfML2yAmSSHVZAuRp4ZCp9iAS6gzOmthjjZAmc"; // Reemplaza por tu token real
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "notificacion_abono", // Plantilla para abono (configúrala sin header)
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: ownerName },
              { type: "text", text: "$" + addedBalance.toFixed(2) },
              { type: "text", text: businessName },
            ],
          },
        ],
      },
    };

    console.log("Payload para WhatsApp (abono):", JSON.stringify(payload, null, 2));
    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  // Función que decide qué plantilla enviar según el tipo de transacción.
  const handleSendReceiptWhatsApp = async () => {
    try {
      if (!transaction || !transaction.receiptUrl) {
        setAlert({ type: "error", message: "No se encontró la URL del comprobante." });
        return;
      }
      if (!transaction.businessPhone || !transaction.businessName) {
        setAlert({
          type: "error",
          message: "No se encontró el número de teléfono o el nombre del negocio en la transacción.",
        });
        return;
      }

      const phoneNumber = sanitizePhoneNumber(transaction.businessPhone);
      let dateText = "";
      if (transaction.date && typeof transaction.date === "object" && transaction.date.seconds) {
        dateText = new Date(transaction.date.seconds * 1000).toLocaleDateString();
      } else if (transaction.date) {
        dateText = new Date(transaction.date).toLocaleDateString();
      } else {
        dateText = new Date().toLocaleDateString();
      }

      const { businessName, receiptUrl, agentName, dayAmount, totalDebt, tipo } = transaction;
      let response;
      if (tipo === "adeudo") {
        response = await sendWhatsAppDebtTemplate(
          phoneNumber,
          receiptUrl,
          businessName,
          agentName || "Cliente",
          dateText,
          dayAmount || 0,
          totalDebt || 0,
          transaction.ownerName || "Dueño"
        );
      }
       else if (tipo === "abono") {
        const ownerName = transaction.ownerName || "Dueño";
        response = await sendWhatsAppAbonoTemplate(
          phoneNumber,
          ownerName,
          transaction.totalAmount || 0,
          businessName
        );
      } else {
        // Caso "pago": se envía el primer nombre del propietario.
        const ownerName = transaction.ownerName || "Dueño";
        response = await sendWhatsAppImageTemplate(
          phoneNumber,
          receiptUrl,
          ownerName,
          dateText
        );
      }

      console.log("Respuesta de WhatsApp API:", response.data);
      setAlert({ type: "success", message: "Mensaje enviado con éxito" });
      setHasSentWhatsapp(true);
      sentRef.current = true;
    } catch (error) {
      console.error("Error al enviar el mensaje por WhatsApp:", error);
      setAlert({ type: "error", message: "Error al enviar el mensaje por WhatsApp" });
    }
  };

  useEffect(() => {
    if (transaction && transaction.receiptUrl && !sentRef.current) {
      sentRef.current = true; // Evita envíos dobles
      handleSendReceiptWhatsApp();
    }
  }, [transaction]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#861E3D]">
      {/* Encabezado con botón para regresar */}
      <header className="w-full p-4 flex items-center">
        <button onClick={() => navigate("/cobrador")} className="bg-gray-300 text-gray-700 p-2 rounded-full hover:bg-gray-400">
          <FaArrowLeft size={20} />
        </button>
      </header>

      <h1 className="text-2xl font-bold text-white">
        {transaction.tipo === "adeudo"
          ? "Notificación de Adeudo"
          : transaction.tipo === "abono"
          ? "Notificación de Abono"
          : "Recibo de Pago"}
      </h1>

      {transaction.receiptUrl && (
        <img src={transaction.receiptUrl} alt="Comprobante" className="mt-4 max-w-sm border-2 border-gray-300 rounded mb-6" />
      )}

      <button onClick={handleSendReceiptWhatsApp} className="bg-green-500 text-white px-6 py-3 rounded-lg mt-4" disabled={hasSentWhatsapp}>
        Reenviar mensaje por WhatsApp
      </button>

      {alert && (
        <div className={`mt-4 p-4 rounded ${alert.type === "success" ? "bg-green-500" : "bg-red-500"} text-white`}>
          {alert.message}
        </div>
      )}
    </div>
  );
};

export default PaymentReceipt;

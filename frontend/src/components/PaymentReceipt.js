// PaymentReceipt.js
import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { FaArrowLeft } from "react-icons/fa";

// ========== Helpers de Retry y Utils ==========
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(requestFn, maxAttempts = 3, baseDelay = 2000) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await requestFn();
    } catch (err) {
      lastErr = err;
      const isLast = i === maxAttempts;
      if (isLast) break;
      const jitter = Math.floor(Math.random() * 500);
      await sleep(baseDelay * i + jitter); // 2s, 4s, 6s (+jitter)
    }
  }
  throw lastErr;
}

// Normalizador de teléfono MX a 521XXXXXXXXXX (JID sin @)
function toWhatsAppJid(phone) {
  let num = String(phone).replace(/\D/g, "");
  if (num.length === 10) return "521" + num;
  if (num.length === 12 && num.startsWith("52") && num[2] !== "1")
    return "521" + num.slice(2);
  if (num.length === 13 && num.startsWith("521")) return num;
  return num;
}

const PaymentReceipt = () => {
  const navigate = useNavigate();
  const locationState = useLocation().state || {};

  // Dummy para pruebas locales; en producción espera `location.state.transaction`
  const dummyTransaction = {
    businessPhone: "8311760335",
    businessName: "Mi Negocio de Prueba",
    receiptUrl: "https://via.placeholder.com/300",
    agentName: "Sergio",
    ownerName: "Dueño Prueba",
    date: new Date().toISOString(),
    dayAmount: 20.0,
    totalDebt: 200.0,
    totalAmount: 50.0,
    tipo: "pago", // "adeudo" | "abono" | "pago"
  };

  const transaction = locationState.transaction || dummyTransaction;

  const [alert, setAlert] = useState(null); // {type: 'success'|'error'|'info', message: string}
  const [isSending, setIsSending] = useState(false);
  const [hasSentWhatsapp, setHasSentWhatsapp] = useState(false);
  const sentRef = useRef(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const receiptPortalUrl = "http://sac.igob.mx/recibos";

  const captionFor = (t) => {
    const baseText =
      t?.tipo === "adeudo"
        ? `Hola ${t.businessName || ""}, se registró tu adeudo del día.`
        : t?.tipo === "abono"
        ? `Hola ${t.businessName || ""}, se registró tu abono con éxito.`
        : `Hola ${t?.businessName || ""}, tu pago del día de hoy quedó registrado con éxito.`;

    return `${baseText} Confirme el registro de sus pagos y obtenga sus comprobantes en: ${receiptPortalUrl}`;
  };

  async function sendViaRender({ phone, imageUrl, caption }) {
    return withRetry(
      () =>
        axios.post(
          `${backendUrl}/api/whatsapp/send-image`,
          { phone, imageUrl, caption },
          { timeout: 15000 }
        ),
      3, // intentos
      2000 // delay base
    );
  }

  const handleSendReceiptWhatsApp = async () => {
    try {
      if (!backendUrl) {
        setAlert({
          type: "error",
          message:
            "Falta REACT_APP_BACKEND_URL en el frontend. Configúrala y vuelve a compilar.",
        });
        return;
      }
      if (!transaction || !transaction.receiptUrl) {
        setAlert({ type: "error", message: "No se encontró la URL del comprobante." });
        return;
      }

      setIsSending(true);
      setAlert({ type: "info", message: "Enviando por WhatsApp..." });

      const phoneFormatted = toWhatsAppJid(transaction.businessPhone);
      const caption = captionFor(transaction);

      const response = await sendViaRender({
        phone: phoneFormatted,
        imageUrl: transaction.receiptUrl,
        caption,
      });

      const ok = response?.data?.success ?? response?.status === 200;
      if (ok) {
        setAlert({ type: "success", message: "Recibo enviado por WhatsApp exitosamente." });
        setHasSentWhatsapp(true);
        sentRef.current = true;
      } else {
        setAlert({ type: "error", message: "No se pudo enviar el recibo por WhatsApp." });
      }
    } catch (error) {
      console.error("Error al enviar recibo por WhatsApp:", error);
      setAlert({
        type: "error",
        message:
          "Error al enviar por WhatsApp. Puedes intentar de nuevo con el botón de Reenviar.",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Envío automático UNA sola vez al cargar, si hay receiptUrl
  useEffect(() => {
    if (transaction && transaction.receiptUrl && !sentRef.current) {
      sentRef.current = true; // evita doble envío en re-render
      handleSendReceiptWhatsApp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction?.receiptUrl]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#861E3D]">
      {/* Encabezado con botón para regresar */}
      <header className="w-full p-4 flex items-center">
        <button
          onClick={() => navigate("/cobrador")}
          className="bg-gray-300 text-gray-700 p-2 rounded-full hover:bg-gray-400"
        >
          <FaArrowLeft size={20} />
        </button>
      </header>

      {/* Título acorde al tipo de transacción */}
      <h1 className="text-2xl font-bold text-white">
        {transaction.tipo === "adeudo"
          ? "Notificación de Adeudo"
          : transaction.tipo === "abono"
          ? "Notificación de Abono"
          : "Recibo de Pago"}
      </h1>

      {/* Imagen del comprobante */}
      {transaction.receiptUrl && (
        <img
          src={transaction.receiptUrl}
          alt="Comprobante"
          className="mt-4 max-w-sm border-2 border-gray-300 rounded mb-6"
        />
      )}

      {/* Botón para reenviar manualmente por WhatsApp */}
      <button
        onClick={handleSendReceiptWhatsApp}
        className="bg-orange-500 text-white px-6 py-3 rounded-lg mt-2 disabled:opacity-60"
        disabled={isSending}
      >
        {isSending ? "Enviando..." : "Reenviar mensaje por WhatsApp"}
      </button>

      {/* Mensaje de estado */}
      {alert && (
        <div
          className={`mt-4 p-4 rounded text-white ${
            alert.type === "success"
              ? "bg-green-500"
              : alert.type === "info"
              ? "bg-blue-500"
              : "bg-red-500"
          }`}
        >
          {alert.message}
        </div>
      )}
    </div>
  );
};

export default PaymentReceipt;

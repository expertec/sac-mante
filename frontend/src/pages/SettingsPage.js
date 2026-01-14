// src/pages/SettingsPage.jsx
import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Usar variable de entorno para el backend
const backendUrl = process.env.REACT_APP_BACKEND_URL;

const SettingsPage = () => {
  const db = getFirestore();

  const [token, setToken] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [loading, setLoading] = useState(true);

  // Estados para WhatsApp (Baileys)
  const [waStatus, setWaStatus] = useState("Desconectado");
  const [qr, setQr] = useState(null);

  // Al montar, leemos de Firestore los valores guardados (si existen)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configRef = doc(db, "config", "whatsapp");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
          const data = configSnap.data();
          setToken(data.token || "");
          setInstanceId(data.instance_id || "");
        }
      } catch (err) {
        console.error("Error al leer configuración de WhatsApp:", err);
        toast.error("No se pudo cargar la configuración.");
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [db]);

  // Consulta el estado y el QR de Baileys
  useEffect(() => {
    if (!backendUrl) return;
    const fetchWaStatus = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/whatsapp/status`);
        const data = await res.json();
        setWaStatus(data.status || "No disponible");
        setQr(data.qr || null);
      } catch {
        setWaStatus("No disponible");
        setQr(null);
      }
    };

    fetchWaStatus();
    const interval = setInterval(fetchWaStatus, 7000); // refresca cada 7 segundos
    return () => clearInterval(interval);
  }, []);

  // Guardar token/instance_id (opcional, puedes quitar si ya no usas UdelOnline)
  const handleSaveConfig = async () => {
    if (!token.trim() || !instanceId.trim()) {
      toast.error("Debe completar ambos campos.");
      return;
    }

    try {
      const configRef = doc(db, "config", "whatsapp");
      await setDoc(
        configRef,
        { token: token.trim(), instance_id: instanceId.trim() },
        { merge: true }
      );
      toast.success("Configuración guardada correctamente.");
    } catch (err) {
      console.error("Error al guardar configuración:", err);
      toast.error("No se pudo guardar la configuración.");
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow max-w-md mx-auto">
        <p>Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Configuración de WhatsApp</h1>

      <div className="mb-4 p-4 border rounded bg-gray-50">
        <h2 className="font-semibold mb-1">Estado de WhatsApp</h2>
        <div className="text-sm mb-2">{waStatus}</div>
        {waStatus === "QR disponible. Escanéalo." && qr && (
          <div className="flex flex-col items-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=220x220`}
              alt="QR de WhatsApp"
              className="my-2 border"
            />
            <span className="text-xs text-gray-500">Escanea este QR en WhatsApp</span>
          </div>
        )}
        {waStatus !== "QR disponible. Escanéalo." && (
          <div className="text-xs text-gray-500">
            {waStatus === "Conectado"
              ? "WhatsApp conectado correctamente."
              : "Esperando conexión..."}
          </div>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-gray-700 mb-1">Token de UdelOnline:</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Ingresa tu token"
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring"
        />
      </div>

      <div className="mb-6">
        <label className="block text-gray-700 mb-1">Instance ID de UdelOnline:</label>
        <input
          type="text"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          placeholder="Ingresa tu instance_id"
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring"
        />
      </div>

      <button
        onClick={handleSaveConfig}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Guardar configuración
      </button>

      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default SettingsPage;

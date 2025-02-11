import React, { useState, useEffect, useCallback } from "react";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  doc,
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";

import BusinessForm from "../components/BusinessForm";
import { FaTimes } from "react-icons/fa";
import { getAuth } from "firebase/auth";
import { QRCodeCanvas } from "qrcode.react";
import dayjs from "dayjs";

/** Componente SwitchButton para cambiar el estado de negocio */
function SwitchButton({ isActive, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${
        isActive ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
          isActive ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const BusinessesPage = () => {
  const db = getFirestore();

  // 1. Obtener ID de usuario antes de usarlo en useState
  const auth = getAuth();
  const user = auth.currentUser;
  const userId = user ? user.uid : null;

  // 2. Inicializar estados
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newBusinesses, setNewBusinesses] = useState([]);
  // Agregamos el campo agentId en el estado inicial
  const [newBusiness, setNewBusiness] = useState({
    name: "",
    address: "", // Agregado campo address
    location: "",
    phone: "",
    owner: "",
    type: "",
    quota: 0, // Nuevo campo
    agentId: "", // Agregado para almacenar el agente asignado
    creatorId: userId || "unknown",
    createdAt: null,
    status: "activo",
    qrUrl: "",
  });

  // Estado para manejar alertas
  const [alert, setAlert] = useState(null);

  // Estado para el buscador
  const [searchQuery, setSearchQuery] = useState("");

  // Nuevo estado para mapear los agentes (ID → Nombre)
  const [agentMapping, setAgentMapping] = useState({});

  // 3. Función para descargar QR
  const downloadQR = (qrUrl, name) => {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${name}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 4. Obtener negocios
  const fetchBusinesses = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "negocios"));
      const fetchedBusinesses = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNewBusinesses(fetchedBusinesses);
    } catch (error) {
      console.error("Error al obtener negocios:", error);
    }
  }, [db]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  // 5. Suscripción en tiempo real para negocios
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "negocios"),
      (snapshot) => {
        const businesses = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setNewBusinesses(businesses);
      },
      (error) => {
        console.error("Error al obtener datos en tiempo real:", error);
      }
    );
    return () => unsubscribe();
  }, [db]);

  // 6. Suscripción en tiempo real para agentes (usuarios con rol "Cobrador")
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const mapping = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.role === "Cobrador" && data.name) {
          mapping[docSnap.id] = data.name;
        }
      });
      setAgentMapping(mapping);
    });
    return () => unsub();
  }, [db]);

  // 7. Manejar cambios de campos de formulario
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewBusiness({ ...newBusiness, [name]: value });
  };

  const handleNextStep = () => {
    if (currentStep < 2) setCurrentStep(currentStep + 1);
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // 8. Obtener ubicación
  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setNewBusiness({
            ...newBusiness,
            location: `Lat: ${latitude}, Lng: ${longitude}`,
          });
        },
        (error) => {
          console.error("Error al obtener ubicación:", error);
        }
      );
    } else {
      alert("La geolocalización no está soportada en este navegador.");
    }
  };

  // 9. Registrar negocio
  const handleFormSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const userId = user ? user.uid : "unknown";

      const timestamp = new Date().toISOString();

      // Validar días de apertura (depende de tu formulario BusinessForm)
      if (!newBusiness.schedule?.days || newBusiness.schedule.days.length === 0) {
        alert("Por favor selecciona al menos un día de apertura.");
        return;
      }

      const businessData = {
        ...newBusiness,
        createdAt: timestamp,
        creatorId: userId,
      };

      // Crear negocio en Firestore
      const docRef = await addDoc(collection(db, "negocios"), businessData);

      // Generar el QR en un canvas dinámico
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 400;
      const context = canvas.getContext("2d");

      // Generar el QR
      const QRCode = require("qrcode");
      await QRCode.toCanvas(canvas, docRef.id, { width: 300 });

      // Cargar logotipo
      const logoImage = new Image();
      logoImage.src = require("../assets/logoQr.png"); // Ajusta la ruta

      logoImage.onload = async () => {
        const logoSize = 40;
        const logoX = (canvas.width - logoSize) / 2;
        const logoY = (300 - logoSize) / 2;

        // Dibujar fondo blanco para el logo
        context.fillStyle = "white";
        context.fillRect(logoX, logoY, logoSize, logoSize);

        // Dibujar el logotipo
        context.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

        const businessName = newBusiness.name?.trim() || "Nombre no disponible";

        // Texto debajo del QR
        context.fillStyle = "#861E3D";
        context.font = "bold 18px Arial";
        context.textAlign = "center";
        context.fillText(businessName, canvas.width / 2, 290);

        // Convertir canvas a PNG (base64)
        const qrBase64 = canvas.toDataURL("image/png");

        // Subir QR a Firebase Storage
        const storage = getStorage();
        const qrRef = ref(storage, `qr_codes/${docRef.id}.png`);
        await uploadString(qrRef, qrBase64.split(",")[1], "base64");

        // Obtener la URL del QR
        const qrUrl = await getDownloadURL(qrRef);

        // Actualizar negocio con la URL del QR en Firestore
        await updateDoc(docRef, { qrUrl });

        setNewBusiness((prev) => ({
          ...prev,
          qrUrl,
        }));

        // Paso final
        setCurrentStep(3);
      };
    } catch (error) {
      console.error("Error al registrar negocio:", error);
    }
  };

  /**
   * 10. Cambiar el estado del negocio entre "activo" e "inactivo".
   * Muestra una alerta de confirmación con Tailwind.
   */
  const handleStatusChange = async (businessId, newStatus) => {
    try {
      const docRef = doc(db, "negocios", businessId);
      await updateDoc(docRef, { status: newStatus });

      // Mostrar alerta de éxito
      setAlert({
        type: "success",
        message:
          newStatus === "activo"
            ? "El negocio se ha ACTIVADO con éxito"
            : "El negocio se ha DESACTIVADO con éxito",
      });

      // Opcional: Ocultar alerta después de unos segundos
      setTimeout(() => {
        setAlert(null);
      }, 3000);
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      setAlert({
        type: "error",
        message: "Hubo un error al cambiar el estado.",
      });

      // Ocultar alerta de error después de unos segundos
      setTimeout(() => {
        setAlert(null);
      }, 3000);
    }
  };

  /**
   * 11. Filtrar negocios según la búsqueda.
   */
  const filteredBusinesses = newBusinesses.filter((business) => {
    const query = searchQuery.toLowerCase();
    return (
      (business.name && business.name.toLowerCase().includes(query)) ||
      (business.owner && business.owner.toLowerCase().includes(query)) ||
      (business.type && business.type.toLowerCase().includes(query)) ||
      (business.address && business.address.toLowerCase().includes(query))
    );
  });

  return (
    <div className="container mx-auto p-4 min-h-screen overflow-auto">
      <h1 className="text-2xl font-bold mb-4">Lista de Negocios</h1>

      {/* 12. Mostrar alerta, si existe */}
      {alert && (
        <div
          className={`mb-4 p-3 rounded border text-center ${
            alert.type === "success"
              ? "bg-green-100 border-green-400 text-green-700"
              : "bg-red-100 border-red-400 text-red-700"
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* 13. Contenedor superior: Botón de registro y Buscador */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-4">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded mb-2 md:mb-0 hover:bg-blue-600"
          onClick={() => setIsModalOpen(true)}
        >
          Registrar Negocio
        </button>

        {/* 14. Campo de Búsqueda */}
        <input
          type="text"
          placeholder="Buscar por nombre, propietario, tipo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-1/3 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 15. Tabla de Negocios Filtrados */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg">
          <thead>
            <tr className="bg-gray-200 text-gray-700 uppercase text-sm leading-normal">
              <th className="py-3 px-6 text-left">Nombre</th>
              <th className="py-3 px-6 text-left">Ubicación</th>
              <th className="py-3 px-6 text-left">Teléfono</th>
              <th className="py-3 px-6 text-left">Propietario</th>
              <th className="py-3 px-6 text-left">Agente Asignado</th>
              <th className="py-3 px-6 text-left">Tipo</th>
              <th className="py-3 px-6 text-left">Cuota</th>
              <th className="py-3 px-6 text-left">Estado</th>
              <th className="py-3 px-6 text-center">QR</th>
            </tr>
          </thead>

          <tbody className="text-gray-600 text-sm font-light">
            {filteredBusinesses.length > 0 ? (
              filteredBusinesses.map((business, index) => (
                <tr
                  key={business.id || index}
                  className="border-b border-gray-200 hover:bg-gray-100"
                >
                  <td className="py-3 px-6 text-left whitespace-nowrap">
                    {business.name}
                  </td>
                  <td className="py-3 px-6 text-left">
                    {business.address || "No disponible"}
                  </td>
                  <td className="py-3 px-6 text-left">{business.phone}</td>
                  <td className="py-3 px-6 text-left">{business.owner}</td>
                  <td className="py-3 px-6 text-left">
                    {agentMapping[business.agentId] || "N/A"}
                  </td>
                  <td className="py-3 px-6 text-left">{business.type}</td>
                  <td className="py-3 px-6 text-left">
                    ${business.quota || "0.00"}
                  </td>
                  <td className="py-3 px-6 text-left">
                    <SwitchButton
                      isActive={business.status === "activo"}
                      onToggle={() =>
                        handleStatusChange(
                          business.id,
                          business.status === "activo" ? "inactivo" : "activo"
                        )
                      }
                    />
                  </td>
                  <td className="py-3 px-6 text-center">
                    {business.qrUrl ? (
                      <button
                        onClick={() =>
                          downloadQR(business.qrUrl, business.name)
                        }
                        className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                      >
                        Descargar QR
                      </button>
                    ) : (
                      "No disponible"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="9"
                  className="text-center py-3 text-gray-500 italic"
                >
                  No hay negocios disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 16. Modal para registro */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50"
          onClick={(e) => {
            if (e.target.classList.contains("bg-gray-600")) {
              setIsModalOpen(false); // Cerrar modal al hacer clic fuera
            }
          }}
        >
          <div className="bg-white p-6 rounded shadow-md w-[800px] relative">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
              <FaTimes size={20} />
            </button>
            <BusinessForm
              newBusiness={newBusiness}
              setNewBusiness={setNewBusiness}
              handleInputChange={handleInputChange}
              handleNextStep={handleNextStep}
              handlePreviousStep={handlePreviousStep}
              detectLocation={detectLocation}
              handleFormSubmit={handleFormSubmit}
              currentStep={currentStep}
              handleCancel={() => setIsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessesPage;

import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import L from "leaflet";
import axios from "axios";
import { FaTimes } from "react-icons/fa";
import { QRCodeCanvas } from "qrcode.react";
import logo from "../assets/logoQr.png";

// Configurar el ícono de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const BusinessForm = ({
  newBusiness,
  handleInputChange,
  handleNextStep,
  handlePreviousStep,
  detectLocation,
  handleFormSubmit,
  currentStep,
  setNewBusiness,
  handleCancel,
  agentOptions,
}) => {
  const [mapPosition, setMapPosition] = useState(null);
  const [address, setAddress] = useState("");
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [agents, setAgents] = useState([]);
  const [errorStepOne, setErrorStepOne] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Función para convertir coordenadas a dirección
  const fetchAddressFromCoordinates = async (lat, lng) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const fetchedAddress = response.data.display_name || "Dirección no disponible";
      setAddress(fetchedAddress);
      setNewBusiness((prev) => ({
        ...prev,
        location: `Lat: ${lat}, Lng: ${lng}`,
        address: fetchedAddress,
      }));
    } catch (error) {
      console.error("Error al obtener la dirección:", error);
      setAddress("Dirección no disponible");
    }
  };

  // Detectar ubicación automáticamente
  const detectCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapPosition({ lat: latitude, lng: longitude });
          fetchAddressFromCoordinates(latitude, longitude);
          setLoadingLocation(false);
        },
        (error) => {
          console.error("Error al obtener la ubicación:", error);
          setAddress("Ubicación no disponible");
          setLoadingLocation(false);
        }
      );
    } else {
      console.error("Geolocalización no soportada.");
      setAddress("Geolocalización no soportada");
      setLoadingLocation(false);
    }
  };

  // Cuando se entra al paso 2 se detecta la ubicación
  useEffect(() => {
    if (currentStep === 2) {
      detectCurrentLocation();
    }
  }, [currentStep]);

  // Obtener agentes desde Firestore o usar los pasados en agentOptions
  useEffect(() => {
    if (agentOptions && agentOptions.length > 0) {
      setAgents(agentOptions);
      return;
    }
    const fetchAgents = async () => {
      try {
        const db = getFirestore();
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "==", "Cobrador"));
        const querySnapshot = await getDocs(q);
        const agentsList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAgents(agentsList);
      } catch (error) {
        console.error("Error al obtener agentes:", error);
      }
    };
    fetchAgents();
  }, [agentOptions]);

  // Componente para el marcador draggable
  const DraggableMarker = () => {
    useMapEvents({});
    return (
      <Marker
        position={mapPosition}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng();
            setMapPosition({ lat, lng });
            fetchAddressFromCoordinates(lat, lng);
          },
        }}
      />
    );
  };

  // Alternar días de apertura mediante botones compactos
  const toggleDay = (day) => {
    setNewBusiness((prev) => {
      const currentDays = prev.schedule?.days || [];
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          days: currentDays.includes(day)
            ? currentDays.filter((d) => d !== day)
            : [...currentDays, day],
        },
      };
    });
  };

  // Reiniciar el formulario y cerrar el modal
  const resetForm = () => {
    setNewBusiness({
      name: "",
      owner: "",
      type: "",
      phone: "",
      quota: "",
      location: "",
      address: "",
      qrUrl: "",
      agentId: "",
      schedule: { openingTime: "", closingTime: "", days: [] },
    });
    setMapPosition(null);
    setAddress("");
    setErrorStepOne("");
    setIsSubmitting(false);
    detectCurrentLocation();
    handleCancel();
  };

  // Función para sanitizar el número: elimina caracteres no numéricos y asegura el prefijo "52"
  const sanitizePhoneNumber = (phone) => {
    const digits = phone.replace(/\D/g, "");
    return digits.startsWith("52") ? digits : "52" + digits;
  };

  // Función para enviar la notificación vía WhatsApp al registrar el negocio.
  // Se extrae solo el primer nombre del dueño.
  const sendWhatsAppRegistrationTemplate = async (phone, ownerName, businessName) => {
    const firstName = ownerName.split(" ")[0]; // Solo se toma el primer nombre
    const whatsappPhoneId = "561128823749562"; // Reemplaza con tu Phone ID
    const token =
      "EAAIambJJ7DABO52OGc1qbRFiDPERKmDeX8guAq4ycIowjbrZB0NPiZB1vfpXROJ4ldw0eOsPJ7lPZBviuIUL19Y0U938ZCZAwnyZCsoHaR4K9bmbZAy1ZAIysssZBcnb2HxxptkXYL6oOda1CN65gy37y2Y7PhnXE8qfML2yAmSSHVZAuRp4ZCp9iAS6gzOmthjjZAmc"; // Reemplaza con tu token real
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "registro_comerciante", // Plantilla configurada en WhatsApp Business Manager
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: firstName },
              { type: "text", text: businessName },
            ],
          },
        ],
      },
    };

    console.log("Payload para WhatsApp (registro):", JSON.stringify(payload, null, 2));

    return await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  // Enviar notificación vía WhatsApp al completar el registro (paso 3)
  useEffect(() => {
    if (
      currentStep === 3 &&
      newBusiness.owner &&
      newBusiness.name &&
      newBusiness.phone
    ) {
      const phone = sanitizePhoneNumber(newBusiness.phone);
      sendWhatsAppRegistrationTemplate(phone, newBusiness.owner, newBusiness.name)
        .then((response) => {
          console.log("Notificación de WhatsApp enviada:", response.data);
        })
        .catch((error) => {
          console.error("Error al enviar la notificación de WhatsApp:", error);
        });
    }
  }, [currentStep, newBusiness]);

  // Función de validación para el paso 1
  const validateStepOne = () => {
    if (
      !newBusiness.name.trim() ||
      !newBusiness.owner.trim() ||
      !newBusiness.agentId ||
      !newBusiness.phone.trim() ||
      !newBusiness.quota ||
      !newBusiness.type.trim() ||
      !newBusiness.schedule?.openingTime ||
      !newBusiness.schedule?.closingTime ||
      !newBusiness.schedule?.days ||
      newBusiness.schedule.days.length === 0
    ) {
      return false;
    }
    return true;
  };

  // Función para avanzar al siguiente paso con validación
  const handleNextStepValidation = () => {
    if (!validateStepOne()) {
      setErrorStepOne("Por favor, completa todos los campos obligatorios.");
      return;
    }
    setErrorStepOne("");
    handleNextStep();
  };

  // Función para enviar el formulario con validación y prevenir doble envío
  const handleFormSubmitValidation = async () => {
    if (!validateStepOne()) {
      setErrorStepOne("Por favor, completa todos los campos obligatorios.");
      return;
    }
    setErrorStepOne("");
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await handleFormSubmit();
    } catch (error) {
      console.error("Error al registrar el negocio:", error);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50"
      onClick={(e) => {
        if (e.target.classList.contains("bg-gray-600")) {
          handleCancel();
        }
      }}
    >
      <div className="bg-white p-4 rounded shadow-md w-[600px] max-h-[90vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          <FaTimes size={20} />
        </button>

        {currentStep === 1 && (
          <div>
            {/* Paso 1: Datos Generales */}
            <form className="space-y-2">
              <input
                type="text"
                name="name"
                value={newBusiness.name}
                onChange={handleInputChange}
                placeholder="Nombre del Negocio"
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              />
              <input
                type="text"
                name="owner"
                value={newBusiness.owner}
                onChange={handleInputChange}
                placeholder="Propietario"
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              />
              <select
                name="agentId"
                value={newBusiness.agentId || ""}
                onChange={(e) =>
                  setNewBusiness({ ...newBusiness, agentId: e.target.value })
                }
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              >
                <option value="">Agente Asignado</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || agent.email}
                  </option>
                ))}
              </select>
              <select
                name="type"
                value={newBusiness.type}
                onChange={handleInputChange}
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              >
                <option value="">Giro Comercial</option>
                <option value="Comida Callejera">Comida Callejera</option>
                <option value="Bebidas y Refrescos">Bebidas y Refrescos</option>
                <option value="Dulces y Postres">Dulces y Postres</option>
                <option value="Artesanías y Souvenirs">Artesanías y Souvenirs</option>
                <option value="Ropa y Accesorios">Ropa y Accesorios</option>
                <option value="Tecnología y Accesorios">Tecnología y Accesorios</option>
                <option value="Servicios de Belleza">Servicios de Belleza</option>
                <option value="Juguetería y Artículos Infantiles">Juguetería y Artículos Infantiles</option>
                <option value="Flores y Plantas">Flores y Plantas</option>
                <option value="Productos Ecológicos y Naturales">Productos Ecológicos y Naturales</option>
                <option value="Libros y Revistas">Libros y Revistas</option>
                <option value="Otro">Otro</option>
              </select>
              <input
                type="text"
                name="phone"
                value={newBusiness.phone}
                onChange={handleInputChange}
                placeholder="Whatsapp"
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              />
              <input
                type="number"
                name="quota"
                value={newBusiness.quota || ""}
                onChange={handleInputChange}
                placeholder="Cuota"
                className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  name="openingTime"
                  value={newBusiness.schedule?.openingTime || ""}
                  onChange={(e) =>
                    setNewBusiness((prev) => ({
                      ...prev,
                      schedule: { ...prev.schedule, openingTime: e.target.value },
                    }))
                  }
                  placeholder="Apertura"
                  className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
                />
                <input
                  type="time"
                  name="closingTime"
                  value={newBusiness.schedule?.closingTime || ""}
                  onChange={(e) =>
                    setNewBusiness((prev) => ({
                      ...prev,
                      schedule: { ...prev.schedule, closingTime: e.target.value },
                    }))
                  }
                  placeholder="Cierre"
                  className="w-full border border-gray-300 p-2 rounded text-black focus:outline-none focus:ring focus:ring-blue-300"
                />
              </div>
              {/* Botones para seleccionar días de apertura */}
              <div className="flex flex-wrap gap-1">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-2 py-1 border rounded text-xs transition-colors ${
                      newBusiness.schedule?.days?.includes(day)
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-gray-700 hover:bg-blue-50"
                    }`}
                  >
                    {day.substring(0, 3)}
                  </button>
                ))}
              </div>
              {/* Mostrar error de validación */}
              {errorStepOne && (
                <p className="text-red-500 text-xs">{errorStepOne}</p>
              )}
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleNextStepValidation}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors text-sm"
                >
                  Siguiente
                </button>
              </div>
            </form>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            {/* Paso 2: Ubicación */}
            <div className="text-center mb-2 text-gray-800 font-semibold">Ubicación</div>
            {loadingLocation ? (
              <p className="text-center text-gray-500 text-sm">Cargando ubicación...</p>
            ) : (
              <>
                <p className="mb-2 text-gray-600 text-center text-xs">
                  Arrastra el marcador para ajustar la ubicación.
                </p>
                <div className="h-56 w-full mb-2">
                  {mapPosition && (
                    <MapContainer
                      center={[mapPosition.lat, mapPosition.lng]}
                      zoom={15}
                      className="h-full w-full rounded"
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                      />
                      <DraggableMarker />
                    </MapContainer>
                  )}
                </div>
                <p className="mb-2 text-gray-700 text-center text-xs">
                  Dirección: <span className="font-semibold">{address}</span>
                </p>
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviousStep}
                    className="bg-gray-400 text-white px-3 py-1 rounded hover:bg-gray-500 text-xs"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleFormSubmitValidation}
                    disabled={isSubmitting}
                    className={`bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-xs ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isSubmitting ? "Registrando..." : "Registrar"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">Negocio Registrado</h3>
            <p className="mb-2 text-xs text-gray-700">
              Escanea el código QR para identificar este negocio:
            </p>
            <div className="w-64 h-64 mx-auto mb-2">
              {newBusiness.qrUrl ? (
                <img
                  src={newBusiness.qrUrl}
                  alt="QR del negocio"
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-center text-gray-500 text-xs">Cargando QR...</p>
              )}
            </div>
            <div className="flex justify-between">
              {newBusiness.qrUrl && (
                <a
                  href={newBusiness.qrUrl}
                  download={`${newBusiness.name || "Negocio"}_QR.png`}
                  className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-xs text-center"
                >
                  Descargar QR
                </a>
              )}
              <button
                type="button"
                onClick={resetForm}
                className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-xs"
              >
                Finalizar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessForm;

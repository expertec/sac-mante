import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

import L from "leaflet";
import axios from "axios";
import { FaTimes } from "react-icons/fa"; // Icono de cierre

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
}) => {
  const [mapPosition, setMapPosition] = useState(null);
  const [address, setAddress] = useState("");
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [agents, setAgents] = useState([]); // Estado para almacenar los agentes
 // Estado para controlar la carga de ubicación

  // Convertir coordenadas a dirección
  const fetchAddressFromCoordinates = async (lat, lng) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const fetchedAddress = response.data.display_name || "Dirección no disponible";
      setAddress(fetchedAddress);
      setNewBusiness({
        ...newBusiness,
        location: `Lat: ${lat}, Lng: ${lng}`,
        address: fetchedAddress,
      });
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
      console.error("Geolocalización no está soportada por el navegador.");
      setAddress("Geolocalización no soportada");
      setLoadingLocation(false);
    }
  };

  // Efecto para detectar ubicación al entrar al paso 2
  useEffect(() => {
    if (currentStep === 2) {
      detectCurrentLocation();
    }
  }, [currentStep]);
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const db = getFirestore(); // Inicializa Firestore
        const usersRef = collection(db, "users"); // Colección de usuarios
        const q = query(usersRef, where("role", "==", "Cobrador")); // Filtrar por rol "Cobrador"
        const querySnapshot = await getDocs(q);

        const agentsList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setAgents(agentsList); // Actualiza el estado con los usuarios filtrados
      } catch (error) {
        console.error("Error al obtener agentes desde Firestore:", error);
      }
    };

    fetchAgents();
  }, []);


  
  

  // Componente para manejar eventos de marcador
  const DraggableMarker = () => {
    const map = useMapEvents({});
    return (
      <Marker
        position={mapPosition}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng();
            setMapPosition({ lat, lng });
            fetchAddressFromCoordinates(lat, lng); // Actualizar dirección y estado
          },
        }}
      />
    );
  };

  // Reiniciar el formulario después de finalizar el registro
  const resetForm = () => {
    setNewBusiness({
      name: "",
      owner: "",
      type: "",
      phone: "",
      location: "",
      address: "",
      qrUrl: "",
      agentId: "", // Reiniciar el agente asignado
    });
    setMapPosition(null);
    setAddress("");
    detectCurrentLocation(); // Detectar nuevamente la ubicación actual
    handleCancel(); // Cerrar el modal
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
      <div className="bg-white p-6 rounded shadow-md w-[800px] max-h-[90vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <FaTimes size={20} />
        </button>

        <h2 className="text-xl font-bold mb-4 text-gray-800">Registrar Negocio</h2>

        {currentStep === 1 && (
  <div>
    <h3 className="text-lg font-semibold mb-2 text-gray-800">Paso 1: Datos Generales</h3>
    <form>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Nombre</label>
        <input
          type="text"
          name="name"
          value={newBusiness.name}
          onChange={handleInputChange}
          className="w-full border border-gray-300 p-2 rounded text-gray-800"
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Propietario</label>
        <input
          type="text"
          name="owner"
          value={newBusiness.owner}
          onChange={handleInputChange}
          className="w-full border border-gray-300 p-2 text-gray-800 rounded"
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Agente Asignado</label>
        <select
          name="agentId"
          value={newBusiness.agentId || ""}
          onChange={(e) =>
            setNewBusiness({ ...newBusiness, agentId: e.target.value })
          }
          className="w-full border border-gray-300 p-2 text-gray-800 rounded"
          required
        >
          <option value="">Selecciona un agente</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || agent.email} {/* Ajusta según tus datos */}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Giro Comercial</label>
        <select
          name="type"
          value={newBusiness.type}
          onChange={handleInputChange}
          className="w-full border border-gray-300 p-2 text-gray-800 rounded"
          required
        >
          <option value="">Selecciona una opción</option>
          <option value="Alimentos">Alimentos</option>
          <option value="Comercio">Comercio</option>
          <option value="Servicio">Servicio</option>
        </select>
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Teléfono</label>
        <input
          type="text"
          name="phone"
          value={newBusiness.phone}
          onChange={handleInputChange}
          className="w-full border border-gray-300 p-2 text-gray-800 rounded"
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Cuota</label>
        <input
          type="number"
          name="quota"
          value={newBusiness.quota || ""}
          onChange={handleInputChange}
          className="w-full border border-gray-300 p-2 text-gray-800 rounded"
          placeholder="Ingrese la cuota del negocio"
          required
        />
      </div>
      <div className="mb-4 text-gray-800">
        <label className="block text-gray-700 mb-2">Horario</label>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-gray-700 text-sm mb-1">Apertura</label>
            <input
              type="time"
              name="openingTime"
              value={newBusiness.schedule?.openingTime || ""}
              onChange={(e) =>
                setNewBusiness((prev) => ({
                  ...prev,
                  schedule: {
                    ...prev.schedule,
                    openingTime: e.target.value,
                  },
                }))
              }
              className="w-full border border-gray-300 p-2 rounded"
              required
            />
          </div>
          <div className="flex-1 text-gray-800">
            <label className="block text-gray-700 text-sm mb-1">Cierre</label>
            <input
              type="time"
              name="closingTime"
              value={newBusiness.schedule?.closingTime || ""}
              onChange={(e) =>
                setNewBusiness((prev) => ({
                  ...prev,
                  schedule: {
                    ...prev.schedule,
                    closingTime: e.target.value,
                  },
                }))
              }
              className="w-full border border-gray-300 p-2 rounded"
              required
            />
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Días de apertura</label>
        <div className="grid grid-cols-3 gap-2 text-gray-800">
          {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((day) => (
            <label key={day} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={day}
                checked={newBusiness.schedule?.days?.includes(day) || false}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setNewBusiness((prev) => ({
                    ...prev,
                    schedule: {
                      ...prev.schedule,
                      days: isChecked
                        ? [...(prev.schedule?.days || []), day]
                        : prev.schedule?.days.filter((d) => d !== day),
                    },
                  }));
                }}
                className="form-checkbox"
              />
              {day}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNextStep}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Siguiente
        </button>
      </div>
    </form>
  </div>
)}


        {currentStep === 2 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Paso 2: Ubicación</h3>
            {loadingLocation ? (
              <p className="text-center text-gray-500">Cargando ubicación...</p>
            ) : (
              <>
                <p className="mb-4 text-gray-600">
                  Arrastra el marcador para ajustar la ubicación del negocio.
                </p>
                <div className="h-64 w-full mb-4">
                  <MapContainer
                    center={[mapPosition.lat, mapPosition.lng]}
                    zoom={15}
                    className="h-full w-full rounded-lg"
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <DraggableMarker />
                  </MapContainer>
                </div>
                <p className="mb-4 text-gray-700">
                  Dirección detectada: <span className="font-semibold">{address}</span>
                </p>
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviousStep}
                    className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleFormSubmit}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Registrar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Negocio Registrado Exitosamente</h3>
            <p className="mb-4">Escanea el código QR para identificar este negocio:</p>
            <div className="w-[300px] h-[300px] mx-auto">
              {newBusiness.qrUrl ? (
                <img
                  src={newBusiness.qrUrl}
                  alt="QR del negocio"
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-center text-gray-500">Cargando QR...</p>
              )}
            </div>
            <div className="flex justify-between mt-4">
              {newBusiness.qrUrl && (
                <a
                  href={newBusiness.qrUrl}
                  download={`${newBusiness.name || "Negocio"}_QR.png`}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 text-center"
                >
                  Descargar QR
                </a>
              )}
              <button
                type="button"
                onClick={resetForm} // Llamar a la función de reinicio
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
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

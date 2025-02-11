import React, { useState, useEffect } from "react";
import {
  getFirestore,
  onSnapshot,
  collection,
  query,
  where,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
} from "firebase/storage";
import { getAuth } from "firebase/auth";
import { Html5Qrcode } from "html5-qrcode";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/es";
import customParseFormat from "dayjs/plugin/customParseFormat";
import logo from "../assets/logo.png";
import bg from "../assets/bg-app.png";
import loadingGif from "../assets/carga-gps.gif";
import BusinessForm from "../components/BusinessForm";
import { FaTimes } from "react-icons/fa";
import { MdOutlineAddBusiness, MdQrCodeScanner } from "react-icons/md";
import cargandoNegocio from "../assets/cargandoNegocio.gif";

// Configurar dayjs
dayjs.locale("es");
dayjs.extend(customParseFormat);

const AVERAGE_SPEED_KMH = 25;
const MIN_DISTANCE_KM = 0.05; // 50 metros

/* =========================================
   Custom Hook para Geolocalización
========================================= */
const useGeolocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) {
      setError("Geolocalización o API de permisos no soportadas.");
      return;
    }
    // Usar "geolocation" (en inglés) para que la API funcione correctamente.
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted" || result.state === "prompt") {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          },
          (err) => {
            console.error("Error al obtener ubicación:", err);
            setError(err.message);
          }
        );
      } else {
        setError("Permiso denegado para geolocalización.");
      }
    });
  }, []);

  return { location, error };
};

/* =========================================
   Componente AgentDashboard
========================================= */
const AgentDashboard = () => {
  // Estados principales
  const [rawBusinesses, setRawBusinesses] = useState([]); // Todos los negocios del agente
  const [paidBusinessIds, setPaidBusinessIds] = useState([]); // IDs de negocios que pagaron hoy (excluyendo abonos)
  const [reportedBusinessIds, setReportedBusinessIds] = useState([]); // IDs de negocios con reporte hoy
  const [adeudoBusinessIds, setAdeudoBusinessIds] = useState([]); // IDs de negocios que registraron un adeudo hoy
  const [assignedBusinesses, setAssignedBusinesses] = useState([]); // Negocios asignados sin pago, reporte ni adeudo hoy
  const [filteredBusinesses, setFilteredBusinesses] = useState([]); // Top n más cercanos (solo los que están abiertos)
  const [searchResults, setSearchResults] = useState([]); // Resultados de búsqueda

  // Se muestra siempre 5 negocios, sin opción de "ver más"
  const displayCount = 5;

  const [loading, setLoading] = useState(true);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newBusiness, setNewBusiness] = useState({
    name: "",
    address: "",
    location: "",
    phone: "",
    owner: "",
    type: "",
    quota: 0,
    creatorId: "unknown",
    createdAt: null,
    status: "activo",
    qrUrl: "",
  });
  const [alert, setAlert] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Obtenemos la ubicación del usuario
  const { location: userLocation, error: geoError } = useGeolocation();
  const db = getFirestore();
  const auth = getAuth();
  const navigate = useNavigate();
  const user = auth.currentUser;

  // =====================================================
  // Solicitar permiso de cámara una sola vez al montar
  // =====================================================
  useEffect(() => {
    if (localStorage.getItem("cameraPermissionAsked")) return;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          localStorage.setItem("cameraPermissionAsked", "true");
          console.log("Permiso de cámara otorgado y almacenado.");
        })
        .catch((error) => {
          console.error("Error solicitando permiso de cámara:", error);
        });
    }
  }, []);

  // -------------------- Suscripción a "cobros" (del día) --------------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );
    const qCobros = query(
      collection(db, "cobros"),
      where("agentId", "==", agentId),
      where("date", ">=", startOfDay),
      where("date", "<=", endOfDay)
    );
    const unsub = onSnapshot(qCobros, (snapshot) => {
      const paymentMap = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.tipo !== "abono") {
          paymentMap[data.businessId] = true;
        }
      });
      const paidIds = Object.keys(paymentMap);
      console.log("Cobros de hoy (excluyendo abonos) =>", paidIds);
      setPaidBusinessIds(paidIds);
    });
    return () => unsub();
  }, [db, user]);

  // -------------------- Suscripción a "reportes" (del día) --------------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const todayStr = dayjs().format("YYYY-MM-DD");
    const qReportes = query(
      collection(db, "reportes"),
      where("agentId", "==", agentId)
    );
    const unsub = onSnapshot(qReportes, (snapshot) => {
      const ids = snapshot.docs
        .filter((doc) => {
          const reportDate = doc.data().date;
          return reportDate && reportDate.split("T")[0] === todayStr;
        })
        .map((doc) => doc.data().businessId);
      console.log("Reportes de hoy (IDs) =>", ids);
      setReportedBusinessIds(ids);
    });
    return () => unsub();
  }, [db, user]);

  // -------------------- Suscripción a "adeudos" (del día) --------------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const qAdeudos = query(
      collection(db, "adeudos"),
      where("agentId", "==", agentId)
    );
    const unsub = onSnapshot(qAdeudos, (snapshot) => {
      const adeudoMap = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        let dateVal = data.date;
        let docDate;
        if (!dateVal) return;
        if (typeof dateVal === "string") {
          const cleanedDateStr = dateVal.replace(/\./g, "");
          const formato = "D [de] MMMM [de] YYYY, h:mm:ss a [UTC]Z";
          docDate = dayjs(cleanedDateStr, formato);
        } else if (dateVal.toDate && typeof dateVal.toDate === "function") {
          docDate = dayjs(dateVal.toDate());
        } else if (dateVal instanceof Date) {
          docDate = dayjs(dateVal);
        } else {
          return;
        }
        if (docDate.isValid() && docDate.isSame(dayjs(), "day")) {
          adeudoMap[data.businessId] = true;
        }
      });
      const adeudoIds = Object.keys(adeudoMap);
      console.log("Adeudos registrados hoy =>", adeudoIds);
      setAdeudoBusinessIds(adeudoIds);
    });
    return () => unsub();
  }, [db, user]);

  // -------------------- Suscripción a "negocios" --------------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const unsub = onSnapshot(collection(db, "negocios"), (snapshot) => {
      let all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      all = all.filter((b) => b.agentId === agentId);
      console.log("Negocios del agente =>", all);
      setRawBusinesses(all);
      setLoading(false);
    });
    return () => unsub();
  }, [db, user]);

  // -------------------- Filtrar negocios asignados --------------------
  useEffect(() => {
    if (!rawBusinesses.length) {
      setAssignedBusinesses([]);
      return;
    }
    const assigned = rawBusinesses.filter((b) => {
      if (paidBusinessIds.includes(b.id)) return false;
      if (reportedBusinessIds.includes(String(b.id))) return false;
      if (adeudoBusinessIds.includes(b.id)) return false;
      return true;
    });
    console.log("Negocios asignados (sin pago, reporte o adeudo hoy) =>", assigned);
    setAssignedBusinesses(assigned);
  }, [rawBusinesses, paidBusinessIds, reportedBusinessIds, adeudoBusinessIds]);

  // -------------------- Calcular distancia y obtener top 5 --------------------
  useEffect(() => {
    if (!assignedBusinesses.length || !userLocation) {
      setFilteredBusinesses([]);
      return;
    }
    const { latitude, longitude } = userLocation;
    setIsFetchingLocation(true);
    const updated = assignedBusinesses
      .filter((b) => b.location && b.status === "activo")
      .map((b) => {
        let isOpen = true;
        if (
          b.schedule &&
          b.schedule.days &&
          b.schedule.openingTime &&
          b.schedule.closingTime
        ) {
          const todayName = dayjs().format("dddd").toLowerCase();
          const scheduleDays = b.schedule.days.map((d) => d.toLowerCase());
          if (!scheduleDays.includes(todayName)) {
            isOpen = false;
          } else {
            const [openHour, openMinute] = b.schedule.openingTime.split(":").map(Number);
            const [closeHour, closeMinute] = b.schedule.closingTime.split(":").map(Number);
            const now = dayjs();
            const opening = dayjs().hour(openHour).minute(openMinute).second(0);
            let closing = dayjs().hour(closeHour).minute(closeMinute).second(0);
            if (closing.isBefore(opening)) {
              closing = closing.add(1, "day");
            }
            if (now.isBefore(opening) || now.isAfter(closing)) {
              isOpen = false;
            }
          }
        }
        const [lat2, lon2] = b.location
          .replace("Lat: ", "")
          .replace("Lng: ", "")
          .split(", ")
          .map(Number);
        const distKM = calculateDistance(latitude, longitude, lat2, lon2);
        const timeMin = Math.round((distKM / AVERAGE_SPEED_KMH) * 60);
        return {
          ...b,
          distance: distKM.toFixed(2),
          time: timeMin,
          isOpen,
        };
      })
      .filter((b) => b.isOpen)
      .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
      .slice(0, displayCount);
    setFilteredBusinesses(updated);
    setIsFetchingLocation(false);
  }, [assignedBusinesses, userLocation, displayCount]);

  // -------------------- Cálculo de distancia (Fórmula Haversine) --------------------
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (val) => (val * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // -------------------- Escáner QR --------------------
  useEffect(() => {
    if (!showScanner) return;
    const qrCode = new Html5Qrcode("reader");
    setHtml5QrCode(qrCode);
    qrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          setShowScanner(false);
          qrCode
            .stop()
            .then(() => qrCode.clear())
            .catch(console.error);
          navigate(`/negocio/${decodedText}`);
        },
        (err) => console.warn("Escaneo fallido:", err)
      )
      .catch((err) => console.error("No se encontraron cámaras:", err));
    return () => {
      if (qrCode && qrCode.isScanning) {
        qrCode
          .stop()
          .then(() => qrCode.clear())
          .catch(console.error);
      }
    };
  }, [showScanner, navigate]);

  // -------------------- Manejo del formulario "nuevo negocio" --------------------
  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });
  };

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

  const handleFormSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newBusiness.schedule?.days || newBusiness.schedule.days.length === 0) {
      setAlert({
        type: "error",
        message: "Por favor selecciona al menos un día de apertura.",
      });
      return;
    }
    try {
      const userId = user ? user.uid : "unknown";
      const timestamp = new Date().toISOString();
      const businessData = {
        ...newBusiness,
        createdAt: timestamp,
        creatorId: userId,
      };
      const docRef = await addDoc(collection(db, "negocios"), businessData);
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 400;
      const context = canvas.getContext("2d");
      const QRCode = require("qrcode");
      await QRCode.toCanvas(canvas, docRef.id, { width: 300 });

      const logoSrc = require("../assets/logoQr.png");
      const logoImage = await loadImage(logoSrc);
      const logoSize = 40;
      const logoX = (canvas.width - logoSize) / 2;
      const logoY = (300 - logoSize) / 2;
      context.fillStyle = "white";
      context.fillRect(logoX, logoY, logoSize, logoSize);
      context.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

      const businessName = newBusiness.name?.trim() || "Nombre no disponible";
      context.fillStyle = "#861E3D";
      context.font = "bold 18px Arial";
      context.textAlign = "center";
      context.fillText(businessName, canvas.width / 2, 290);

      const qrBase64 = canvas.toDataURL("image/png");
      const storage = getStorage();
      const qrRef = ref(storage, `qr_codes/${docRef.id}.png`);
      await uploadString(qrRef, qrBase64.split(",")[1], "base64");
      const qrUrl = await getDownloadURL(qrRef);
      await updateDoc(docRef, { qrUrl });
      setNewBusiness((prev) => ({ ...prev, qrUrl }));
      setCurrentStep(3);
      setAlert({
        type: "success",
        message: "Negocio registrado exitosamente.",
      });
    } catch (error) {
      console.error("Error al registrar negocio:", error);
      setAlert({
        type: "error",
        message: "Error al registrar el negocio.",
      });
    }
  };

  // -------------------- Filtrar negocios según la búsqueda --------------------
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const queryLower = searchQuery.toLowerCase();
    const results = rawBusinesses.filter((business) => {
      return (
        (business.name && business.name.toLowerCase().includes(queryLower)) ||
        (business.owner && business.owner.toLowerCase().includes(queryLower)) ||
        (business.type && business.type.toLowerCase().includes(queryLower)) ||
        (business.address && business.address.toLowerCase().includes(queryLower))
      );
    });
    setSearchResults(results);
  }, [searchQuery, rawBusinesses]);

  // -------------------- Render --------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <img src={loadingGif} alt="Cargando..." className="w-32 h-32" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center text-white"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Header */}
      <header className="w-full p-4 flex items-center justify-between bg-opacity-80 relative">
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#861E3D] text-white p-3 rounded-full hover:bg-[#701730]"
        >
          <MdOutlineAddBusiness size={24} />
        </button>
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <img src={logo} alt="Logo" style={{ width: "150px" }} />
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="bg-[#861E3D] text-white p-3 rounded-full hover:bg-[#701730]"
        >
          <MdQrCodeScanner size={24} />
        </button>
      </header>

      {/* Contenedor principal */}
      <div className="flex-1 w-full p-4 bg-[#5c031e] bg-opacity-75">
        <h1 className="text-2xl font-bold text-center mb-6 text-white">
          Negocios asignados
        </h1>

        {/* Campo de búsqueda */}
        <div className="flex justify-center mb-6">
          <input
            type="text"
            placeholder="Buscar por nombre, propietario, tipo o dirección..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-black w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Mostrar alerta, si existe */}
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

        {/* Lista de negocios */}
        {searchQuery ? (
          searchResults.length > 0 ? (
            <ul className="space-y-4">
              {searchResults.map((b) => {
                let distanceInfo = null;
                if (userLocation && b.location && b.status !== "inactivo") {
                  const [lat2, lon2] = b.location
                    .replace("Lat: ", "")
                    .replace("Lng: ", "")
                    .split(", ")
                    .map(Number);
                  const distKM = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    lat2,
                    lon2
                  );
                  const timeMin = Math.round((distKM / AVERAGE_SPEED_KMH) * 60);
                  distanceInfo = {
                    distanceKM: distKM.toFixed(2),
                    timeMin,
                  };
                }
                let isOpen = true;
                if (
                  b.schedule &&
                  b.schedule.days &&
                  b.schedule.openingTime &&
                  b.schedule.closingTime
                ) {
                  const todayName = dayjs().format("dddd").toLowerCase();
                  const scheduleDays = b.schedule.days.map((d) => d.toLowerCase());
                  if (!scheduleDays.includes(todayName)) {
                    isOpen = false;
                  } else {
                    const [openHour, openMinute] = b.schedule.openingTime.split(":").map(Number);
                    const [closeHour, closeMinute] = b.schedule.closingTime.split(":").map(Number);
                    const now = dayjs();
                    const opening = dayjs().hour(openHour).minute(openMinute).second(0);
                    let closing = dayjs().hour(closeHour).minute(closeMinute).second(0);
                    if (closing.isBefore(opening)) {
                      closing = closing.add(1, "day");
                    }
                    if (now.isBefore(opening) || now.isAfter(closing)) {
                      isOpen = false;
                    }
                  }
                }
                return (
                  <li
                    key={b.id}
                    className="bg-white shadow-lg rounded-lg p-4 flex items-center justify-between"
                  >
                    <Link
                      to={`/negocio/${b.id}`}
                      className="flex items-center flex-1 no-underline text-inherit"
                    >
                      <div className="w-12 h-12 flex items-center justify-center bg-[#701730] text-white rounded-full mr-4 text-lg font-semibold">
                        {b.name.split(" ").map((word) => word.charAt(0)).join("")}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-[#701730]">{b.name}</h2>
                        <p className="text-sm text-gray-600">{b.owner}</p>
                        <p className="text-sm text-gray-500">{b.address}</p>
                        {distanceInfo && (
                          <p className="text-sm text-gray-500">
                            Distancia: {distanceInfo.distanceKM} km - {distanceInfo.timeMin} min
                          </p>
                        )}
                      </div>
                    </Link>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`px-3 py-1 rounded-full text-sm font-semibold ${isOpen ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                        {isOpen ? "Abierto" : "Cerrado"}
                      </div>
                      {b.status === "inactivo" && (
                        <div className="px-3 py-1 rounded-full text-sm font-semibold bg-red-500 text-white">
                          Inactivo
                        </div>
                      )}
                      {paidBusinessIds.includes(b.id) && (
                        <div className="px-3 py-1 rounded-full text-sm font-semibold bg-green-500 text-white">
                          Pagado
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-white">
              No se encontraron negocios que coincidan con la búsqueda.
            </p>
          )
        ) : isFetchingLocation ? (
          <div className="flex items-center justify-center">
            <img src={loadingGif} alt="Cargando..." className="w-16 h-16" />
          </div>
        ) : filteredBusinesses.length > 0 ? (
          <ul className="space-y-4">
            {filteredBusinesses.map((b) => (
              <li
                key={b.id}
                className="bg-white shadow-lg rounded-lg p-4 flex items-center justify-between"
              >
                <Link
                  to={`/negocio/${b.id}`}
                  className="flex items-center flex-1 no-underline text-inherit"
                >
                  <div className="w-12 h-12 flex items-center justify-center bg-[#701730] text-white rounded-full mr-4 text-lg font-semibold">
                    {b.name.split(" ").map((word) => word.charAt(0)).join("")}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-[#701730]">{b.name}</h2>
                    <p className="text-sm text-gray-600">{b.owner}</p>
                    <p className="text-sm text-gray-500">{b.address}</p>
                    {b.distance && (
                      <p className="text-sm text-gray-500">
                        Distancia: {b.distance} km - {b.time} min
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex flex-col items-end gap-2">
                  <div className="px-3 py-1 rounded-full text-sm font-semibold ml-4 bg-green-500 text-white">
                    {b.time} min
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          
          <div className="flex flex-col items-center justify-center min-h-screen">
        <img src={cargandoNegocio} alt="Cargando negocio..." className="w-32 h-32" />
        <p className="mt-4 text-lg">Cargando negocios...</p>
      </div>
        )}
      </div>

      {/* Modal del escáner QR */}
      {showScanner && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg text-black w-full max-w-md">
            <h2 className="text-lg font-bold mb-4 text-center">Escanea el código QR</h2>
            <div id="reader" className="w-full"></div>
            <button
              onClick={() => setShowScanner(false)}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-full"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal para crear negocio */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
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
              handleFormSubmit={handleFormSubmit}
              currentStep={currentStep}
              handleCancel={() => setIsModalOpen(false)}
              agentOptions={[
                {
                  id: user.uid,
                  name: user.displayName || user.email || "Cobrador",
                },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;

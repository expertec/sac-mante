import React, { useState, useEffect } from "react";
import {
  getFirestore,
  onSnapshot,
  collection,
  query,
  where,
  updateDoc,
  addDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  uploadString,
  getDownloadURL,
  ref,
} from "firebase/storage";
import { getAuth } from "firebase/auth";
import { Html5Qrcode } from "html5-qrcode";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/es";
import customParseFormat from "dayjs/plugin/customParseFormat";
// Importar plugins para UTC y timezone
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import logo from "../assets/logo.png";
import bg from "../assets/bg-app.png";
import loadingGif from "../assets/carga-gps.gif";
import BusinessForm from "../components/BusinessForm";
import { FaTimes } from "react-icons/fa";
import {
  MdOutlineAddBusiness,
  MdQrCodeScanner,
  MdDateRange,
  MdSos
} from "react-icons/md";
import cargandoNegocio from "../assets/cargandoNegocio.gif";

// Importaciones de react-datepicker
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import OfflineAlert from "../pages/OfflineAlert";

// Configurar dayjs
dayjs.locale("es");
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const AVERAGE_SPEED_KMH = 25;

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
  // ----------------- Estados principales (la lista de negocios se basa en los cobros de HOY)
  const [rawBusinesses, setRawBusinesses] = useState([]);
  const [paidBusinessIds, setPaidBusinessIds] = useState([]);
  const [reportedBusinessIds, setReportedBusinessIds] = useState([]);
  const [adeudoBusinessIds, setAdeudoBusinessIds] = useState([]);
  const [assignedBusinesses, setAssignedBusinesses] = useState([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [dailyTotal, setDailyTotal] = useState(0);

  // Estados para la modal de selección de fecha (solo para la modal)
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalTotal, setModalTotal] = useState(0);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Otros estados
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

  // Firebase y geolocalización
  const { location: userLocation } = useGeolocation();
  const db = getFirestore();
  const auth = getAuth();
  const navigate = useNavigate();
  const user = auth.currentUser;

  // ----------------- Permiso de cámara -----------------
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

  // ----------------- Suscripción a cobros (para la lista principal: HOY) -----------------
  useEffect(() => {
    if (!user) return;
    const queryDate = dayjs(); // Siempre hoy para la consulta principal
    const startOfDay = queryDate.startOf("day").toDate();
    const endOfDay = queryDate.endOf("day").toDate();

    const agentId = user.uid;
    const qCobros = query(
      collection(db, "cobros"),
      where("agentId", "==", agentId),
      where("date", ">=", startOfDay),
      where("date", "<=", endOfDay)
    );

    const unsub = onSnapshot(qCobros, (snapshot) => {
      let total = 0;
      const paymentMap = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.tipo !== "abono") {
          total += parseFloat(data.netAmount) || 0;
          paymentMap[data.businessId] = true;
        }
      });
      setPaidBusinessIds(Object.keys(paymentMap));
      setDailyTotal(total);
    });

    return () => unsub();
  }, [db, user]);

  // ----------------- Suscripción para la modal: Cobros del día seleccionado -----------------
  useEffect(() => {
    // Esta consulta solo se ejecuta cuando la modal está abierta y hay una fecha seleccionada
    if (!user || !isDateModalOpen || !selectedDate) return;

    const queryDate = dayjs(selectedDate);
    const startOfDay = queryDate.startOf("day").toDate();
    const endOfDay = queryDate.endOf("day").toDate();
    const agentId = user.uid;

    const qModalCobros = query(
      collection(db, "cobros"),
      where("agentId", "==", agentId),
      where("date", ">=", startOfDay),
      where("date", "<=", endOfDay)
    );

    const unsub = onSnapshot(qModalCobros, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.tipo !== "abono") {
          total += parseFloat(data.netAmount) || 0;
        }
      });
      setModalTotal(total);
    });

    return () => unsub();
  }, [db, user, selectedDate, isDateModalOpen]);

  // ----------------- Suscripción a reportes (HOY) -----------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    // Usamos dayjs para obtener el rango en hora local
    const today = dayjs();
    const startOfDay = today.startOf("day").toDate();
    const endOfDay = today.endOf("day").toDate();
    
    const qReportes = query(
      collection(db, "reportes"),
      where("agentId", "==", agentId),
      where("date", ">=", startOfDay),
      where("date", "<=", endOfDay)
    );
    const unsub = onSnapshot(qReportes, (snapshot) => {
      const ids = snapshot.docs
        .map((docSnap) => {
          const reportData = docSnap.data();
          let reportDateObj = null;
          if (reportData.date && reportData.date.toDate) {
            reportDateObj = reportData.date.toDate();
          } else if (reportData.date) {
            reportDateObj = new Date(reportData.date);
          }
          // Convertir el timestamp UTC a hora local usando dayjs.utc() y tz()
          const localReportDate = dayjs.utc(reportDateObj).tz(dayjs.tz.guess());
          if (localReportDate.isSame(dayjs().tz(dayjs.tz.guess()), "day")) {
            return reportData.businessId;
          }
          return null;
        })
        .filter(Boolean);
      setReportedBusinessIds(ids);
    });
    return () => unsub();
  }, [db, user]);

  // ----------------- Suscripción a adeudos (HOY) -----------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const qAdeudos = query(
      collection(db, "adeudos"),
      where("agentId", "==", agentId)
    );
    const unsub = onSnapshot(qAdeudos, (snapshot) => {
      const adeudoMap = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const dateVal = data.date;
        let docDate;
        if (dateVal?.toDate) {
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
      setAdeudoBusinessIds(Object.keys(adeudoMap));
    });
    return () => unsub();
  }, [db, user]);

  // ----------------- Suscripción a negocios -----------------
  useEffect(() => {
    if (!user) return;
    const agentId = user.uid;
    const unsub = onSnapshot(collection(db, "negocios"), (snapshot) => {
      let all = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      all = all.filter((b) => b.agentId === agentId);
      setRawBusinesses(all);
      setLoading(false);
    });
    return () => unsub();
  }, [db, user]);

  // ----------------- Filtrar negocios asignados (HOY) -----------------
  useEffect(() => {
    if (!rawBusinesses.length) {
      setAssignedBusinesses([]);
      return;
    }
    // Filtramos negocios que NO estén en paidBusinessIds, reportedBusinessIds ni adeudoBusinessIds
    const assigned = rawBusinesses.filter((b) => {
      if (paidBusinessIds.includes(b.id)) return false;
      if (reportedBusinessIds.includes(String(b.id))) return false;
      if (adeudoBusinessIds.includes(b.id)) return false;
      return true;
    });
    setAssignedBusinesses(assigned);
  }, [rawBusinesses, paidBusinessIds, reportedBusinessIds, adeudoBusinessIds]);

  // ----------------- Calcular distancia y obtener top 5 -----------------
  useEffect(() => {
    if (!assignedBusinesses.length || !userLocation) {
      setFilteredBusinesses([]);
      return;
    }
    setIsFetchingLocation(true);
    const { latitude, longitude } = userLocation;
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
            const [openHour, openMinute] = b.schedule.openingTime
              .split(":")
              .map(Number);
            const [closeHour, closeMinute] = b.schedule.closingTime
              .split(":")
              .map(Number);
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
      .slice(0, 5);
    setFilteredBusinesses(updated);
    setIsFetchingLocation(false);
  }, [assignedBusinesses, userLocation]);

  // ----------------- Cálculo de distancia (Fórmula Haversine) -----------------
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

  // ----------------- Escáner QR -----------------
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

  // ----------------- Manejo del formulario "nuevo negocio" -----------------
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
      await updateDoc(doc(db, "negocios", docRef.id), { qrUrl });
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

  // ----------------- Filtrar negocios según la búsqueda -----------------
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

if (loading) {
  return (
    <>
      <OfflineAlert />
      <div className="flex items-center justify-center min-h-screen bg-white">
        <img src={loadingGif} alt="Cargando..." className="w-32 h-32" />
      </div>
    </>
  );
}

return (
  <>
    <OfflineAlert />
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
        {/* Indicador de cobro diario y botón de calendario */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-4">
            <span
              className="px-3 py-2 rounded-full text-xl font-semibold"
              style={{ backgroundColor: "#BB7820", color: "white" }}
            >
              Ingresos al día: $ {dailyTotal.toFixed(2)}
            </span>
            <button
              onClick={() => setIsDateModalOpen(true)}
              style={{ backgroundColor: "#781C2C", color: "white" }}
              className="px-4 py-2 rounded-full text-xl font-semibold flex items-center"
            >
              <MdDateRange className="mr-2" size={20} />
            </button>
          </div>
          <h1 className="text-2xl font-bold text-center mt-4">
            Negocios asignados
          </h1>
        </div>

        {/* Modal de selección de fecha (usando react-datepicker) */}
        {isDateModalOpen && (
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsDateModalOpen(false);
              }
            }}
          >
            <div className="bg-white p-6 rounded shadow-md w-full max-w-sm text-black">
              <div className="flex flex-col items-center">
                <h2 className="text-lg font-bold mb-4 text-center">
                  Selecciona una fecha
                </h2>
                <div className="w-full mb-4">
                  <DatePicker
                    selected={selectedDate ? new Date(selectedDate) : null}
                    onChange={(date) => {
                      setSelectedDate(date ? date.toISOString() : null);
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="border p-2 w-full text-black text-lg rounded"
                    placeholderText="Elige una fecha"
                  />
                </div>
                {selectedDate && (
                  <p className="mb-4 text-lg text-gray-700 font-medium text-center">
                    Cobro del{" "}
                    <span className="font-semibold">
                      {dayjs(selectedDate).format("DD/MM/YYYY")}
                    </span>
                    :
                    <span className="ml-2 text-green-700 font-bold">
                      $ {modalTotal.toFixed(2)}
                    </span>
                  </p>
                )}
                <div className="flex justify-between w-full">
                  <button
                    onClick={() => setIsDateModalOpen(false)}
                    className="px-4 py-2 bg-green-500 text-white rounded mr-2 text-lg w-1/2"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDate(null);
                      setIsDateModalOpen(false);
                    }}
                    className="px-4 py-2 bg-red-500 text-white rounded text-lg w-1/2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campo de búsqueda */}
        <div className="flex justify-center mb-6">
          <input
            type="text"
            placeholder="Buscar por nombre, propietario, tipo o dirección..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-black w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
        </div>

        {/* Mostrar alerta */}
        {alert && (
          <div
            className={`mb-4 p-3 rounded border text-center text-lg ${
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
                    const [openHour, openMinute] = b.schedule.openingTime
                      .split(":")
                      .map(Number);
                    const [closeHour, closeMinute] = b.schedule.closingTime
                      .split(":")
                      .map(Number);
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
                      <div
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          isOpen ? "bg-green-500 text-white" : "bg-red-500 text-white"
                        }`}
                      >
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
                      {/* Nuevo chip para negocios reportados */}
                      {reportedBusinessIds.includes(String(b.id)) && (
                        <div className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500 text-white">
                          No encontrado
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-lg">
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
            <h2 className="text-lg font-bold mb-4 text-center">
              Escanea el código QR
            </h2>
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
      <button
  onClick={() => window.open("https://auxsac.igob.mx/", "_blank", "noopener,noreferrer")}
  title="SOS"
  aria-label="SOS"
  className="fixed bottom-5 right-5 z-[110] h-14 w-14 rounded-full shadow-lg bg-red-600 text-white flex items-center justify-center hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-white/60"
>
  <MdSos size={28} />
</button>
    </div> {/* <--- Este cierra el div grande */}
    </>
  );
};

export default AgentDashboard;

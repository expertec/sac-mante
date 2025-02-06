// SingleBusinessPage.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  collection,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import axios from "axios";
import bgApp from "../assets/bg-app.png";
import logo from "../assets/logo.png";
import cobroGif from "../assets/cobro.gif"; // Animación de carga para el cobro
import { FaArrowLeft, FaPlus } from "react-icons/fa"; // Ícono para el botón de costo extra
import { IoQrCode } from "react-icons/io5";
import { FaWhatsapp } from "react-icons/fa6";
import { getAuth } from "firebase/auth";
import errorImage from "../assets/error-negocio.png";
import cargandoNegocio from "../assets/cargandoNegocio.gif";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from "firebase/storage";
import html2canvas from "html2canvas";

// Importamos Toastify para mostrar notificaciones tipo toast
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SingleBusinessPage = () => {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasPaidToday, setHasPaidToday] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const [showAlert, setShowAlert] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para el modal de reactivación
  const [showReactivateAlert, setShowReactivateAlert] = useState(false);

  // Estados para el modal de costo extra
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraConcept, setExtraConcept] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [saveConcept, setSaveConcept] = useState(false);
  const [conceptSuggestions, setConceptSuggestions] = useState([]);
  // Estado para almacenar el total de costos extras agregados
  const [extraTotal, setExtraTotal] = useState(0);
  // Estado para almacenar cada costo extra individual con concepto
  const [extraCosts, setExtraCosts] = useState([]);

  const db = getFirestore();
  const storage = getStorage();

  /**
   * Función para obtener el siguiente folio consecutivo.
   * Se utiliza una transacción para leer y actualizar el contador en Firestore.
   */
  const getNextFolio = async () => {
    const counterDocRef = doc(db, "counters", "cobrosCounter");
    let newFolio = 1;
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterDocRef);
      if (!counterDoc.exists()) {
        transaction.set(counterDocRef, { lastFolio: 1 });
        newFolio = 1;
      } else {
        const lastFolio = counterDoc.data().lastFolio;
        newFolio = lastFolio + 1;
        transaction.update(counterDocRef, { lastFolio: newFolio });
      }
    });
    return newFolio;
  };

  /**
   * Descarga el QR del negocio.
   */
  const downloadQR = (qrUrl, name) => {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${name}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Maneja el cobro: crea documento en "cobros" y genera el comprobante.
   * Se incluye en la imagen generada:
   * - El folio (formateado como "Folio:0001" en color #ad8118).
   * - El monto base.
   * - La lista de costos extras (con concepto y monto).
   * - El monto total.
   * - Los datos del agente y el nombre del negocio.
   *
   * En la base de datos se guarda el folio con 4 dígitos (formateado).
   */
  const handlePayment = async () => {
    if (!business || !agentLocation) return;

    try {
      setIsProcessing(true);
      const auth = getAuth();
      const user = auth.currentUser;
      const agentName = user.displayName || user.email || "Agente";

      // Obtener el siguiente folio y formatearlo con 4 dígitos
      const folioNumber = await getNextFolio();
      const formattedFolio = folioNumber.toString().padStart(4, "0");

      // Sumar el costo extra al monto base
      const totalAmount = Number(business.quota || 0) + extraTotal;

      // Datos de la transacción
      const transactionData = {
        businessId: business.id,
        agentId: user.uid,
        agentName,
        folio: formattedFolio, // Se guarda el folio formateado (ej. "0002")
        date: Timestamp.now(),
        amount: totalAmount,
        location: {
          Lat: agentLocation.latitude,
          Lng: agentLocation.longitude,
        },
        businessPhone: business.phone,
        businessName: business.name,
      };

      // Crear documento en "cobros"
      const docRef = await addDoc(collection(db, "cobros"), transactionData);

      // Crear HTML para la lista de costos extras
      const extraCostsHtml =
        extraCosts.length > 0
          ? extraCosts
              .map(
                (item) =>
                  `<p style="margin: 0; font-size: 1.2rem; color: #000;">${item.concept}: $${Number(
                    item.amount
                  ).toFixed(2)}</p>`
              )
              .join("")
          : `<p style="margin: 0; font-size: 1.2rem; color: #000;">$0.00</p>`;

      // Generar HTML para el comprobante
      const receiptHtml = `
        <div id="receipt" style="max-width: 400px; margin: -20px auto 0; padding: 10px 20px 20px; font-family: Arial, sans-serif; text-align: center; border: 2px solid #861E3D; border-radius: 12px; background-color: #fff; color: #333;">
          <img src="${logo}" alt="Logo" style="max-width: 150px; margin: 10px auto;" />
          <h1 style="color: #861E3D; font-size: 1.5rem; margin: 10px 0;">Pago exitoso.</h1>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Folio:</p>
          <h2 style="font-size: 1.8rem; font-weight: bold; color: #ad8118; margin: 5px 0;">Folio: ${formattedFolio}</h2>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto base:</p>
          <h2 style="font-size: 2rem; font-weight: bold; color: #000; margin: 5px 0;">$${Number(
            business.quota || 0
          ).toFixed(2)}</h2>
          <div style="margin: 10px 0;">
            <p style="font-size: 1rem; color: #555; margin: 5px 0;">Costos Extras:</p>
            ${extraCostsHtml}
          </div>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto Total:</p>
          <h2 style="font-size: 2rem; font-weight: bold; color: #000; margin: 5px 0;">$${totalAmount.toFixed(
            2
          )}</h2>
          <p style="font-size: 0.9rem; color: #777; margin: 5px 0;">${new Date().toLocaleString()}</p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            Cobrado por: <span style="color: #861E3D;">${agentName}</span>
          </p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            Pagado por: <span style="color: #861E3D;">${business.name}</span>
          </p>
          <p style="font-size: 0.8rem; color: #555; margin: 5px 0;">Código de transacción:</p>
          <p style="font-size: 1rem; font-weight: bold; color: #861E3D; margin: 5px 0;">${docRef.id}</p>
          
          <!-- Texto adicional en letras pequeñas -->
          <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
            <p style="font-size: 0.6rem; color: #555; text-align: left;">
              Apartado B. Por el uso de la vía pública por comerciantes ambulantes o con puestos fijos y semifijos
            </p>
            <p style="font-size: 0.6rem; color: #555; text-align: left; margin-top: 5px;">
              Artículo 18.- Los derechos por el uso de la vía pública por las y los comerciantes ambulantes o con puestos fijos o semifijos, se causarán conforme a lo siguiente:
            </p>
            <p style="font-size: 0.6rem; color: #555; text-align: left; margin-top: 5px;">
              I. Los comerciantes ambulantes, pagarán de $10.00 diarios;
            </p>
            <p style="font-size: 0.6rem; color: #555; text-align: left; margin-top: 5px;">
              II. Los puestos fijos o semifijos pagarán de $10.00 pesos diarios por m².
            </p>
          </div>
        </div>
      `;

      // Insertar en el DOM para generar la imagen
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = receiptHtml;
      document.body.appendChild(tempDiv);

      const receiptElement = document.getElementById("receipt");
      const canvas = await html2canvas(receiptElement);
      const imageBase64 = canvas.toDataURL("image/png");

      document.body.removeChild(tempDiv);

      // Subir el comprobante a Storage
      const storageRef = ref(storage, `receipts/${docRef.id}.png`);
      await uploadString(
        storageRef,
        imageBase64.split(",")[1],
        "base64",
        { contentType: "image/png" }
      );
      const receiptUrl = await getDownloadURL(storageRef);
      console.log("URL de descarga generada:", receiptUrl);

      // Actualizar el documento de cobro con la URL del comprobante
      await updateDoc(doc(db, "cobros", docRef.id), { receiptUrl });

      setIsProcessing(false);
      navigate("/recibo", {
        state: { transaction: { id: docRef.id, ...transactionData, receiptUrl } },
      });
    } catch (error) {
      console.error("Error al registrar el cobro o generar el comprobante:", error);
      setIsProcessing(false);
    }
  };

  /**
   * Maneja el reporte "No encontrado" usando la cámara.
   */
  const handleNotFound = async () => {
    setShowCamera(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const backCamera = videoDevices.find((d) =>
        d.label.toLowerCase().includes("back")
      );

      const constraints = {
        video: backCamera
          ? { deviceId: { exact: backCamera.deviceId } }
          : { facingMode: "environment" },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error("Error al activar la cámara:", error);
    }
  };

  /**
   * Captura foto y sube reporte.
   * Se genera la imagen en formato PNG.
   */
  const capturePhoto = async () => {
    if (!videoRef.current || !business || !agentLocation) return;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const stream = videoRef.current.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const photoBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    const storageRef = ref(
      storage,
      `reportes/${business.id}/${Date.now()}.png`
    );
    await uploadBytes(storageRef, photoBlob, { contentType: "image/png" });
    const photoURL = await getDownloadURL(storageRef);

    const auth = getAuth();
    const user = auth.currentUser;
    const timestamp = new Date().toISOString();

    const reportData = {
      businessId: business.id,
      agentId: user.uid,
      date: timestamp,
      location: {
        Lat: agentLocation.latitude,
        Lng: agentLocation.longitude,
      },
      photoURL,
    };

    await addDoc(collection(db, "reportes"), reportData);

    const updatedReports = (business.reportes || 0) + 1;
    const updatedStatus = updatedReports >= 5 ? "inactivo" : business.status;

    await updateDoc(doc(db, "negocios", business.id), {
      reportes: updatedReports,
      status: updatedStatus,
    });

    setBusiness((prev) => ({
      ...prev,
      reportes: updatedReports,
      status: updatedStatus,
    }));

    setShowCamera(false);
    setShowAlert(true);

    if (updatedReports >= 5) {
      alert("El negocio ahora está inactivo debido a múltiples reportes.");
    }
  };

  /**
   * Verifica si el negocio pagó hoy.
   */
  const checkPaymentStatus = async () => {
    if (!business) return;

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).toISOString();
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).toISOString();

    const paymentsQuery = query(
      collection(db, "cobros"),
      where("businessId", "==", business.id),
      where("date", ">=", startOfDay),
      where("date", "<=", endOfDay)
    );

    const querySnapshot = await getDocs(paymentsQuery);
    setHasPaidToday(!querySnapshot.empty);
  };

  /**
   * Función para confirmar la reactivación del negocio.
   */
  const handleReactivateConfirm = async () => {
    try {
      await updateDoc(doc(db, "negocios", business.id), {
        status: "activo",
        reportes: 0,
      });
      setBusiness((prev) => ({ ...prev, status: "activo", reportes: 0 }));
      setShowReactivateAlert(false);
    } catch (error) {
      console.error("Error al reactivar el negocio:", error);
      setShowReactivateAlert(false);
    }
  };

  /**
   * Lógica para registrar un costo extra.
   * Se abre un modal donde se ingresa el concepto y la cantidad, se guarda en la colección "costosExtras"
   * y se actualiza el total a cobrar. Además, si se marca el checkbox se guarda el concepto en "conceptosExtra"
   * para sugerencias futuras. Se almacena cada costo extra en el estado extraCosts para mostrarlo en el comprobante.
   */
  const handleExtraCostSubmit = async () => {
    if (!extraConcept || !extraAmount) {
      toast.error("Debe ingresar concepto y cantidad");
      return;
    }
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const timestamp = new Date().toISOString();

      const extraCostData = {
        businessId: business.id,
        agentId: user.uid,
        concept: extraConcept,
        amount: Number(extraAmount),
        date: timestamp,
      };

      await addDoc(collection(db, "costosExtras"), extraCostData);

      if (saveConcept) {
        const conceptQuery = query(
          collection(db, "conceptosExtra"),
          where("concept", "==", extraConcept)
        );
        const conceptSnapshot = await getDocs(conceptQuery);
        if (conceptSnapshot.empty) {
          await addDoc(collection(db, "conceptosExtra"), { concept: extraConcept });
        }
      }

      setExtraTotal((prev) => prev + Number(extraAmount));
      setExtraCosts((prev) => [
        ...prev,
        { concept: extraConcept, amount: Number(extraAmount) },
      ]);

      setExtraConcept("");
      setExtraAmount("");
      setSaveConcept(false);
      setShowExtraModal(false);
      toast.success("Costo extra registrado correctamente");
    } catch (error) {
      console.error("Error al registrar costo extra:", error);
      toast.error("Error al registrar costo extra");
    }
  };

  // Obtener sugerencias de conceptos al abrir el modal
  useEffect(() => {
    if (showExtraModal) {
      const fetchSuggestions = async () => {
        try {
          const suggestionsSnapshot = await getDocs(
            collection(db, "conceptosExtra")
          );
          const suggestions = suggestionsSnapshot.docs.map(
            (doc) => doc.data().concept
          );
          setConceptSuggestions(suggestions);
        } catch (error) {
          console.error("Error al obtener sugerencias de conceptos:", error);
        }
      };
      fetchSuggestions();
    }
  }, [showExtraModal, db]);

  // Cargar datos del negocio
  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const businessDoc = await getDoc(doc(db, "negocios", businessId));
        if (businessDoc.exists()) {
          setBusiness({ id: businessDoc.id, ...businessDoc.data() });
        } else {
          console.error("Negocio no encontrado.");
        }
      } catch (error) {
        console.error("Error al obtener el negocio:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBusiness();
  }, [businessId, db]);

  // Obtener ubicación del agente
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setAgentLocation({ latitude, longitude });
        },
        (err) => {
          console.error("Error al obtener ubicación del agente:", err);
        }
      );
    }
  }, []);

  // Revisar pago al montar
  useEffect(() => {
    if (business) {
      checkPaymentStatus();
    }
  }, [business]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <img src={cargandoNegocio} alt="Cargando negocio..." />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <img
          src={errorImage}
          alt="Error negocio no encontrado"
          className="w-1/2 max-w-sm mb-6"
        />
        <h1 className="text-2xl font-bold text-[#861E3D] mb-4 text-center">
          Negocio no encontrado
        </h1>
        <button
          onClick={() => navigate("/cobrador")}
          className="px-6 py-3 bg-[#861E3D] text-white rounded-lg shadow hover:bg-[#701730] transition duration-300"
        >
          Regresar al inicio
        </button>
      </div>
    );
  }

  // Render principal
  return (
    <div
      className="flex flex-col min-h-screen bg-cover bg-center"
      style={{ backgroundImage: `url(${bgApp})` }}
    >
      {/* Header */}
      <header className="w-full p-4 flex items-center relative bg-opacity-80">
        <button
          onClick={() => navigate("/cobrador")}
          className="bg-[#861E3D] text-white p-3 rounded-full hover:bg-[#701730] flex items-center justify-center absolute left-4"
        >
          <FaArrowLeft size={20} />
        </button>
        <div className="flex-1 flex justify-center">
          <img src={logo} alt="Logo" style={{ width: "150px" }} className="h-auto" />
        </div>
      </header>

      {/* Modal para la cámara */}
      {showCamera && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4 text-center">Capturar Foto</h2>
            <video
              ref={videoRef}
              className="w-full h-auto rounded-lg mb-4"
              playsInline
            ></video>
            <div className="flex justify-between">
              <button
                onClick={() => setShowCamera(false)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancelar
              </button>
              <button
                onClick={capturePhoto}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Capturar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alertas (para reporte enviado) */}
      {showAlert && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-2xl font-bold text-center mb-4 text-green-600">
              ¡Reporte enviado!
            </h2>
            <p className="text-center text-gray-700 mb-6">
              El reporte ha sido enviado exitosamente.
            </p>
            <button
              onClick={() => navigate("/cobrador")}
              className="px-4 py-2 bg-[#861E3D] text-white rounded hover:bg-[#701730] w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Reactivación */}
      {showReactivateAlert && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-[#861E3D] text-center">
              Confirmar Reactivación
            </h2>
            <p className="mb-6 text-center text-gray-700">
              ¿Estás seguro de que deseas reactivar este negocio?
            </p>
            <div className="flex justify-between">
              <button
                onClick={() => setShowReactivateAlert(false)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-1/2 mr-2"
              >
                Cancelar
              </button>
              <button
                onClick={handleReactivateConfirm}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 w-1/2 ml-2"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para registrar costo extra */}
      {showExtraModal && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-center">Registrar Costo Extra</h2>
            <div className="mb-4">
              <label className="block text-gray-700">Concepto:</label>
              <input
                type="text"
                value={extraConcept}
                onChange={(e) => setExtraConcept(e.target.value)}
                placeholder="Ingrese concepto"
                className="w-full p-2 border rounded"
              />
              {/* Sugerencias de concepto */}
              {extraConcept && conceptSuggestions.length > 0 && (
                <div className="mt-2 bg-gray-100 p-2 rounded">
                  <p className="text-sm text-gray-500">Sugerencias:</p>
                  <ul>
                    {conceptSuggestions
                      .filter((s) =>
                        s.toLowerCase().includes(extraConcept.toLowerCase())
                      )
                      .map((s, index) => (
                        <li
                          key={index}
                          onClick={() => setExtraConcept(s)}
                          className="cursor-pointer hover:underline"
                        >
                          {s}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-gray-700">Cantidad:</label>
              <input
                type="number"
                value={extraAmount}
                onChange={(e) => setExtraAmount(e.target.value)}
                placeholder="Ingrese cantidad"
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="mb-4 flex items-center">
              <input
                type="checkbox"
                checked={saveConcept}
                onChange={(e) => setSaveConcept(e.target.checked)}
                className="mr-2"
              />
              <label className="text-gray-700">Guardar concepto</label>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setShowExtraModal(false)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleExtraCostSubmit}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Información del negocio */}
      <div className="flex flex-col items-center mt-8 px-4">
        <h1 className="text-3xl font-bold text-[#861E3D] mb-2">{business.name}</h1>
        <p className="text-xl text-gray-600 mb-4">{business.owner}</p>

        <div className="flex items-center justify-center gap-4 mb-6 w-full max-w-md">
          {/* Botón de WhatsApp */}
          <div className="bg-[#861E3D] flex items-center gap-2 text-white px-4 py-2 rounded-lg">
            <FaWhatsapp />
            <span>{business.phone}</span>
          </div>

          {/* Botón de descarga del QR */}
          {business.qrUrl && (
            <button
              onClick={() => downloadQR(business.qrUrl, business.name)}
              className="bg-[#861E3D] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-[#701730]"
            >
              <IoQrCode />
            </button>
          )}

          {/* Botón para agregar costo extra */}
          <button
            onClick={() => setShowExtraModal(true)}
            className="bg-[#861E3D] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-[#701730]"
          >
            <FaPlus />
          </button>
        </div>

        {/* Si el negocio está inactivo, mostramos un mensaje y el switch para reactivarlo */}
        {business.status === "inactivo" && (
          <div className="mb-4">
            <p className="text-red-500 font-bold mb-2">
              Este negocio está inactivo.
            </p>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setShowReactivateAlert(true);
                    }
                  }}
                />
                <div className="block bg-gray-300 w-14 h-8 rounded-full"></div>
                <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
              </div>
              <span className="ml-3 text-gray-700 font-medium">
                Reactivar negocio
              </span>
            </label>
          </div>
        )}

        {/* Botón de COBRAR */}
        <button
          className={`w-3/4 py-4 rounded-lg text-xl mb-4 ${
            business.status === "inactivo"
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : hasPaidToday
              ? "bg-green-500 text-white cursor-not-allowed"
              : "bg-[#861E3D] text-white"
          }`}
          disabled={business.status === "inactivo" || hasPaidToday}
          onClick={handlePayment}
        >
          {hasPaidToday
            ? "PAGADO"
            : `COBRAR $${(Number(business.quota) + extraTotal).toFixed(2)}`}
        </button>

        {/* Botón "No encontrado" */}
        {!hasPaidToday && (
          <button
            className={`w-3/4 py-4 rounded-lg text-xl ${
              business.status === "inactivo"
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#c7a26d] text-white"
            }`}
            disabled={business.status === "inactivo"}
            onClick={handleNotFound}
          >
            No encontrado
          </button>
        )}
      </div>

      {/* Animación de Carga durante el Proceso de Cobro */}
      {isProcessing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <img src={cobroGif} alt="Procesando cobro..." className="w-32 h-32" />
        </div>
      )}

      {/* Toast Container para mostrar las notificaciones */}
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default SingleBusinessPage;

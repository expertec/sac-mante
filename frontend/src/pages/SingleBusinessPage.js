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
import bgApp from "../assets/bg-app.png";
import logo from "../assets/logo.png";
import cobroGif from "../assets/cobro.gif"; // Animación de carga
import { FaArrowLeft, FaPlus } from "react-icons/fa";
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

// Toastify para notificaciones
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SingleBusinessPage = () => {
  const { businessId } = useParams();
  const navigate = useNavigate();

  // Estados generales
  const [business, setBusiness] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasPaidToday, setHasPaidToday] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const [showAlert, setShowAlert] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal de Reactivación
  const [showReactivateAlert, setShowReactivateAlert] = useState(false);

  // Estados para el modal de costo extra
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraConcept, setExtraConcept] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [saveConcept, setSaveConcept] = useState(false);
  const [conceptSuggestions, setConceptSuggestions] = useState([]);
  const [extraTotal, setExtraTotal] = useState(0);
  const [extraCosts, setExtraCosts] = useState([]);

  // Estados para Recarga de Saldo (opción en el menú, actualmente comentada)
  const [showRecargaModal, setShowRecargaModal] = useState(false);
  const [recargaAmount, setRecargaAmount] = useState("");

  // Estado para el modal de Abono
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState("");

  // Estado para el historial de transacciones
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [transactions, setTransactions] = useState([]);

  // Estado para la acción de captura (puede ser "reporte" o "adeudo")
  const [captureAction, setCaptureAction] = useState(null);

  // Estado para el menú desplegable del botón "+"
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Estado para el modo adeudo
  const [modoAdeudo, setModoAdeudo] = useState(false);

  const db = getFirestore();
  const storage = getStorage();

  // Función para obtener el siguiente folio (para cobros)
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

  // Función para descargar el QR del negocio
  const downloadQR = (qrUrl, name) => {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${name}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para el cobro normal
  const handlePayment = async () => {
    if (!business || !agentLocation) return;
    try {
      setIsProcessing(true);
      const auth = getAuth();
      const user = auth.currentUser;
      const agentName = user.displayName || user.email || "Agente";

      const folioNumber = await getNextFolio();
      const formattedFolio = folioNumber.toString().padStart(4, "0");

      // Monto total a cobrar (cuota base + costos extras)
      const totalAmount = Number(business.quota || 0) + extraTotal;
      const availableCredit = Number(business.saldo || 0);
      let appliedCredit = 0;
      let netAmount = totalAmount;

      if (availableCredit > 0) {
        if (availableCredit >= totalAmount) {
          appliedCredit = totalAmount;
          netAmount = 0;
        } else {
          appliedCredit = availableCredit;
          netAmount = totalAmount - availableCredit;
        }
      }

      const transactionData = {
        businessId: business.id,
        agentId: user.uid,
        agentName,
        folio: formattedFolio,
        date: Timestamp.now(),
        totalAmount,
        appliedCredit,
        netAmount,
        location: {
          Lat: agentLocation.latitude,
          Lng: agentLocation.longitude,
        },
        businessPhone: business.phone,
        businessName: business.name,
      };

      const docRef = await addDoc(collection(db, "cobros"), transactionData);

      const extraCostsHtml =
        extraCosts.length > 0
          ? extraCosts
              .map(
                (item) =>
                  `<p style="margin: 0; font-size: 1.2rem; color: #000;">${item.concept}: $${Number(item.amount).toFixed(2)}</p>`
              )
              .join("")
          : `<p style="margin: 0; font-size: 1.2rem; color: #000;">$0.00</p>`;

      const receiptHtml = `
        <div id="receipt" style="max-width: 400px; margin: -20px auto 0; padding: 10px 20px 20px; font-family: Arial, sans-serif; text-align: center; border: 2px solid #861E3D; border-radius: 12px; background-color: #fff; color: #333;">
          <img src="${logo}" alt="Logo" style="max-width: 150px; margin: 10px auto;" />
          <h1 style="color: #861E3D; font-size: 1.5rem; margin: 10px 0;">Pago exitoso.</h1>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Folio:</p>
          <h2 style="font-size: 1.8rem; font-weight: bold; color: #ad8118; margin: 5px 0;">Folio: ${formattedFolio}</h2>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto base:</p>
          <h2 style="font-size: 2rem; font-weight: bold; color: #000; margin: 5px 0;">$${Number(business.quota || 0).toFixed(2)}</h2>
          <div style="margin: 10px 0;">
            <p style="font-size: 1rem; color: #555; margin: 5px 0;">Costos Extras:</p>
            ${extraCostsHtml}
          </div>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto Total:</p>
          <h2 style="font-size: 2rem; font-weight: bold; color: #000; margin: 5px 0;">$${totalAmount.toFixed(2)}</h2>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Aplicado de Saldo:</p>
          <h2 style="font-size: 1.8rem; font-weight: bold; color: #861E3D; margin: 5px 0;">$${appliedCredit.toFixed(2)}</h2>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto en Efectivo:</p>
          <h2 style="font-size: 1.8rem; font-weight: bold; color: #000; margin: 5px 0;">$${netAmount.toFixed(2)}</h2>
          <p style="font-size: 0.9rem; color: #777; margin: 5px 0;">${new Date().toLocaleString()}</p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            Cobrado por: <span style="color: #861E3D;">${agentName}</span>
          </p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            Pagado por: <span style="color: #861E3D;">${business.name}</span>
          </p>
          <p style="font-size: 0.8rem; color: #555; margin: 5px 0;">Código de transacción:</p>
          <p style="font-size: 1rem; font-weight: bold; color: #861E3D; margin: 5px 0;">${docRef.id}</p>
          <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
            <p style="font-size: 0.6rem; color: #555; text-align: left;">
              Nota: Pago realizado con saldo a favor previamente abonado.
            </p>
          </div>
        </div>
      `;

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = receiptHtml;
      document.body.appendChild(tempDiv);
      const receiptElement = document.getElementById("receipt");
      const canvas = await html2canvas(receiptElement);
      const imageBase64 = canvas.toDataURL("image/png");
      document.body.removeChild(tempDiv);

      const storageRef = ref(storage, `receipts/${docRef.id}.png`);
      await uploadString(
        storageRef,
        imageBase64.split(",")[1],
        "base64",
        { contentType: "image/png" }
      );
      const receiptUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "cobros", docRef.id), { receiptUrl });

      // Actualizar el saldo en el negocio
      const nuevoSaldo = availableCredit - appliedCredit;
      await updateDoc(doc(db, "negocios", business.id), { saldo: nuevoSaldo });
      setBusiness((prev) => ({ ...prev, saldo: nuevoSaldo }));

      setIsProcessing(false);
      navigate("/recibo", {
        state: { transaction: { id: docRef.id, ...transactionData, receiptUrl } },
      });
    } catch (error) {
      console.error("Error al procesar el cobro:", error);
      setIsProcessing(false);
      toast.error("Error al procesar el cobro");
    }
  };

  // Función para el abono (descuenta de la deuda, el sobrante se suma al saldo)
  const handleAbono = async () => {
    if (!business || !agentLocation || !abonoAmount) return;
    try {
      setIsProcessing(true);
      const auth = getAuth();
      const user = auth.currentUser;
      const agentName = user.displayName || user.email || "Agente";

      const folioNumber = await getNextFolio();
      const formattedFolio = folioNumber.toString().padStart(4, "0");

      const abonoValue = Number(abonoAmount);

      const currentDebt = Number(business.adeudo || 0);
      const currentSaldo = Number(business.saldo || 0);
      let newDebt = currentDebt;
      let remainder = 0;

      if (currentDebt > 0) {
        if (abonoValue <= currentDebt) {
          newDebt = currentDebt - abonoValue;
        } else {
          remainder = abonoValue - currentDebt;
          newDebt = 0;
        }
      } else {
        remainder = abonoValue;
      }

      const transactionData = {
        businessId: business.id,
        agentId: user.uid,
        agentName,
        folio: formattedFolio,
        date: Timestamp.now(),
        totalAmount: abonoValue,
        appliedCredit: 0,
        netAmount: abonoValue,
        location: {
          Lat: agentLocation.latitude,
          Lng: agentLocation.longitude,
        },
        businessPhone: business.phone,
        businessName: business.name,
        tipo: "abono",
      };

      const docRef = await addDoc(collection(db, "cobros"), transactionData);

      const receiptHtml = `
        <div id="receipt" style="max-width: 400px; margin: -20px auto 0; padding: 10px 20px 20px; font-family: Arial, sans-serif; text-align: center; border: 2px solid #861E3D; border-radius: 12px; background-color: #fff; color: #333;">
          <img src="${logo}" alt="Logo" style="max-width: 150px; margin: 10px auto;" />
          <h1 style="color: #861E3D; font-size: 1.5rem; margin: 10px 0;">Abono exitoso.</h1>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Folio:</p>
          <h2 style="font-size: 1.8rem; font-weight: bold; color: #ad8118; margin: 5px 0;">Folio: ${formattedFolio}</h2>
          <p style="font-size: 1rem; color: #555; margin: 5px 0;">Monto Abonado:</p>
          <h2 style="font-size: 2rem; font-weight: bold; color: #000; margin: 5px 0;">$${abonoValue.toFixed(2)}</h2>
          <p style="font-size: 0.9rem; color: #777; margin: 5px 0;">${new Date().toLocaleString()}</p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            Abonado por: <span style="color: #861E3D;">${agentName}</span>
          </p>
          <p style="font-size: 1rem; font-weight: bold; color: #555; margin: 5px 0;">
            A cargo de: <span style="color: #861E3D;">${business.name}</span>
          </p>
          <p style="font-size: 0.8rem; color: #555; margin: 5px 0;">Código de transacción:</p>
          <p style="font-size: 1rem; font-weight: bold; color: #861E3D; margin: 5px 0;">${docRef.id}</p>
        </div>
      `;

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = receiptHtml;
      document.body.appendChild(tempDiv);
      const receiptElement = document.getElementById("receipt");
      const canvas = await html2canvas(receiptElement);
      const imageBase64 = canvas.toDataURL("image/png");
      document.body.removeChild(tempDiv);

      const storageRef = ref(storage, `receipts/${docRef.id}.png`);
      await uploadString(
        storageRef,
        imageBase64.split(",")[1],
        "base64",
        { contentType: "image/png" }
      );
      const receiptUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "cobros", docRef.id), { receiptUrl });

      const newSaldo = currentSaldo + remainder;
      await updateDoc(doc(db, "negocios", business.id), { 
        adeudo: newDebt, 
        saldo: newSaldo 
      });
      setBusiness((prev) => ({ ...prev, adeudo: newDebt, saldo: newSaldo }));

      setIsProcessing(false);
      setShowAbonoModal(false);
      setAbonoAmount("");
      navigate("/recibo", {
        state: { transaction: { id: docRef.id, ...transactionData, receiptUrl } },
      });
    } catch (error) {
      console.error("Error al procesar el abono:", error);
      setIsProcessing(false);
      toast.error("Error al procesar el abono");
    }
  };

  // Función para iniciar el flujo de "No encontrado" (reporte)
  const handleNotFound = async () => {
    setCaptureAction("reporte");
    setShowCamera(true);
  };

  // Efecto para solicitar la cámara cuando se abre el modal
  useEffect(() => {
    if (showCamera) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      let constraints;
      if (isMobile) {
        constraints = { video: { facingMode: { exact: "environment" } } };
      } else {
        constraints = { video: true };
      }
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch((error) => {
          console.error("Error al activar la cámara:", error);
          toast.error("Error al activar la cámara");
        });
    }
  }, [showCamera]);

  // Función para capturar la foto
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
    if (captureAction === "adeudo") {
      await handleDebtPhoto(photoBlob);
    } else if (captureAction === "reporte") {
      await handleReportePhoto(photoBlob);
    }
  };

  // Función para procesar el reporte "No encontrado"
  const handleReportePhoto = async (photoBlob) => {
    try {
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
    } catch (error) {
      console.error("Error al enviar el reporte:", error);
      toast.error("Error al enviar el reporte");
    }
  };

  // Función para capturar foto y registrar un adeudo
  const handleDebtPhoto = async (photoBlob) => {
    try {
      const storageRef = ref(
        storage,
        `adeudos/${business.id}/${Date.now()}.png`
      );
      await uploadBytes(storageRef, photoBlob, { contentType: "image/png" });
      const photoURL = await getDownloadURL(storageRef);
      const auth = getAuth();
      const user = auth.currentUser;
      const agentName = user.displayName || user.email || "Agente";
      const baseAmount = Number(business.quota || 0);
      const newDebtAmount = baseAmount + extraTotal;
      
      let appliedCredit = 0;
      let debtToRegister = newDebtAmount;
      let remainingSaldo = Number(business.saldo || 0);
      if (remainingSaldo > 0) {
        if (remainingSaldo >= newDebtAmount) {
          appliedCredit = newDebtAmount;
          debtToRegister = 0;
          remainingSaldo = remainingSaldo - newDebtAmount;
        } else {
          appliedCredit = remainingSaldo;
          debtToRegister = newDebtAmount - remainingSaldo;
          remainingSaldo = 0;
        }
      }

      const debtData = {
        businessId: business.id,
        agentId: user.uid,
        agentName,
        date: Timestamp.now(),
        baseAmount,
        extraCosts,
        totalAmount: newDebtAmount,
        appliedCredit,
        debtToRegister,
        location: {
          Lat: agentLocation.latitude,
          Lng: agentLocation.longitude,
        },
        photoURL,
      };

      await addDoc(collection(db, "adeudos"), debtData);
      setShowCamera(false);
      toast.success("Adeudo registrado exitosamente");

      const nuevoAdeudo = (business.adeudo || 0) + debtToRegister;
      await updateDoc(doc(db, "negocios", business.id), { 
        adeudo: nuevoAdeudo, 
        saldo: remainingSaldo 
      });
      setBusiness((prev) => ({
        ...prev,
        adeudo: nuevoAdeudo,
        saldo: remainingSaldo,
      }));
      setExtraTotal(0);
      setExtraCosts([]);
      setModoAdeudo(false);
    } catch (error) {
      console.error("Error al registrar el adeudo:", error);
      toast.error("Error al registrar el adeudo");
    }
  };

  // Función para verificar si el negocio pagó hoy
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

  // Función para confirmar la reactivación del negocio
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

  // Función para registrar un costo extra
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

  // Función para manejar la recarga de saldo (opción actualmente comentada en el menú)
  const handleRecarga = async () => {
    if (!recargaAmount || Number(recargaAmount) <= 0) {
      toast.error("Ingrese un monto válido para recargar");
      return;
    }
    try {
      const montoRecarga = Number(recargaAmount);
      const auth = getAuth();
      const user = auth.currentUser;
      const timestamp = Timestamp.now();

      const currentDebt = Number(business.adeudo || 0);
      const currentSaldo = Number(business.saldo || 0);
      let nuevoAdeudo = currentDebt;
      let nuevoSaldo = currentSaldo;

      if (currentDebt > 0) {
        if (montoRecarga >= currentDebt) {
          nuevoAdeudo = 0;
          nuevoSaldo += (montoRecarga - currentDebt);
        } else {
          nuevoAdeudo = currentDebt - montoRecarga;
        }
      } else {
        nuevoSaldo += montoRecarga;
      }

      const recargaData = {
        businessId: business.id,
        agentId: user.uid,
        amount: montoRecarga,
        date: timestamp,
      };
      await addDoc(collection(db, "recargas"), recargaData);

      const ingresoDiarioData = {
        businessId: business.id,
        agentId: user.uid,
        amount: currentDebt > 0 ? Math.max(0, montoRecarga - currentDebt) : montoRecarga,
        date: timestamp,
      };
      await addDoc(collection(db, "ingresosDiarios"), ingresoDiarioData);

      await updateDoc(doc(db, "negocios", business.id), { 
        adeudo: nuevoAdeudo, 
        saldo: nuevoSaldo 
      });
      setBusiness((prev) => ({
        ...prev,
        adeudo: nuevoAdeudo,
        saldo: nuevoSaldo,
      }));
      setRecargaAmount("");
      setShowRecargaModal(false);
      toast.success("Saldo recargado exitosamente");
    } catch (error) {
      console.error("Error al recargar saldo:", error);
      toast.error("Error al recargar saldo");
    }
  };

  // Función para obtener el historial de transacciones (cobros y adeudos)
  const fetchTransactionHistory = async () => {
    try {
      const cobrosQuery = query(
        collection(db, "cobros"),
        where("businessId", "==", business.id)
      );
      const cobrosSnapshot = await getDocs(cobrosQuery);
      const cobros = cobrosSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        collection: "cobros",
      }));
      const adeudosQuery = query(
        collection(db, "adeudos"),
        where("businessId", "==", business.id)
      );
      const adeudosSnapshot = await getDocs(adeudosQuery);
      const adeudos = adeudosSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        collection: "adeudos",
      }));
      const combined = [...cobros, ...adeudos].sort((a, b) => {
        const dateA = a.date.seconds ? a.date.seconds : new Date(a.date).getTime() / 1000;
        const dateB = b.date.seconds ? b.date.seconds : new Date(b.date).getTime() / 1000;
        return dateB - dateA;
      });
      setTransactions(combined);
    } catch (error) {
      console.error("Error al obtener historial de transacciones:", error);
      toast.error("Error al cargar el historial");
    }
  };

  useEffect(() => {
    if (showHistoryModal && business) {
      fetchTransactionHistory();
    }
  }, [showHistoryModal, business]);

  useEffect(() => {
    if (showExtraModal) {
      const fetchSuggestions = async () => {
        try {
          const suggestionsSnapshot = await getDocs(
            collection(db, "conceptosExtra")
          );
          const suggestions = suggestionsSnapshot.docs.map((doc) => doc.data().concept);
          setConceptSuggestions(suggestions);
        } catch (error) {
          console.error("Error al obtener sugerencias de conceptos:", error);
        }
      };
      fetchSuggestions();
    }
  }, [showExtraModal, db]);

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
        <img src={errorImage} alt="Error negocio no encontrado" className="w-1/2 max-w-sm mb-6" />
        <h1 className="text-2xl font-bold text-[#861E3D] mb-4 text-center">Negocio no encontrado</h1>
        <button
          onClick={() => navigate("/cobrador")}
          className="px-6 py-3 bg-[#861E3D] text-white rounded-lg shadow hover:bg-[#701730] transition duration-300"
        >
          Regresar al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-cover bg-center" style={{ backgroundImage: `url(${bgApp})` }}>
      {/* Header con logo, nombre del negocio y propietario */}
      <header className="w-full p-4 flex flex-col items-center relative bg-opacity-80">
        <button
          onClick={() => navigate("/cobrador")}
          className="bg-[#861E3D] text-white p-3 rounded-full hover:bg-[#701730] flex items-center justify-center absolute left-4 top-4"
        >
          <FaArrowLeft size={20} />
        </button>
        <img src={logo} alt="Logo" style={{ width: "150px" }} className="h-auto" />
        {business && (
          <div className="mt-2 text-center">
            <h1 className="text-3xl font-bold text-[#861E3D]">{business.name}</h1>
            <p className="text-base text-gray-500">{business.owner}</p>
          </div>
        )}
      </header>

      {/* Bloque superior: Teléfono, QR y menú */}
      <div className="flex items-center justify-center gap-4 mb-6 w-full max-w-md mx-auto">
        <div className="bg-[#861E3D] flex items-center gap-2 text-white px-4 py-2 rounded-lg">
          <FaWhatsapp />
          <span>{business.phone}</span>
        </div>
        {business.qrUrl && (
          <button
            onClick={() => downloadQR(business.qrUrl, business.name)}
            className="bg-[#861E3D] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-[#701730]"
          >
            <IoQrCode />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="bg-[#861E3D] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-[#701730]"
          >
            <FaPlus />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded shadow-lg z-50">
              <button
                onClick={() => {
                  setShowExtraModal(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Costo Extra
              </button>
              <button
                onClick={() => {
                  setModoAdeudo(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Registrar Adeudo
              </button>
              {/*
              <button
                onClick={() => {
                  setShowRecargaModal(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Recargar Saldo
              </button>
              */}
              <button
                onClick={() => {
                  setShowAbonoModal(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Registrar Abono
              </button>
              <button
                onClick={() => {
                  setShowHistoryModal(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Historial
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Opción para activar negocio si está inactivo */}
      {business.status === "inactivo" && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setShowReactivateAlert(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Activar Negocio
          </button>
        </div>
      )}

      {/* Bloque de botones principales */}
      <div className="flex flex-col items-center px-4">
        {modoAdeudo ? (
          <button
            className="w-3/4 py-4 rounded-lg text-xl mb-4 bg-red-600 text-white"
            onClick={() => {
              setCaptureAction("adeudo");
              setShowCamera(true);
            }}
          >
            Registrar Adeudo $ {(Number(business.quota) + extraTotal).toFixed(2)}
          </button>
        ) : (
          <button
            className={`w-3/4 py-4 rounded-lg text-xl mb-4 ${
              business.status === "inactivo" || hasPaidToday
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#861E3D] text-white"
            }`}
            disabled={business.status === "inactivo" || hasPaidToday}
            onClick={handlePayment}
          >
            {hasPaidToday
              ? "PAGADO"
              : `COBRAR $${(
                  Number(business.quota) +
                  extraTotal +
                  Number(business.adeudo || 0)
                ).toFixed(2)}`}
          </button>
        )}

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

      {/* Chips de Adeudo o Saldo a favor */}
      <div className="flex justify-center mt-4">
        {business.adeudo > 0 ? (
          <span className="bg-red-500 text-white rounded-full px-3 py-1 text-sm">
            Adeudo: ${Number(business.adeudo).toFixed(2)}
          </span>
        ) : business.saldo > 0 ? (
          <span className="bg-green-500 text-white rounded-full px-3 py-1 text-sm">
            Saldo a favor: ${Number(business.saldo).toFixed(2)}
          </span>
        ) : null}
      </div>

      {/* Modal para la cámara */}
      {showCamera && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4 text-center">
              {captureAction === "adeudo" ? "Capturar foto para Adeudo" : "Capturar Foto"}
            </h2>
            <video ref={videoRef} className="w-full h-auto rounded-lg mb-4" playsInline></video>
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setShowCamera(false);
                  setCaptureAction(null);
                }}
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

      {/* Modal de Historial de Transacciones (pantalla completa) */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Historial de Transacciones</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-red-500 text-xl font-bold"
              >
                Cerrar
              </button>
            </div>
            {transactions.length === 0 ? (
              <p className="text-center text-gray-500">No hay transacciones registradas.</p>
            ) : (
              <ul className="space-y-4">
                {transactions.map((trans) => (
                  <li key={trans.id} className="border p-4 rounded shadow">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">
                        {trans.tipo === "abono"
                          ? "Abono"
                          : trans.collection === "adeudos"
                          ? "Adeudo"
                          : "Cobro"}
                      </span>
                      <span className="text-sm text-gray-600">
                        {trans.date.seconds
                          ? new Date(trans.date.seconds * 1000).toLocaleString()
                          : new Date(trans.date).toLocaleString()}
                      </span>
                    </div>
                    {trans.folio && (
                      <p>
                        <span className="font-bold">Folio:</span> {trans.folio}
                      </p>
                    )}
                    <p>
                      <span className="font-bold">
                        {trans.tipo === "abono"
                          ? "Monto Abonado:"
                          : trans.collection === "adeudos"
                          ? "Monto Adeudado:"
                          : "Monto:"}
                      </span>{" "}
                      ${Number(trans.totalAmount).toFixed(2)}
                    </p>
                    {trans.collection === "adeudos" && trans.photoURL && (
                      <div className="mt-2">
                        <img
                          src={trans.photoURL}
                          alt="Foto del adeudo"
                          className="max-w-full h-auto border rounded"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Modal para Recarga de Saldo (opcional, actualmente comentado en el menú) */}
      {showRecargaModal && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-center">Recargar Saldo</h2>
            <div className="mb-4">
              <label className="block text-gray-700">Monto a recargar:</label>
              <input
                type="number"
                value={recargaAmount}
                onChange={(e) => setRecargaAmount(e.target.value)}
                placeholder="Ingrese monto"
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setShowRecargaModal(false)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-1/2 mr-2"
              >
                Cancelar
              </button>
              <button
                onClick={handleRecarga}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 w-1/2 ml-2"
              >
                Recargar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Registrar Abono */}
      {showAbonoModal && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-center">Registrar Abono</h2>
            <div className="mb-4">
              <label className="block text-gray-700">Monto a abonar:</label>
              <input
                type="number"
                value={abonoAmount}
                onChange={(e) => setAbonoAmount(e.target.value)}
                placeholder="Ingrese monto"
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setShowAbonoModal(false);
                  setAbonoAmount("");
                }}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbono}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Registrar Abono
              </button>
            </div>
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

      {/* Modal para Costo Extra */}
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

      {/* Toast Container para notificaciones */}
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default SingleBusinessPage;

import React, { useState, useEffect } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";

// Importar la imagen de fondo (verifica que la ruta sea correcta)
import bgPdf from "../assets/bgPdf.png";

dayjs.locale("es");
dayjs.extend(customParseFormat);

/**
 * Función auxiliar para convertir un número a letras (versión básica)
 */
function numberToSpanish(n) {
  const unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  if (n < 10) return unidades[n];
  else if (n >= 10 && n < 20) return especiales[n - 10];
  else if (n < 100) {
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    if (n === 20) return "veinte";
    else if (n < 30) return "veinti" + unidades[uni];
    else return decenas[dec] + (uni > 0 ? " y " + unidades[uni] : "");
  } else if (n < 1000) {
    const cent = Math.floor(n / 100);
    const rest = n % 100;
    if (n === 100) return "cien";
    else return (cent > 1 ? centenas[cent] : "ciento") + (rest > 0 ? " " + numberToSpanish(rest) : "");
  } else if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const rest = n % 1000;
    const milesText = miles === 1 ? "mil" : numberToSpanish(miles) + " mil";
    return milesText + (rest > 0 ? " " + numberToSpanish(rest) : "");
  } else {
    return n.toString();
  }
}

/**
 * Convierte el total numérico (con decimales) a texto en letras.
 */
function convertNumberToText(amount) {
  const entero = Math.floor(amount);
  const decimales = Math.round((amount - entero) * 100);
  const enteroText = numberToSpanish(entero);
  return `${enteroText.toUpperCase()} CON ${decimales < 10 ? "0" + decimales : decimales}/100`;
}

/**
 * Componente Calendar (sin modificaciones)
 */
function Calendar({ year, month, paymentsData }) {
  const currentDate = new Date(year, month);
  const monthName = currentDate.toLocaleString("es-ES", { month: "long", year: "numeric" });
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayLocal = new Date();
  const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const daysArray = Array.from({ length: daysInMonth }, (_, index) => {
    const dayDate = new Date(year, month, index + 1);
    const dayKey = dayjs(dayDate).format("YYYY-MM-DD");
    const dayPayments = paymentsData[dayKey] || [];
    return { date: dayDate, payments: dayPayments };
  });

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-100 border-b">
        <h2 className="text-lg font-semibold text-gray-700">{monthName}</h2>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-gray-600 border-b">
        {daysOfWeek.map((day) => (
          <div key={day} className="py-2 uppercase">
            {day.slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={i} className="py-2" />
        ))}
        {daysArray.map(({ date, payments }, i) => {
          const isToday = date.toDateString() === todayLocal.toDateString();
          let infoText = "No hay pagos";
          if (payments.length > 0) {
            const total = payments.reduce((acc, p) => acc + p.amount, 0);
            infoText = `Pagos: ${payments.length} (${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(total)})`;
          }
          let bgColor = "bg-gray-50 border-gray-200";
          if (isToday) bgColor = "bg-blue-100 border-blue-400";
          else if (payments.length > 0) bgColor = "bg-green-100 border-green-400";
          return (
            <div key={i} className={`p-2 h-24 flex flex-col justify-between rounded border ${bgColor}`}>
              <div className="text-right text-xs font-semibold text-gray-500">
                {isToday ? "Hoy" : date.getDate()}
              </div>
              <div className="text-sm text-gray-700">{infoText}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Componente AdminHome
 */
const AdminHome = () => {
  const db = getFirestore();

  // Estados para datos y estadísticas
  const [allCobros, setAllCobros] = useState([]);
  const [activeBusinesses, setActiveBusinesses] = useState(0);
  const [inactiveBusinesses, setInactiveBusinesses] = useState(0);
  const [todayPayments, setTodayPayments] = useState(0);
  const [selectedMonthPayments, setSelectedMonthPayments] = useState(0);

  // Estado para guardar el mapeo de agentes (agentId → name)
  const [agentMapping, setAgentMapping] = useState({});

  // Estados para el calendario y la fecha del reporte
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [paymentsData, setPaymentsData] = useState({});
  const [selectedReportDate, setSelectedReportDate] = useState(dayjs().format("YYYY-MM-DD"));

  // Obtener la lista de agentes desde la colección "users" (filtrando rol "Cobrador")
  useEffect(() => {
    async function fetchAgents() {
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const mapping = {};
        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.role === "Cobrador" && data.name) {
            mapping[docSnap.id] = data.name;
          }
        });
        setAgentMapping(mapping);
      } catch (err) {
        console.error("Error al obtener agentes:", err);
      }
    }
    fetchAgents();
  }, [db]);

  useEffect(() => {
    const defaultDate = dayjs(new Date(selectedYear, selectedMonth, 1)).format("YYYY-MM-DD");
    setSelectedReportDate(defaultDate);
  }, [selectedYear, selectedMonth]);

  const minDate = dayjs(new Date(selectedYear, selectedMonth, 1)).format("YYYY-MM-DD");
  const maxDate = dayjs(new Date(selectedYear, selectedMonth + 1, 0)).format("YYYY-MM-DD");

  const handleNextMonth = () => {
    let m = selectedMonth + 1;
    let y = selectedYear;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const handlePrevMonth = () => {
    let m = selectedMonth - 1;
    let y = selectedYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  // Función para generar y descargar el PDF
  const handleDownloadPDF = () => {
    const dayPayments = paymentsData[selectedReportDate] || [];
    if (dayPayments.length === 0) {
      alert("No se encontraron cobros para la fecha seleccionada.");
      return;
    }

    // Agrupar los pagos por agente, acumulando el total y recopilando los folios
    const agentData = {};
    dayPayments.forEach((payment) => {
      const agentId = payment.agentId;
      const agentName = agentMapping[agentId] || "N/A";
      if (!agentData[agentName]) {
        agentData[agentName] = { sum: 0, folios: [] };
      }
      agentData[agentName].sum += Number(payment.amount) || 0;
      // Suponemos que en cada documento "cobros" existe el campo "folio" con 4 dígitos (como "0003")
      if (payment.folio) {
        agentData[agentName].folios.push(payment.folio);
      }
    });

    // Convertir agentData en un array de filas para la tabla:
    // Cada fila: [Agente, Total Cobrado, Folios]
    const tableBody = Object.entries(agentData).map(([agent, data]) => [
      agent,
      new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(data.sum),
      data.folios.join(", "),
    ]);

    // Calcular la suma total de todos los agentes
    const totalSum = Object.values(agentData).reduce((acc, data) => acc + data.sum, 0);
    tableBody.push([
      "TOTAL",
      new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(totalSum),
      "",
    ]);

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Agregar imagen de fondo
    doc.addImage(bgPdf, "PNG", 0, 0, pageWidth, pageHeight);

    const marginSide = 10;
    const maxTitleWidth = pageWidth - marginSide * 2;
    const titleText = "RELACIÓN DE FOLIOS POR CONCEPTO DE COBRO POR USO DE VÍA PÚBLICA POR COMERCIANTES AMBULANTES";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(titleText, maxTitleWidth);
    const lineHeight = 5;
    const computedTitleHeight = titleLines.length * lineHeight;
    const gapBetweenTitleAndTable = 10;
    const startY = 50;

    // Dibujar el título centrado
    let currentTitleY = startY;
    titleLines.forEach((line, index) => {
      doc.text(line, pageWidth / 2, currentTitleY + index * lineHeight, { align: "center" });
    });

    const tableStartY = startY + computedTitleHeight + gapBetweenTitleAndTable;
    const reportDate = dayjs(selectedReportDate).format("D MMMM YYYY").toUpperCase();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(reportDate, pageWidth - 10, tableStartY - 5, { align: "right" });

    // Dibujar la tabla (tres columnas)
    doc.autoTable({
      startY: tableStartY,
      head: [["Agente", "Total Cobrado", "Folios"]],
      body: tableBody,
      styles: { font: "helvetica", fontSize: 10, halign: "center" },
      headStyles: {
        fillColor: [220, 220, 220],
        textColor: 0,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "left" },
      },
      theme: "grid",
    });

    // Firma
    const signatureY = pageHeight - 70;
    const leftMargin = 60;
    const rightMargin = 60;
    doc.setLineWidth(0.5);
    doc.line(leftMargin, signatureY, pageWidth - rightMargin, signatureY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("CP. MONICA LIZBETH REYES HERNANDEZ", pageWidth / 2, signatureY + 7, { align: "center" });
    doc.text("JEFA DE INGRESOS", pageWidth / 2, signatureY + 12, { align: "center" });

    doc.save(`Reporte_${selectedReportDate}.pdf`);
  };

  // Helpers para fechas
  function getLocalStartOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  }
  function getLocalEndOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  }
  function getLocalStartOfMonth(year, month) {
    return new Date(year, month, 1, 0, 0, 0);
  }
  function getLocalEndOfMonth(year, month) {
    return new Date(year, month + 1, 0, 23, 59, 59);
  }

  useEffect(() => {
    async function fetchData() {
      try {
        const paymentsSnapshot = await getDocs(collection(db, "cobros"));
        const usersSnapshot = await getDocs(collection(db, "users"));
        const cobrosArr = [];

        paymentsSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let paymentDate;
          if (data.date instanceof Timestamp) {
            paymentDate = data.date.toDate();
          } else if (typeof data.date === "string") {
            let replaced = data.date
              .replace("p. m.", "PM")
              .replace("a. m.", "AM")
              .replace(/ ?UTC-?\d+/, "");
            const parsed = dayjs(
              replaced,
              "D [de] MMMM [de] YYYY, h:mm:ss A",
              "es",
              true
            );
            paymentDate = parsed.isValid() ? parsed.toDate() : new Date();
          } else {
            paymentDate = new Date();
          }
          cobrosArr.push({
            ...data,
            paymentDate,
            amount: parseFloat(data.amount || 0),
          });
        });

        const mapping = {};
        let active = 0;
        let inactive = 0;
        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.role === "Cobrador" && data.name) {
            mapping[docSnap.id] = data.name;
          }
        });

        setAllCobros(cobrosArr);
        setAgentMapping(mapping);

        async function fetchNegocios() {
          try {
            const negociosSnapshot = await getDocs(collection(db, "negocios"));
            let activeCount = 0;
            let inactiveCount = 0;
            negociosSnapshot.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.status === "activo") activeCount++;
              else if (data.status === "inactivo") inactiveCount++;
            });
            setActiveBusinesses(activeCount);
            setInactiveBusinesses(inactiveCount);
          } catch (err) {
            console.error("Error al obtener negocios:", err);
          }
        }
        fetchNegocios();
      } catch (err) {
        console.error("Error al obtener datos:", err);
      }
    }
    fetchData();
  }, [db]);

  useEffect(() => {
    const now = new Date();
    const startToday = getLocalStartOfDay(now);
    const endToday = getLocalEndOfDay(now);
    let sumToday = 0;
    allCobros.forEach((c) => {
      if (c.paymentDate >= startToday && c.paymentDate <= endToday) {
        sumToday += c.amount;
      }
    });
    setTodayPayments(sumToday);
  }, [allCobros]);

  useEffect(() => {
    const startMonth = getLocalStartOfMonth(selectedYear, selectedMonth);
    const endMonth = getLocalEndOfMonth(selectedYear, selectedMonth);
    let sumMonth = 0;
    const map = {};
    allCobros.forEach((c) => {
      if (c.paymentDate >= startMonth && c.paymentDate <= endMonth) {
        sumMonth += c.amount;
        const dateKey = dayjs(c.paymentDate).format("YYYY-MM-DD");
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push(c);
      }
    });
    setSelectedMonthPayments(sumMonth);
    setPaymentsData(map);
  }, [allCobros, selectedMonth, selectedYear]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Panel de Estadísticas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white shadow-md rounded-lg p-4 flex items-center justify-between hover:shadow-lg transition-shadow">
          <div>
            <h2 className="text-xl font-semibold">Cobros de Hoy</h2>
            <p className="text-gray-600 text-lg mt-2">
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(todayPayments)}
            </p>
          </div>
          <div className="text-4xl text-blue-500">📅</div>
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 flex items-center justify-between hover:shadow-lg transition-shadow">
          <div>
            <h2 className="text-xl font-semibold">Cobros del Mes</h2>
            <p className="text-gray-600 text-lg mt-2">
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(selectedMonthPayments)}
            </p>
          </div>
          <div className="text-4xl text-green-500">💵</div>
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 flex items-center justify-between hover:shadow-lg transition-shadow">
          <div>
            <h2 className="text-xl font-semibold">Comercios Activos</h2>
            <p className="text-gray-600 text-lg mt-2">{activeBusinesses}</p>
          </div>
          <div className="text-4xl text-green-500">✔️</div>
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 flex items-center justify-between hover:shadow-lg transition-shadow">
          <div>
            <h2 className="text-xl font-semibold">Comercios Inactivos</h2>
            <p className="text-gray-600 text-lg mt-2">{inactiveBusinesses}</p>
          </div>
          <div className="text-4xl text-red-500">❌</div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={handlePrevMonth} className="mr-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
            Mes Anterior
          </button>
          <button onClick={handleNextMonth} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
            Mes Siguiente
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedReportDate}
            onChange={(e) => setSelectedReportDate(e.target.value)}
            min={minDate}
            max={maxDate}
            className="px-2 py-1 border rounded"
          />
          <button onClick={handleDownloadPDF} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Generar Reporte {dayjs(selectedReportDate).format("D MMMM YYYY")}
          </button>
        </div>
      </div>
      <Calendar year={selectedYear} month={selectedMonth} paymentsData={paymentsData} />
    </div>
  );
};

export default AdminHome;

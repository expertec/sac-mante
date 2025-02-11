// AdminHome.jsx
import React, { useState, useEffect } from "react";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";

// Importar la imagen de fondo para el PDF (verifica que la ruta sea correcta)
import bgPdf from "../assets/bgPdf.png";

dayjs.locale("es");
dayjs.extend(customParseFormat);

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

function convertNumberToText(amount) {
  const entero = Math.floor(amount);
  const decimales = Math.round((amount - entero) * 100);
  const enteroText = numberToSpanish(entero);
  return `${enteroText.toUpperCase()} CON ${decimales < 10 ? "0" + decimales : decimales}/100`;
}

/**
 * Componente Calendar actualizado para mostrar el calendario de ingresos diarios.
 * Se muestra el número de pagos en cada día y, si hay pagos, el total (sumando netAmount).
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
          let totalForDay = payments.reduce((sum, p) => sum + (p.netAmount !== undefined ? p.netAmount : p.amount), 0);
          let infoText = "Sin pagos";
          if (payments.length > 0) {
            infoText = `Pagos: ${payments.length} (${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(totalForDay)})`;
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
 * Componente AdminHome actualizado para mostrar ingresos diarios e históricos en tiempo real.
 */
const AdminHome = () => {
  const db = getFirestore();

  // Estados para datos y estadísticas
  const [allCobros, setAllCobros] = useState([]);
  const [activeBusinesses, setActiveBusinesses] = useState(0);
  const [inactiveBusinesses, setInactiveBusinesses] = useState(0);
  const [todayPayments, setTodayPayments] = useState(0);
  const [selectedMonthPayments, setSelectedMonthPayments] = useState(0);
  const [agentMapping, setAgentMapping] = useState({});

  // Estados para el calendario y fecha del reporte
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  // Declaramos paymentsData para agrupar los pagos por día
  const [paymentsData, setPaymentsData] = useState({});
  // Inicializamos selectedReportDate con la fecha actual
  const [selectedReportDate, setSelectedReportDate] = useState(dayjs().format("YYYY-MM-DD"));

  // Estado para la pestaña activa ("diarios" o "historicos")
  const [activeTab, setActiveTab] = useState("diarios");

  // Obtener agentes en tiempo real desde la colección "users" (filtrando rol "Cobrador")
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

  // Actualizar selectedReportDate: si el mes y año seleccionados son los actuales,
  // se usa el día actual; de lo contrario, se usa el primer día del mes seleccionado.
  useEffect(() => {
    const today = new Date();
    if (selectedYear === today.getFullYear() && selectedMonth === today.getMonth()) {
      setSelectedReportDate(dayjs(today).format("YYYY-MM-DD"));
    } else {
      setSelectedReportDate(dayjs(new Date(selectedYear, selectedMonth, 1)).format("YYYY-MM-DD"));
    }
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

  // Obtener todos los cobros en tiempo real de la colección "cobros"
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cobros"), (snapshot) => {
      const cobrosArr = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        let paymentDate;
        if (data.date && data.date.toDate) {
          paymentDate = data.date.toDate();
        } else {
          paymentDate = new Date();
        }
        // Usamos netAmount si existe; de lo contrario, amount
        const amount = data.netAmount !== undefined ? data.netAmount : parseFloat(data.amount || 0);
        cobrosArr.push({
          ...data,
          paymentDate,
          amount,
        });
      });
      setAllCobros(cobrosArr);
    });
    return () => unsub();
  }, [db]);

  // Calcular ingresos de hoy (sumando netAmount o amount)
  useEffect(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let sumToday = 0;
    allCobros.forEach((c) => {
      if (c.paymentDate >= startToday && c.paymentDate <= endToday) {
        sumToday += c.amount;
      }
    });
    setTodayPayments(sumToday);
  }, [allCobros]);

  // Calcular ingresos del mes seleccionado y agrupar pagos por día
  useEffect(() => {
    const startMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0);
    const endMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
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

  // NUEVO useEffect: Obtener y contar los negocios activos e inactivos
  useEffect(() => {
    const negociosRef = collection(db, "negocios");
    const unsubscribe = onSnapshot(negociosRef, (snapshot) => {
      let activeCount = 0;
      let inactiveCount = 0;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === "activo") {
          activeCount++;
        } else if (data.status === "inactivo") {
          inactiveCount++;
        }
      });
      setActiveBusinesses(activeCount);
      setInactiveBusinesses(inactiveCount);
    });
    return () => unsubscribe();
  }, [db]);

  // Función para descargar PDF (mantiene la lógica original)
  const handleDownloadPDF = () => {
    const dayPayments = paymentsData[selectedReportDate] || [];
    if (dayPayments.length === 0) {
      alert("No se encontraron cobros para la fecha seleccionada.");
      return;
    }

    // Agrupar los pagos por agente
    const agentData = {};
    dayPayments.forEach((payment) => {
      const agentId = payment.agentId;
      const agentName = agentMapping[agentId] || "N/A";
      if (!agentData[agentName]) {
        agentData[agentName] = { sum: 0, folios: [] };
      }
      agentData[agentName].sum += payment.amount;
      if (payment.folio) {
        agentData[agentName].folios.push(payment.folio);
      }
    });

    const tableBody = Object.entries(agentData).map(([agent, data]) => [
      agent,
      new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(data.sum),
      data.folios.join(", "),
    ]);
    const totalSum = Object.values(agentData).reduce((acc, data) => acc + data.sum, 0);
    tableBody.push([
      "TOTAL",
      new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(totalSum),
      "",
    ]);

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.addImage(bgPdf, "PNG", 0, 0, pageWidth, pageHeight);
    const marginSide = 10;
    const maxTitleWidth = pageWidth - marginSide * 2;
    const titleText = "RELACIÓN DE FOLIOS POR CONCEPTO DE COBRO POR USO DE VÍA PÚBLICA";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(titleText, maxTitleWidth);
    const lineHeight = 5;
    const computedTitleHeight = titleLines.length * lineHeight;
    const gapBetweenTitleAndTable = 10;
    const startY = 50;
    let currentTitleY = startY;
    titleLines.forEach((line, index) => {
      doc.text(line, pageWidth / 2, currentTitleY + index * lineHeight, { align: "center" });
    });
    const tableStartY = startY + computedTitleHeight + gapBetweenTitleAndTable;
    const reportDate = dayjs(selectedReportDate).format("D MMMM YYYY").toUpperCase();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(reportDate, pageWidth - 10, tableStartY - 5, { align: "right" });
    doc.autoTable({
      startY: tableStartY,
      head: [["Agente", "Total Cobrado", "Folios"]],
      body: tableBody,
      styles: { font: "helvetica", fontSize: 10, halign: "center" },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", halign: "center" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "left" } },
      theme: "grid",
    });
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

  // Estado para filtrar la vista en pestañas: "diarios" o "historicos"
  const [activeView, setActiveView] = useState("diarios");

  // Renderizado condicional basado en la pestaña activa
  const renderContent = () => {
    if (activeView === "diarios") {
      return (
        <>
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
                Descargar PDF {dayjs(selectedReportDate).format("D MMMM YYYY")}
              </button>
            </div>
          </div>
          <Calendar year={selectedYear} month={selectedMonth} paymentsData={paymentsData} />
          <div className="mt-4 bg-white shadow rounded p-4">
            <h2 className="text-lg font-semibold">Resumen del Día</h2>
            <p className="text-gray-700 mt-2">
              Ingresos de hoy:{" "}
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(todayPayments)}
            </p>
            <p className="text-gray-700 mt-2">
              Ingresos del mes:{" "}
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(selectedMonthPayments)}
            </p>
          </div>
        </>
      );
    } else if (activeView === "historicos") {
      // Ordenar todos los cobros de forma descendente por fecha
      const sortedCobros = [...allCobros].sort(
        (a, b) => b.paymentDate - a.paymentDate
      );
      return (
        <div className="bg-white shadow rounded p-4 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">Histórico de Ingresos</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="py-2 px-4 border">Fecha</th>
                <th className="py-2 px-4 border">Agente</th>
                <th className="py-2 px-4 border">Total Cobrado</th>
                <th className="py-2 px-4 border">Crédito Aplicado</th>
                <th className="py-2 px-4 border">Monto Neto</th>
                <th className="py-2 px-4 border">Folio</th>
              </tr>
            </thead>
            <tbody>
              {sortedCobros.map((c, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-4 border">
                    {dayjs(c.paymentDate).format("D MMM YYYY, h:mm A")}
                  </td>
                  <td className="py-2 px-4 border">
                    {agentMapping[c.agentId] || c.agentId}
                  </td>
                  <td className="py-2 px-4 border">
                    {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                      c.totalAmount || c.amount
                    )}
                  </td>
                  <td className="py-2 px-4 border">
                    {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                      c.appliedCredit || 0
                    )}
                  </td>
                  <td className="py-2 px-4 border">
                    {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                      c.netAmount !== undefined ? c.netAmount : c.amount
                    )}
                  </td>
                  <td className="py-2 px-4 border">{c.folio || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  };

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

      {/* Pestañas para cambiar entre vista diaria e histórica */}
      <div className="mb-4 flex justify-center gap-4">
        <button
          onClick={() => setActiveView("diarios")}
          className={`px-4 py-2 rounded ${activeView === "diarios" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          Ingresos Diarios
        </button>
        <button
          onClick={() => setActiveView("historicos")}
          className={`px-4 py-2 rounded ${activeView === "historicos" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          Histórico de Ingresos
        </button>
      </div>

      {renderContent()}
    </div>
  );
};

export default AdminHome;

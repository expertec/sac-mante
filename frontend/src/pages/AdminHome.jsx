// AdminHomeOptimized.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";


import { getFirestore, collection, onSnapshot, query, orderBy, where, limit } from "firebase/firestore";


import { jsPDF } from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isBetween from "dayjs/plugin/isBetween";   // <-- NUEVO
import "dayjs/locale/es";
import bgPdf from "../assets/bgPdf.png";


dayjs.extend(customParseFormat);

dayjs.extend(isBetween);    

dayjs.locale("es");



function numberToSpanish(n) {
  const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales = [
    "diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve"
  ];
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  if (n < 10) return unidades[n];
  if (n < 20) return especiales[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (n === 20) return "veinte";
    if (n < 30) return "veinti" + (u ? unidades[u] : "");
    return decenas[d] + (u ? " y " + unidades[u] : "");
  }
  if (n === 100) return "cien";
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    return (c === 1 ? "ciento" : centenas[c]) + (r ? " " + numberToSpanish(r) : "");
  }
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000);
    const r = n % 1000;
    const milesText = miles === 1 ? "mil" : numberToSpanish(miles) + " mil";
    return milesText + (r ? " " + numberToSpanish(r) : "");
  }
  return String(n);
}

// Convierte data.date (Timestamp, ISO string o "28 de junio de 2025, 4:43:47 p.m. UTC-6") a Date
function parsePaymentDate(raw) {
  if (!raw) return null;
  // Firestore Timestamp
  if (typeof raw?.toDate === "function") return raw.toDate();

  if (typeof raw === "string") {
    // 1) ISO u otra fecha parseable por Date
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t);

    // 2) Formato "D de <mes> de YYYY, hh:mm:ss a.m./p.m. ..."
    const re = /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*([ap]\.m\.)/i;
    const m = raw.split(" UTC")[0].match(re);
    if (m) {
      const [, D, mes, YYYY, hh, mm, ss, ampm] = m;
      const monthIdx = {
        enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,
        julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11
      }[mes.toLowerCase()] ?? 0;
      let H = parseInt(hh,10);
      if (/p\.m\./i.test(ampm) && H < 12) H += 12;
      if (/a\.m\./i.test(ampm) && H === 12) H = 0;
      return new Date(parseInt(YYYY,10), monthIdx, parseInt(D,10), H, parseInt(mm,10), parseInt(ss,10));
    }
  }
  return null; // si no podemos parsear
}



function convertNumberToText(amount) {
  const entero = Math.floor(amount);
  const decimales = Math.round((amount - entero) * 100);
  const enteroText = numberToSpanish(entero);
  return `${enteroText.toUpperCase()} CON ${decimales < 10 ? "0" + decimales : decimales}/100`;
}

/**
 * Calendario para ingresos diarios.
 */
function Calendar({ year, month, paymentsData }) {
  const currentDate = new Date(year, month);
  const monthName = currentDate.toLocaleString("es-ES", { month: "long", year: "numeric" });
  const firstDayOfMonth = new Date(year, month, 1).getDay();       // 0=Dom, ..., 6=Sáb
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayLocal = new Date();
  const daysOfWeek = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

  // Construimos 42 celdas (6 filas x 7 columnas)
  const cells = [];
  // vacíos previos
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  // días del mes
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // vacíos de cola hasta múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-2 bg-gray-100 border-b">
        <h2 className="text-lg font-semibold text-gray-700">{monthName}</h2>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-gray-600 border-b">
        {daysOfWeek.map((d) => (
          <div key={d} className="py-2 uppercase">{d.slice(0,3)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-24 p-2 rounded border bg-gray-50" />;
          const dayKey = dayjs(date).format("YYYY-MM-DD");
          const payments = paymentsData[dayKey] || [];
          const isToday = date.toDateString() === todayLocal.toDateString();
          const totalForDay = payments.reduce(
            (sum, p) => sum + Number(p.netAmount ?? p.amount ?? 0),
            0
          );

          let color = "bg-gray-50 border-gray-200";
          if (isToday) color = "bg-blue-100 border-blue-400";
          else if (payments.length > 0) color = "bg-green-100 border-green-400";

          return (
            <div key={i} className={`p-2 h-24 flex flex-col justify-between rounded border ${color}`}>
              <div className="text-right text-xs font-semibold text-gray-500">
                {isToday ? "Hoy" : date.getDate()}
              </div>
              <div className="text-sm text-gray-700">
                {payments.length
                  ? `Pagos: ${payments.length} (${new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(totalForDay)})`
                  : "Sin pagos"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


const AdminHome = () => {
  const db = getFirestore();

  // Estados generales
  const [allCobros, setAllCobros] = useState([]);
  const [activeBusinesses, setActiveBusinesses] = useState(0);
  const [inactiveBusinesses, setInactiveBusinesses] = useState(0);
  const [agentMapping, setAgentMapping] = useState({});
  const [businessMapping, setBusinessMapping] = useState({});
  const [reports, setReports] = useState([]);
  const [cobrosCache, setCobrosCache] = useState({});

  // Estados para fechas y vista
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [paymentsData, setPaymentsData] = useState({});
  const [selectedReportDate, setSelectedReportDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [activeView, setActiveView] = useState("diarios");

  // Estados para filtros y paginación
  const [historicosPage, setHistoricosPage] = useState(1);
  const [reportesPage, setReportesPage] = useState(1);
  const [historicosFilter, setHistoricosFilter] = useState("");
  const [reportesFilter, setReportesFilter] = useState(dayjs().format("YYYY-MM-DD"));

  const [negociosFilterDate, setNegociosFilterDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [negociosPage, setNegociosPage] = useState(1);
  const [negociosFilterStatus, setNegociosFilterStatus] = useState("todos");
  const [negociosFilterActivity, setNegociosFilterActivity] = useState("todos");

  // Estados de carga para cada suscripción
  const [loadingCobros, setLoadingCobros] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingNegocios, setLoadingNegocios] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);

  // Escuchar usuarios para agentMapping
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
      setLoadingUsers(false);
    });
    return () => unsub();
  }, [db]);

  // Actualizar selectedReportDate según mes/año
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


// Escuchar cobros - Optimizado con cache (maneja date como Timestamp o string)
useEffect(() => {
  const mesKey = `${selectedYear}-${selectedMonth}`;

  // Si ya está en cache, usar cache
  if (cobrosCache[mesKey]) {
    console.log("✅ Cache:", mesKey);
    setAllCobros(cobrosCache[mesKey]);
    setLoadingCobros(false);
    return;
  }

  // Cargar desde Firebase
  console.log("📥 Cargando:", mesKey);
  setLoadingCobros(true);

  const startMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0);
  const endMonth   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

  // No usamos where por rango, porque hay docs con date string
  const qCobros = query(
    collection(db, "cobros"),
    orderBy("date", "desc"),
    limit(2000) // ajusta si necesitas más
  );

  const unsub = onSnapshot(
    qCobros,
    (snapshot) => {
      const parsed = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        // Normaliza paymentDate: Timestamp -> Date, string -> parsePaymentDate, fallback createdAt
        const paymentDate =
          (data.date?.toDate ? data.date.toDate() : null) ||
          parsePaymentDate(data.date) ||
          (data.createdAt?.toDate ? data.createdAt.toDate() : null);

        if (!paymentDate) return; // si no hay fecha usable, descartar

        // Filtra por mes seleccionado en memoria
        if (paymentDate < startMonth || paymentDate > endMonth) return;

        const amount = Number(data?.netAmount ?? data?.amount ?? 0);

        parsed.push({
          ...data,
          paymentDate,
          amount: isNaN(amount) ? 0 : amount,
        });
      });

      console.log(`✅ ${mesKey}: ${parsed.length} cobros`);

      setCobrosCache((prev) => ({ ...prev, [mesKey]: parsed }));
      setAllCobros(parsed);
      setLoadingCobros(false);
    },
    (err) => {
      console.error("onSnapshot(cobros) error:", err);
      setLoadingCobros(false);
    }
  );

  return () => unsub();
}, [db, selectedYear, selectedMonth]);


  // Escuchar negocios para conteos y mapping
  useEffect(() => {
  const negociosRef = collection(db, "negocios");
  const qNegocios = query(negociosRef, where("status", "in", ["activo", "inactivo"]));

  const unsubscribe = onSnapshot(qNegocios, (snapshot) => {
    let activeCount = 0;
    let inactiveCount = 0;
    const mapping = {};

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === "activo") activeCount++;
      else if (data.status === "inactivo") inactiveCount++;

      const schedule = data.schedule || {};
      const daysArray = Array.isArray(schedule.days) ? schedule.days : [];

      mapping[docSnap.id] = {
        businessName: data.name || "Sin negocio",
        phone: data.phone || "Sin teléfono",
        agentId: data.agentId,
        owner: data.owner || "Sin dueño",
        days: daysArray.length ? daysArray.join(", ") : "No especificado",
        daysArray,
        openingTime: schedule.openingTime || "No especificado",
        closingTime: schedule.closingTime || "No especificado",
        status: data.status || "desconocido",
      };
    });

    setActiveBusinesses(activeCount);
    setInactiveBusinesses(inactiveCount);
    setBusinessMapping(mapping);
    setLoadingNegocios(false);
  });

  return () => unsubscribe();
}, [db]);


// Escuchar reportes
// Si hay filtro por día lo solicitamos desde Firestore; de lo contrario traemos los 500 más recientes
useEffect(() => {
  const reportesRef = collection(db, "reportes");
  let qReportes;

  if (reportesFilter) {
    const start = dayjs(reportesFilter).startOf("day").toDate();
    const end = dayjs(reportesFilter).endOf("day").toDate();
    qReportes = query(
      reportesRef,
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc")
    );
  } else {
    qReportes = query(reportesRef, orderBy("createdAt", "desc"), limit(500));
  }

  const unsubscribe = onSnapshot(qReportes, (snapshot) => {
    const temp = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      let createdDate;

      if (typeof data.date === "string") {
        if (/^\d{4}-\d{2}-\d{2}T/.test(data.date)) {
          createdDate = new Date(data.date);
        } else {
          const raw = data.date.split(" UTC")[0];
          const re = /(\d{1,2}) de (\w+) de (\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*([ap]\.m\.)/i;
          const m = raw.match(re);
          if (m) {
            const [, D, mes, YYYY, hh, mm, ss, ampm] = m;
            const monthIdx = {
              enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,
              julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11
            }[mes.toLowerCase()] || 0;
            let H = parseInt(hh, 10);
            if (/p\.m\./i.test(ampm) && H < 12) H += 12;
            if (/a\.m\./i.test(ampm) && H === 12) H = 0;
            createdDate = new Date(parseInt(YYYY,10), monthIdx, parseInt(D,10), H, parseInt(mm,10), parseInt(ss,10));
          } else {
            createdDate = new Date(data.date);
          }
        }
      } else if (data.date?.toDate) {
        createdDate = data.date.toDate();
      } else if (data.createdAt?.toDate) {
        createdDate = data.createdAt.toDate();
      } else {
        createdDate = new Date();
      }

      return {
        id: docSnap.id,
        businessId: data.businessId || "Sin negocio",
        userId: data.userId || "Sin usuario",
        createdAt: createdDate,
        photoURL: data.photoURL,
        agentId: data.agentId,
        location: data.location
      };
    });

    temp.sort((a, b) => b.createdAt - a.createdAt);
    setReports(temp);
    setLoadingReports(false);
  });

  return () => unsubscribe();
}, [db, reportesFilter]);






  // Calcular ingresos de hoy (useMemo)
  const todayPayments = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    return allCobros.reduce((sum, c) => {
      if (c.paymentDate >= startToday && c.paymentDate <= endToday) {
        return sum + c.amount;
      }
      return sum;
    }, 0);
  }, [allCobros]);

  // Calcular ingresos del mes y agrupar pagos por día (useMemo) - Optimizado
  const { selectedMonthPayments, paymentsDataMemo } = useMemo(() => {
    const startMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0);
    const endMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
    let sumMonth = 0;
    const map = {};

    allCobros.forEach((c) => {
      // Usar el objeto Date directamente sin dayjs para evitar problemas de zona horaria
      if (c.paymentDate >= startMonth && c.paymentDate <= endMonth) {
        const amt = Number(c.amount || 0);
        sumMonth += amt;
        
        // Formatear la fecha en la zona horaria local
        const year = c.paymentDate.getFullYear();
        const month = String(c.paymentDate.getMonth() + 1).padStart(2, '0');
        const day = String(c.paymentDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(c);
      }
    });

    // ✅ OPTIMIZACIÓN: Console.log simplificado (solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      console.log(`📅 ${selectedMonth + 1}/${selectedYear}: ${Object.keys(map).length} días con datos`);
    }

    return { selectedMonthPayments: sumMonth, paymentsDataMemo: map };
  }, [allCobros, selectedYear, selectedMonth]);

  // Actualizar pagos agrupados cuando cambien
  useEffect(() => {
    setPaymentsData(paymentsDataMemo);
  }, [paymentsDataMemo]);


// Generar PDF filtrando por DÍA con fechas ya normalizadas
const handleDownloadPDF = useCallback(() => {
  // 1) Rango del día (inicio/fin locales)
  const start = new Date(dayjs(selectedReportDate).startOf("day").toDate());
  const end   = new Date(dayjs(selectedReportDate).endOf("day").toDate());

  // 2) Filtra cobros del día específico usando paymentDate (Date)
  const dayPayments = allCobros.filter(
    (c) => c.paymentDate >= start && c.paymentDate <= end
  );

  if (!dayPayments.length) {
    alert("No se encontraron cobros para la fecha seleccionada.");
    return;
  }

  // 3) Agrupa por agente y suma
  const agentData = {};
  for (const p of dayPayments) {
    const agent = agentMapping[p.agentId] || "N/A";
    if (!agentData[agent]) agentData[agent] = { sum: 0, folios: [] };
    const amt = Number(p.netAmount ?? p.amount ?? 0);
    agentData[agent].sum += isNaN(amt) ? 0 : amt;
    if (p.folio) agentData[agent].folios.push(String(p.folio));
  }

  // 4) Filas para la tabla
  const rows = Object.entries(agentData).map(([agent, info]) => [
    agent,
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(info.sum),
    info.folios.join(", "),
  ]);

  const total = Object.values(agentData).reduce((a, b) => a + b.sum, 0);
  rows.push(["TOTAL", new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(total), ""]);

  // 5) PDF
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Agregar fondo en la primera página
  try {
    doc.addImage(bgPdf, "PNG", 0, 0, pageWidth, pageHeight);
  } catch (e) {
    console.error("Error al cargar fondo página 1:", e);
  }

  const title = "RELACIÓN DE FOLIOS POR CONCEPTO DE COBRO POR USO DE VÍA PÚBLICA";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(title, pageWidth - 20);
  const startY = 50;
  lines.forEach((ln, i) => doc.text(ln, pageWidth / 2, startY + i * 5, { align: "center" }));

  const tableStartY = startY + lines.length * 5 + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    dayjs(selectedReportDate).format("D [de] MMMM [de] YYYY").toUpperCase(),
    pageWidth - 10,
    tableStartY - 4,
    { align: "right" }
  );

  // Calcular cuántas filas caben en una página (aproximadamente 18-20 filas por página)
  const maxRowsPerPage = 18;
  const needsSplit = rows.length > maxRowsPerPage;

  if (needsSplit) {
    // Dividir la tabla en dos partes
    const midPoint = Math.ceil(rows.length / 2);
    const firstHalf = rows.slice(0, midPoint);
    const secondHalf = rows.slice(midPoint);

    // Primera tabla (primera mitad)
    doc.autoTable({
      startY: tableStartY,
      head: [["Agente", "Total Cobrado", "Folios"]],
      body: firstHalf,
      styles: { font: "helvetica", fontSize: 10, halign: "center" },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", halign: "center" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "left" } },
      theme: "grid",
      margin: { top: 60, bottom: 50 }
    });

    // Firma después de la primera tabla
    let finalY = doc.lastAutoTable.finalY || tableStartY;
    let signatureY = finalY + 10;
    doc.setLineWidth(0.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.line(60, signatureY, pageWidth - 60, signatureY);
    doc.text("CP. MONICA LIZBETH REYES HERNANDEZ", pageWidth / 2, signatureY + 7, { align: "center" });
    doc.text("JEFA DE INGRESOS", pageWidth / 2, signatureY + 12, { align: "center" });

    // Guardar el PDF actual y crear uno nuevo para la segunda página
    const pdfData1 = doc.output('datauristring');
    
    // Crear nueva página
    doc.addPage();
    
    // Forzar la adición de la imagen en la segunda página
    // Usar el contexto interno de jsPDF
    const pageCount = doc.internal.getNumberOfPages();
    doc.setPage(pageCount);
    
    // Agregar imagen usando el método directo del contexto
    const ctx = doc.internal.pageSize;
    doc.addImage(bgPdf, 'PNG', 0, 0, ctx.width || pageWidth, ctx.height || pageHeight, undefined, 'FAST');
    
    // Agregar título en la segunda página
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const lines2 = doc.splitTextToSize(title, pageWidth - 20);
    lines2.forEach((ln, i) => doc.text(ln, pageWidth / 2, startY + i * 5, { align: "center" }));
    
    // Agregar fecha en la segunda página
    const tableStartY2 = startY + lines2.length * 5 + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      dayjs(selectedReportDate).format("D [de] MMMM [de] YYYY").toUpperCase(),
      pageWidth - 10,
      tableStartY2 - 4,
      { align: "right" }
    );

    // Segunda tabla (segunda mitad)
    doc.autoTable({
      startY: tableStartY2,
      head: [["Agente", "Total Cobrado", "Folios"]],
      body: secondHalf,
      styles: { font: "helvetica", fontSize: 10, halign: "center" },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", halign: "center" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "left" } },
      theme: "grid",
      margin: { top: 60, bottom: 50 }
    });

    // Firma después de la segunda tabla
    finalY = doc.lastAutoTable.finalY || tableStartY2;
    signatureY = finalY + 10;
    doc.setLineWidth(0.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.line(60, signatureY, pageWidth - 60, signatureY);
    doc.text("CP. MONICA LIZBETH REYES HERNANDEZ", pageWidth / 2, signatureY + 7, { align: "center" });
    doc.text("JEFA DE INGRESOS", pageWidth / 2, signatureY + 12, { align: "center" });

  } else {
    // Tabla completa en una sola página
    doc.autoTable({
      startY: tableStartY,
      head: [["Agente", "Total Cobrado", "Folios"]],
      body: rows,
      styles: { font: "helvetica", fontSize: 10, halign: "center" },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", halign: "center" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "left" } },
      theme: "grid",
      margin: { top: 60, bottom: 50 }
    });

    // Firma después de la tabla
    const finalY = doc.lastAutoTable.finalY || tableStartY;
    const signatureY = finalY + 10;
    doc.setLineWidth(0.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.line(60, signatureY, pageWidth - 60, signatureY);
    doc.text("CP. MONICA LIZBETH REYES HERNANDEZ", pageWidth / 2, signatureY + 7, { align: "center" });
    doc.text("JEFA DE INGRESOS", pageWidth / 2, signatureY + 12, { align: "center" });
  }

  const fileName = `Reporte_${dayjs(selectedReportDate).format("DD_MMM_YYYY")}.pdf`;
  doc.save(fileName);
}, [allCobros, selectedReportDate, agentMapping]);



  // Cálculos para "Negocios sin Cobro" (mover hooks fuera de renderContent)


  // Cálculos para "Negocios sin Cobro" - Optimizado
  const businessList = useMemo(
    () => Object.entries(businessMapping).map(([id, info]) => ({ id, ...info })),
    [businessMapping]
  );
  
  const filterDayStr = useMemo(
    () => dayjs(negociosFilterDate).format("YYYY-MM-DD"),
    [negociosFilterDate]
  );
  
  // ✅ OPTIMIZACIÓN: De O(n²) a O(n) usando Set
  const businessesWithoutCobro = useMemo(() => {
    // Crear Set con IDs de negocios que SÍ tienen cobro
    const businessIdsWithCobro = new Set();
    allCobros.forEach((cobro) => {
      if (dayjs(cobro.paymentDate).format("YYYY-MM-DD") === filterDayStr) {
        businessIdsWithCobro.add(cobro.businessId);
      }
    });
    
    // Filtrar los que NO están en el Set (mucho más rápido)
    return businessList.filter((business) => !businessIdsWithCobro.has(business.id));
  }, [businessList, allCobros, filterDayStr]);
  
  const businessesWithChip = useMemo(() => {
    return businessesWithoutCobro.map((business) => {
      const hasReporte = reports.some((r) =>
        r.businessId === business.id &&
        dayjs(r.createdAt).format("YYYY-MM-DD") === filterDayStr
      );
      const dayName = dayjs(negociosFilterDate).locale("es").format("dddd");
      const dayNameCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const isClosed = !business.daysArray.includes(dayNameCapitalized);
      return { ...business, hasReporte, isClosed };
    });
  }, [businessesWithoutCobro, reports, negociosFilterDate]);
  
  const filteredBusinessesByStatus = useMemo(() => {
    let filtered = businessesWithChip;

    if (negociosFilterActivity === "activo") {
      filtered = filtered.filter((b) => b.status === "activo");
    } else if (negociosFilterActivity === "inactivo") {
      filtered = filtered.filter((b) => b.status === "inactivo");
    }

    if (negociosFilterStatus === "cerrado") {
      return filtered.filter((b) => b.isClosed);
    }
    if (negociosFilterStatus === "conReporte") {
      return filtered.filter((b) => !b.isClosed && b.hasReporte);
    }
    if (negociosFilterStatus === "sinReporte") {
      return filtered.filter((b) => !b.isClosed && !b.hasReporte);
    }

    return filtered;
  }, [businessesWithChip, negociosFilterStatus, negociosFilterActivity]);

  // Ordenar y filtrar históricos y reportes con useMemo (fuera de renderContent)
  const sortedCobros = useMemo(() => {
    return [...allCobros].sort((a, b) => b.paymentDate - a.paymentDate);
  }, [allCobros]);

  const filteredHistoricos = useMemo(() => {
    if (!historicosFilter) return sortedCobros;
    return sortedCobros.filter((c) =>
      dayjs(c.paymentDate).format("YYYY-MM-DD") === historicosFilter
    );
  }, [sortedCobros, historicosFilter]);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => b.createdAt - a.createdAt);
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!reportesFilter) return sortedReports;
    return sortedReports.filter((r) =>
      dayjs(r.createdAt).format("YYYY-MM-DD") === reportesFilter
    );
  }, [sortedReports, reportesFilter]);

  const handleExportNegocios = useCallback(() => {
    if (!filteredBusinessesByStatus.length) return;

    const rows = filteredBusinessesByStatus.map((business) => ({
      Agente: agentMapping[business.agentId] || "Sin agente",
      Negocio: business.businessName,
      Dueño: business.owner || "Sin dueño",
      Teléfono: business.phone || "Sin teléfono",
      Estado: business.isClosed
        ? "Cerrado"
        : business.hasReporte
        ? "Con reporte"
        : "Sin reporte",
      Días: business.days,
      Horario: `Apertura: ${business.openingTime} - Cierre: ${business.closingTime}`,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Negocios sin cobro");
    const dateLabel = dayjs(negociosFilterDate).format("DD_MM_YYYY");
    XLSX.writeFile(workbook, `negocios_sin_cobro_${dateLabel}.xlsx`);
  }, [filteredBusinessesByStatus, agentMapping, negociosFilterDate]);

  // Si aún se están cargando algunas colecciones, muestra un spinner animado
  const isLoading = loadingCobros || loadingUsers || loadingNegocios || loadingReports;

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
  min={minDate}
  max={maxDate}
  value={selectedReportDate}
  onChange={(e) => {
    const v = e.target.value; // "YYYY-MM-DD"
    setSelectedReportDate(v);

    // ⚠️ Parseo seguro en LOCAL (evita el desfase UTC)
    const [yy, mm, dd] = v.split("-").map(Number);
    const d = new Date(yy, (mm - 1), dd); // <-- local time

    // Actualiza mes/año con la fecha correcta
    setSelectedMonth(d.getMonth());      // 0-11
    setSelectedYear(d.getFullYear());
  }}
  className="px-2 py-1 border rounded"
/>


              <button onClick={handleDownloadPDF} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Descargar PDF {dayjs(selectedReportDate).format("D MMM YYYY")}
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
      const itemsPerPage = 10;
      const totalHistoricosPages = Math.ceil(filteredHistoricos.length / itemsPerPage);
      const historicosPaginated = filteredHistoricos.slice(
        (historicosPage - 1) * itemsPerPage,
        historicosPage * itemsPerPage
      );

      return (
        <div className="bg-white shadow rounded p-4 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">Histórico de Ingresos</h2>
          <div className="mb-4 flex items-center">
            <label className="mr-2">Filtrar por día:</label>
            <input
              type="date"
              value={historicosFilter}
              onChange={(e) => {
                setHistoricosFilter(e.target.value);
                setHistoricosPage(1);
              }}
              className="px-2 py-1 border rounded"
            />
            {historicosFilter && (
              <button onClick={() => {
                setHistoricosFilter("");
                setHistoricosPage(1);
              }} className="ml-2 text-blue-600 underline">
                Limpiar filtro
              </button>
            )}
          </div>
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
              {historicosPaginated.map((c, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-4 border">
                    {dayjs(c.paymentDate).format("D MMM YYYY, h:mm A")}
                  </td>
                  <td className="py-2 px-4 border">
                    {agentMapping[c.agentId] || c.agentId || "Sin agente"}
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
          <div className="flex justify-end items-center mt-4">
            <button
              onClick={() => setHistoricosPage(historicosPage - 1)}
              disabled={historicosPage === 1}
              className="px-3 py-1 border rounded mr-2"
            >
              Anterior
            </button>
            <span>
              Página {historicosPage} de {totalHistoricosPages}
            </span>
            <button
              onClick={() => setHistoricosPage(historicosPage + 1)}
              disabled={historicosPage === totalHistoricosPages}
              className="px-3 py-1 border rounded ml-2"
            >
              Siguiente
            </button>
          </div>
        </div>
      );
    } else if (activeView === "reportes") {
      const itemsPerPage = 10;
      const totalReportesPages = Math.ceil(filteredReports.length / itemsPerPage);
      const reportesPaginated = filteredReports.slice(
        (reportesPage - 1) * itemsPerPage,
        reportesPage * itemsPerPage
      );

      return (
        <div className="bg-white shadow rounded p-4 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">Historial de Reportes</h2>
          <div className="mb-4 flex items-center">
            <label className="mr-2">Filtrar por día:</label>
            <input
              type="date"
              value={reportesFilter}
              onChange={(e) => {
                setReportesFilter(e.target.value);
                setReportesPage(1);
              }}
              className="px-2 py-1 border rounded"
            />
            {reportesFilter && (
              <button onClick={() => {
                setReportesFilter("");
                setReportesPage(1);
              }} className="ml-2 text-blue-600 underline">
                Limpiar filtro
              </button>
            )}
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="py-2 px-4 border">Fecha</th>
                <th className="py-2 px-4 border">Agente</th>
                <th className="py-2 px-4 border">Negocio</th>
                <th className="py-2 px-4 border">Teléfono</th>
                <th className="py-2 px-4 border">Ubicación</th>
                <th className="py-2 px-4 border">Foto</th>
              </tr>
            </thead>
            <tbody>
              {reportesPaginated.map((report) => (
                <tr key={report.id} className="border-b">
                  <td className="py-2 px-4 border">
                    {dayjs(report.createdAt).format("D MMM YYYY, h:mm A")}
                  </td>
                  <td className="py-2 px-4 border">
                    {agentMapping[report.agentId] || report.agentId || "Sin agente"}
                  </td>
                  <td className="py-2 px-4 border">
                    {businessMapping[report.businessId]?.businessName || "Sin negocio"}
                  </td>
                  <td className="py-2 px-4 border">
                    {businessMapping[report.businessId]?.phone || "Sin teléfono"}
                  </td>
                  <td className="py-2 px-4 border">
                    {report.location ? `${report.location.Lat}, ${report.location.Lng}` : "Sin ubicación"}
                  </td>
                  <td className="py-2 px-4 border text-center">
                    {report.photoURL ? (
                      <button onClick={() => openPhotoModal(report.photoURL)} className="text-blue-600 underline">
                        Ver Imagen
                      </button>
                    ) : (
                      "Sin foto"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end items-center mt-4">
            <button
              onClick={() => setReportesPage(reportesPage - 1)}
              disabled={reportesPage === 1}
              className="px-3 py-1 border rounded mr-2"
            >
              Anterior
            </button>
            <span>
              Página {reportesPage} de {totalReportesPages}
            </span>
            <button
              onClick={() => setReportesPage(reportesPage + 1)}
              disabled={reportesPage === totalReportesPages}
              className="px-3 py-1 border rounded ml-2"
            >
              Siguiente
            </button>
          </div>
        </div>
      );
    } else if (activeView === "negociosSinCobro") {
      const itemsPerPage = 15;
      const totalNegociosPages = Math.ceil(filteredBusinessesByStatus.length / itemsPerPage);
      const paginatedBusinesses = filteredBusinessesByStatus.slice(
        (negociosPage - 1) * itemsPerPage,
        negociosPage * itemsPerPage
      );

      return (
        <div className="bg-white shadow rounded p-4 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">
            Negocios sin cobro para el día {dayjs(negociosFilterDate).format("D MMM YYYY")}
          </h2>
          <div className="mb-4 flex items-center">
            <label className="mr-2">Filtrar por día:</label>
            <input
              type="date"
              value={negociosFilterDate}
              onChange={(e) => {
                setNegociosFilterDate(e.target.value);
                setNegociosPage(1);
              }}
              className="px-2 py-1 border rounded"
            />
          </div>
          <div className="mb-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center">
              <label className="mr-2">Filtrar por estado:</label>
              <select
                value={negociosFilterStatus}
                onChange={(e) => {
                  setNegociosFilterStatus(e.target.value);
                  setNegociosPage(1);
                }}
                className="px-2 py-1 border rounded"
              >
                <option value="todos">Todos</option>
                <option value="cerrado">Cerrado</option>
                <option value="conReporte">Con Reporte</option>
                <option value="sinReporte">Sin Reporte</option>
              </select>
            </div>
            <div className="flex items-center">
              <label className="mr-2">Filtrar por actividad:</label>
              <select
                value={negociosFilterActivity}
                onChange={(e) => {
                  setNegociosFilterActivity(e.target.value);
                  setNegociosPage(1);
                }}
                className="px-2 py-1 border rounded"
              >
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </div>
            <button
              onClick={handleExportNegocios}
              disabled={!filteredBusinessesByStatus.length}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              Exportar Excel
            </button>
          </div>
          <p className="mb-4">
            Total de negocios sin cobro: {filteredBusinessesByStatus.length} | Negocios cerrados:{" "}
            {businessesWithChip.filter((b) => b.isClosed).length} | Con reporte:{" "}
            {businessesWithChip.filter((b) => !b.isClosed && b.hasReporte).length} | Sin reporte:{" "}
            {businessesWithChip.filter((b) => !b.isClosed && !b.hasReporte).length}
          </p>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="py-2 px-4 border">Agente</th>
                <th className="py-2 px-4 border">Negocio</th>
                <th className="py-2 px-4 border">Dueño</th>
                <th className="py-2 px-4 border">Teléfono</th>
                <th className="py-2 px-4 border">Reporte / Cerrado</th>
                <th className="py-2 px-4 border">Días</th>
                <th className="py-2 px-4 border">Horario</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBusinesses.map((business) => (
                <tr key={business.id} className="border-b">
                  <td className="py-2 px-4 border">
                    {agentMapping[business.agentId] || "Sin agente"}
                  </td>
                  <td className="py-2 px-4 border">{business.businessName}</td>
                  <td className="py-2 px-4 border">{business.owner}</td>
                  <td className="py-2 px-4 border">{business.phone}</td>
                  <td className="py-2 px-4 border text-center">
                    {business.isClosed ? (
                      <span className="bg-red-300 text-red-800 px-2 py-1 rounded">
                        Cerrado
                      </span>
                    ) : business.hasReporte ? (
                      <span className="bg-yellow-300 text-yellow-900 px-2 py-1 rounded">
                        Reporte
                      </span>
                    ) : (
                      <span className="bg-gray-300 text-gray-800 px-2 py-1 rounded">
                        Sin Reporte
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 border text-center">
                    <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded">
                      {business.days}
                    </span>
                  </td>
                  <td className="py-2 px-4 border text-center">
                    <span className="bg-green-200 text-green-800 px-2 py-1 rounded">
                      Apertura: {business.openingTime} - Cierre: {business.closingTime}
                    </span>
                  </td>
                </tr>
              ))}
              {paginatedBusinesses.length === 0 && (
                <tr>
                  <td className="py-2 px-4 border" colSpan={7}>
                    Todos los negocios tienen cobro para este día.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end items-center mt-4">
            <button
              onClick={() => setNegociosPage(negociosPage - 1)}
              disabled={negociosPage === 1}
              className="px-3 py-1 border rounded mr-2"
            >
              Anterior
            </button>
            <span>
              Página {negociosPage} de {totalNegociosPages}
            </span>
            <button
              onClick={() => setNegociosPage(negociosPage + 1)}
              disabled={negociosPage === totalNegociosPages}
              className="px-3 py-1 border rounded ml-2"
            >
              Siguiente
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  // Modal para foto
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState(null);
  const openPhotoModal = (url) => setSelectedPhotoUrl(url);
  const closePhotoModal = () => setSelectedPhotoUrl(null);

  // Si aún se están cargando datos, muestra un spinner con animación
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <svg
          className="animate-spin h-12 w-12 text-blue-500 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          ></path>
        </svg>
        <span className="text-xl">Cargando...</span>
      </div>
    );
  }

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

      {/* Pestañas de navegación */}
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
        <button
          onClick={() => setActiveView("reportes")}
          className={`px-4 py-2 rounded ${activeView === "reportes" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          Historial de Reportes
        </button>
        <button
          onClick={() => setActiveView("negociosSinCobro")}
          className={`px-4 py-2 rounded ${activeView === "negociosSinCobro" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          Negocios sin Cobro
        </button>
      </div>

      {renderContent()}

      {/* Modal para foto */}
      {selectedPhotoUrl && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white p-4 rounded shadow-lg max-w-xl w-full relative">
            <button onClick={closePhotoModal} className="absolute top-2 right-2 text-gray-600">
              Cerrar ✕
            </button>
            <img src={selectedPhotoUrl} alt="Reporte" className="w-full h-auto object-cover rounded" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminHome;

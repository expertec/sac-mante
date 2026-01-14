import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import BusinessForm from "../components/BusinessForm";
import { FaTimes, FaFilePdf, FaEye } from "react-icons/fa";
import { getAuth } from "firebase/auth";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import dayjs from "dayjs";
import "dayjs/locale/es";

// Configurar dayjs en español
dayjs.locale("es");

// Helpers compartidos para formatear dinero y fechas
const formatearMoneda = (cantidad) => {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cantidad || 0);
};

const formatearFecha = (fecha) => {
  if (!fecha) return "Fecha no disponible";
  let fechaObj;
  if (fecha.toDate) {
    fechaObj = fecha.toDate();
  } else if (typeof fecha === "string") {
    fechaObj = new Date(fecha);
  } else {
    fechaObj = fecha;
  }
  return dayjs(fechaObj).format("DD/MM/YYYY HH:mm");
};

// Componente para mostrar el historial de cobros
function HistorialCobrosModal({ isOpen, onClose, businessId, businessName }) {
  const [cobros, setCobros] = useState([]);
  const [loading, setLoading] = useState(false);
  const db = getFirestore();

  useEffect(() => {
    if (isOpen && businessId) {
      cargarHistorialCobros();
    }
  }, [isOpen, businessId]);

  const cargarHistorialCobros = async () => {
    setLoading(true);
    try {
      const cobrosQuery = query(
        collection(db, "cobros"),
        where("businessId", "==", businessId),
        orderBy("date", "desc")
      );
      
      const snapshot = await getDocs(cobrosQuery);
      const historialCobros = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setCobros(historialCobros);
    } catch (error) {
      console.error("Error al cargar historial de cobros:", error);
      setCobros([]);
    } finally {
      setLoading(false);
    }
  };

  const generarPDF = () => {
    const doc = new jsPDF();
    
    // Configuración del documento
    doc.setFontSize(20);
    doc.setTextColor(134, 30, 61); // Color corporativo
    doc.text("HISTORIAL DE COBROS", 105, 20, { align: "center" });
    
    // Información del negocio
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Negocio: ${businessName}`, 20, 35);
    doc.text(`Fecha de generación: ${dayjs().format("DD/MM/YYYY HH:mm")}`, 20, 45);
    doc.text(`Total de registros: ${cobros.length}`, 20, 55);
    
    // Calcular totales
    const totalCobrado = cobros.reduce((sum, cobro) => sum + (cobro.netAmount || 0), 0);
    doc.text(`Total cobrado: ${formatearMoneda(totalCobrado)}`, 20, 65);
    
    // Preparar datos para la tabla
    const tableData = cobros.map((cobro, index) => [
      index + 1,
      formatearFecha(cobro.date),
      formatearMoneda(cobro.netAmount),
      cobro.agentName || "N/A",
      cobro.folio || "N/A",
      cobro.paymentMethod || "Efectivo"
    ]);
    
    // Crear tabla
    doc.autoTable({
      head: [["#", "Fecha", "Monto", "Agente", "Folio", "Método"]],
      body: tableData,
      startY: 75,
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [134, 30, 61],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 35 },
        2: { halign: 'right', cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { halign: 'center', cellWidth: 25 },
        5: { cellWidth: 25 }
      }
    });
    
    // Agregar footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${i} de ${pageCount} - Generado el ${dayjs().format("DD/MM/YYYY HH:mm")}`,
        105,
        285,
        { align: "center" }
      );
    }
    
    // Descargar PDF
    const fileName = `historial_cobros_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_${dayjs().format('DD-MM-YYYY')}.pdf`;
    doc.save(fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-11/12 max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            Historial de Cobros - {businessName}
          </h2>
          <div className="flex space-x-2">
            {cobros.length > 0 && (
              <button
                onClick={generarPDF}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center space-x-2"
              >
                <FaFilePdf />
                <span>Descargar PDF</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <FaTimes size={24} />
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Cargando historial...</span>
          </div>
        ) : cobros.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No se encontraron cobros para este negocio.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full table-auto bg-white shadow-sm rounded text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="py-3 px-3 text-left">#</th>
                  <th className="py-3 px-3 text-left">Fecha</th>
                  <th className="py-3 px-3 text-left">Monto</th>
                  <th className="py-3 px-3 text-left">Agente</th>
                  <th className="py-3 px-3 text-left">Folio</th>
                  <th className="py-3 px-3 text-left">Método</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((cobro, index) => (
                  <tr key={cobro.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{index + 1}</td>
                    <td className="py-2 px-3">{formatearFecha(cobro.date)}</td>
                    <td className="py-2 px-3 font-semibold text-green-600">
                      {formatearMoneda(cobro.netAmount)}
                    </td>
                    <td className="py-2 px-3">{cobro.agentName || "N/A"}</td>
                    <td className="py-2 px-3">{cobro.folio || "N/A"}</td>
                    <td className="py-2 px-3">{cobro.paymentMethod || "Efectivo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {cobros.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-semibold">Total de cobros:</span> {cobros.length}
              </div>
              <div>
                <span className="font-semibold">Total cobrado:</span>{" "}
                <span className="text-green-600 font-bold">
                  {formatearMoneda(cobros.reduce((sum, cobro) => sum + (cobro.netAmount || 0), 0))}
                </span>
              </div>
              <div>
                <span className="font-semibold">Último cobro:</span>{" "}
                {cobros.length > 0 ? formatearFecha(cobros[0].date) : "N/A"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReporteCobrosModal({
  isOpen,
  onClose,
  businesses,
  selectedBusinesses,
  onToggleBusiness,
  selectAll,
  onToggleSelectAll,
  startDate,
  endDate,
  onDateChange,
  onGenerate,
  loading,
  message,
  dateRangeError,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredBusinesses = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return businesses;
    return businesses.filter((business) => {
      const haystack = (
        `${business.name || ""} ${business.owner || ""} ${business.type || ""} ${
          business.phone || ""
        }`
      ).toLowerCase();
      return haystack.includes(normalized);
    });
  }, [businesses, searchTerm]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            Generar reporte de cobros
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Cerrar modal de reporte"
          >
            <FaTimes size={22} />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="flex items-center space-x-2">
            <input
              id="select-all-reporte"
              type="checkbox"
              className="h-4 w-4"
              checked={selectAll}
              onChange={onToggleSelectAll}
            />
            <label htmlFor="select-all-reporte" className="font-semibold">
              Seleccionar todos
            </label>
            <span className="text-gray-500">
              {selectedBusinesses.length} de {businesses.length} negocios
            </span>
          </div>
          <div>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar negocio..."
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-52 overflow-y-auto border rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {businesses.length === 0 ? (
              <p className="text-gray-500">No se encontraron negocios.</p>
            ) : filteredBusinesses.length === 0 ? (
              <p className="text-gray-500">No hay coincidencias para esa búsqueda.</p>
            ) : (
              filteredBusinesses.map((business) => (
                <label
                  key={business.id}
                  className="flex items-center space-x-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selectedBusinesses.includes(business.id)}
                    onChange={() => onToggleBusiness(business.id)}
                  />
                  <span className="truncate">
                    {business.name || "Negocio sin nombre"}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Fecha inicial
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onDateChange("start", e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Fecha final
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onDateChange("end", e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          {(message || dateRangeError) && (
            <p className="text-sm text-red-600">
              {message || dateRangeError}
            </p>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border text-sm hover:border-gray-400"
            >
              Cancelar
            </button>
            <button
              onClick={onGenerate}
              disabled={loading || !!dateRangeError}
              className="flex items-center justify-center space-x-2 px-4 py-2 rounded bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-60"
            >
              {loading ? "Generando..." : "Generar PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente BusinessEditForm (sin cambios, solo agregamos la prop para manejar el historial)
function BusinessEditForm({
  newBusiness,
  handleInputChange,
  handleFormSubmit,
  handleCancel,
  agentMapping,
  handleScheduleChange,
}) {
  const daysOfWeek = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];

  return (
    <form onSubmit={handleFormSubmit} className="space-y-2">
      {/* Primera fila: Nombre y Dueño */}
      <div className="flex flex-col sm:flex-row sm:space-x-2">
        <input
          type="text"
          name="name"
          value={newBusiness.name}
          onChange={handleInputChange}
          placeholder="Nombre del negocio"
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
          required
        />
        <input
          type="text"
          name="owner"
          value={newBusiness.owner}
          onChange={handleInputChange}
          placeholder="Dueño"
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
          required
        />
      </div>
      {/* Segunda fila: WhatsApp y Giro comercial */}
      <div className="flex flex-col sm:flex-row sm:space-x-2">
        <input
          type="text"
          name="phone"
          value={newBusiness.phone}
          onChange={handleInputChange}
          placeholder="WhatsApp"
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
          required
        />
        <input
          type="text"
          name="type"
          value={newBusiness.type}
          onChange={handleInputChange}
          placeholder="Giro comercial"
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
          required
        />
      </div>
      {/* Tercera fila: Cuota y Agente asignado */}
      <div className="flex flex-col sm:flex-row sm:space-x-2">
        <input
          type="number"
          name="quota"
          value={newBusiness.quota}
          onChange={handleInputChange}
          placeholder="Cuota"
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
          required
        />
        <select
          name="agentId"
          value={newBusiness.agentId}
          onChange={handleInputChange}
          className="w-full sm:w-1/2 px-3 py-2 border rounded"
        >
          <option value="">Seleccionar Agente</option>
          {Object.keys(agentMapping).map((agentId) => (
            <option key={agentId} value={agentId}>
              {agentMapping[agentId]}
            </option>
          ))}
        </select>
      </div>
      {/* Horario */}
      <div className="space-y-2">
        <div>
          <span className="text-gray-700 block mb-1 text-sm">
            Días de apertura:
          </span>
          <div className="flex flex-wrap">
            {daysOfWeek.map((day) => (
              <label key={day} className="mr-2 flex items-center text-sm">
                <input
                  type="checkbox"
                  name="days"
                  value={day}
                  checked={newBusiness.schedule?.days?.includes(day) || false}
                  onChange={(e) => {
                    let newDays = newBusiness.schedule?.days
                      ? [...newBusiness.schedule.days]
                      : [];
                    if (e.target.checked) {
                      if (!newDays.includes(day)) {
                        newDays.push(day);
                      }
                    } else {
                      newDays = newDays.filter((d) => d !== day);
                    }
                    handleScheduleChange("days", newDays);
                  }}
                  className="mr-1"
                />
                {day}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:space-x-2">
          <input
            type="time"
            name="openingTime"
            value={newBusiness.schedule?.openingTime || ""}
            onChange={(e) => handleScheduleChange("openingTime", e.target.value)}
            placeholder="Apertura"
            className="w-full sm:w-1/2 px-3 py-2 border rounded"
          />
          <input
            type="time"
            name="closingTime"
            value={newBusiness.schedule?.closingTime || ""}
            onChange={(e) => handleScheduleChange("closingTime", e.target.value)}
            placeholder="Cierre"
            className="w-full sm:w-1/2 px-3 py-2 border rounded"
          />
        </div>
      </div>
      {/* Botones */}
      <div className="flex justify-end space-x-2 mt-4">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded border text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-500 text-white text-sm"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}

/** Componente SwitchButton para cambiar el estado del negocio */
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
  const auth = getAuth();
  const user = auth.currentUser;
  const userId = user ? user.uid : null;

  // Estado inicial para el negocio
  const initialBusinessState = {
    name: "",
    address: "",
    location: "",
    phone: "",
    owner: "",
    type: "",
    quota: 0,
    agentId: "",
    creatorId: userId || "unknown",
    createdAt: null,
    status: "activo",
    qrUrl: "",
    schedule: {
      days: [],
      openingTime: "",
      closingTime: "",
    },
  };

  // Estados principales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newBusinesses, setNewBusinesses] = useState([]);
  const [newBusiness, setNewBusiness] = useState(initialBusinessState);
  const [isEditing, setIsEditing] = useState(false);
  const [alert, setAlert] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [autocompleteFocusedIndex, setAutocompleteFocusedIndex] = useState(-1);
  const autocompleteRef = useRef(null);
  const [agentMapping, setAgentMapping] = useState({});
  const [openDropdownId, setOpenDropdownId] = useState(null);
  // Estado para editar el agente asignado directamente en la tabla
  const [editingAgentBusinessId, setEditingAgentBusinessId] = useState(null);
  // Estado local para el valor seleccionado en el select
  const [selectedAgentValue, setSelectedAgentValue] = useState("");

  // Estados para el historial de cobros
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [selectedBusinessForHistorial, setSelectedBusinessForHistorial] = useState(null);
  // Estados para el reporte de cobros
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedBusinessesForReport, setSelectedBusinessesForReport] = useState([]);
  const [reportSelectAll, setReportSelectAll] = useState(false);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState(null);

  const resetReportFilters = () => {
    setSelectedBusinessesForReport([]);
    setReportSelectAll(false);
    setReportStartDate("");
    setReportEndDate("");
    setReportMessage(null);
    setReportLoading(false);
  };

  const handleReportModalClose = () => {
    resetReportFilters();
    setReportModalOpen(false);
  };

  const toggleBusinessSelectionForReport = (businessId) => {
    setSelectedBusinessesForReport((prev) =>
      prev.includes(businessId)
        ? prev.filter((id) => id !== businessId)
        : [...prev, businessId]
    );
  };

  const handleToggleSelectAll = () => {
    if (reportSelectAll) {
      setSelectedBusinessesForReport([]);
      setReportSelectAll(false);
    } else {
      const allIds = newBusinesses.map((business) => business.id).filter(Boolean);
      setSelectedBusinessesForReport(allIds);
      setReportSelectAll(true);
    }
  };

  const handleReportDateChange = (field, value) => {
    setReportMessage(null);
    if (field === "start") {
      setReportStartDate(value);
    } else {
      setReportEndDate(value);
    }
  };

  const filteredAutocompleteSuggestions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return newBusinesses
      .filter((business) => {
        const haystack = (
          `${business.name || ""} ${business.owner || ""} ${business.type || ""} ${
            business.phone || ""
          }`
        ).toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [newBusinesses, searchQuery]);

  const handleSuggestionSelect = (business) => {
    setSearchQuery(business.name || "");
    setIsAutocompleteOpen(false);
    setAutocompleteFocusedIndex(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (filteredAutocompleteSuggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutocompleteFocusedIndex((prev) =>
        prev < filteredAutocompleteSuggestions.length - 1 ? prev + 1 : 0
      );
      setIsAutocompleteOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutocompleteFocusedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredAutocompleteSuggestions.length - 1
      );
    } else if (event.key === "Enter") {
      if (autocompleteFocusedIndex >= 0) {
        event.preventDefault();
        handleSuggestionSelect(filteredAutocompleteSuggestions[autocompleteFocusedIndex]);
      }
    } else if (event.key === "Escape") {
      setIsAutocompleteOpen(false);
      setAutocompleteFocusedIndex(-1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target)
      ) {
        setIsAutocompleteOpen(false);
        setAutocompleteFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const validSelection = selectedBusinessesForReport.filter((id) =>
      newBusinesses.some((business) => business.id === id)
    );
    if (validSelection.length !== selectedBusinessesForReport.length) {
      setSelectedBusinessesForReport(validSelection);
    }
  }, [newBusinesses, selectedBusinessesForReport]);

  useEffect(() => {
    const allSelected =
      newBusinesses.length > 0 &&
      selectedBusinessesForReport.length === newBusinesses.length;
    if (allSelected !== reportSelectAll) {
      setReportSelectAll(allSelected);
    }
  }, [newBusinesses, selectedBusinessesForReport, reportSelectAll]);

  const reportDateRangeError =
    reportStartDate &&
    reportEndDate &&
    dayjs(reportStartDate).isAfter(dayjs(reportEndDate))
      ? "La fecha inicial no puede ser posterior a la fecha final."
      : null;

  const handleGenerateReport = async () => {
    if (selectedBusinessesForReport.length === 0) {
      setReportMessage("Selecciona al menos un negocio para generar el reporte.");
      return;
    }
    if (reportDateRangeError) {
      setReportMessage(reportDateRangeError);
      return;
    }
    setReportMessage(null);
    setReportLoading(true);
    try {
      const chosenBusinesses = newBusinesses.filter((business) =>
        selectedBusinessesForReport.includes(business.id)
      );
      if (chosenBusinesses.length === 0) {
        setReportMessage("Los negocios seleccionados no están disponibles.");
        return;
      }

      const startFilter = reportStartDate
        ? dayjs(reportStartDate).startOf("day").toDate()
        : null;
      const endFilter = reportEndDate
        ? dayjs(reportEndDate).endOf("day").toDate()
        : null;

      const reportEntries = [];
      for (const business of chosenBusinesses) {
        const filters = [where("businessId", "==", business.id)];
        if (startFilter) {
          filters.push(where("date", ">=", startFilter));
        }
        if (endFilter) {
          filters.push(where("date", "<=", endFilter));
        }
        filters.push(orderBy("date", "desc"));
        const cobrosSnapshot = await getDocs(query(collection(db, "cobros"), ...filters));
        const cobrosList = cobrosSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        reportEntries.push({ business, cobros: cobrosList });
      }

      const anyRecords = reportEntries.some((entry) => entry.cobros.length > 0);
      if (!anyRecords) {
        setReportMessage("No se encontraron cobros con los filtros seleccionados.");
        return;
      }

      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.setTextColor(134, 30, 61);
      doc.text("REPORTE DE COBROS", 105, 20, { align: "center" });
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`Negocios incluidos: ${chosenBusinesses.length}`, 20, 30);
      const rangoTexto =
        reportStartDate || reportEndDate
          ? `Rango: ${reportStartDate || "Inicio"} - ${reportEndDate || "Actualidad"}`
          : "Rango: Todas las fechas";
      doc.text(rangoTexto, 20, 36);

      reportEntries.forEach((entry, index) => {
        if (index > 0) {
          doc.addPage();
        }
        doc.setFontSize(16);
        doc.setTextColor(15, 52, 18);
        const businessInfoY = index === 0 ? 50 : 36;
        doc.text(
          `Negocio: ${entry.business.name || "Sin nombre"}`,
          20,
          businessInfoY
        );
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        const totalCobrado = entry.cobros.reduce(
          (sum, cobro) => sum + (cobro.netAmount || 0),
          0
        );
        doc.text(`Cobros encontrados: ${entry.cobros.length}`, 20, businessInfoY + 8);
        doc.text(`Total cobrado: ${formatearMoneda(totalCobrado)}`, 20, businessInfoY + 14);
        const tableStartY = businessInfoY + 28;

        if (entry.cobros.length === 0) {
          doc.setFontSize(11);
          doc.setTextColor(128, 128, 128);
          doc.text(
            "No se encontraron cobros para este negocio en el rango seleccionado.",
            20,
            tableStartY
          );
          return;
        }

        const tableData = entry.cobros.map((cobro, cobroIndex) => [
          cobroIndex + 1,
          formatearFecha(cobro.date),
          formatearMoneda(cobro.netAmount),
          cobro.agentName || "N/A",
          cobro.folio || "N/A",
          cobro.paymentMethod || "N/A",
        ]);

        doc.autoTable({
          startY: tableStartY,
          head: [["#", "Fecha", "Monto", "Agente", "Folio", "Método"]],
          body: tableData,
          styles: {
            fontSize: 9,
            cellPadding: 3,
          },
          headStyles: {
            fillColor: [134, 30, 61],
            textColor: 255,
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          columnStyles: {
            0: { halign: "center", cellWidth: 8 },
            1: { cellWidth: 30 },
            2: { halign: "right", cellWidth: 25 },
            3: { cellWidth: 30 },
            4: { halign: "center", cellWidth: 25 },
            5: { cellWidth: 25 },
          },
        });
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Página ${page} de ${totalPages} - Generado el ${dayjs().format(
            "DD/MM/YYYY HH:mm"
          )}`,
          105,
          287,
          { align: "center" }
        );
      }

      const fileName = `reporte_cobros_${dayjs().format(
        "DD-MM-YYYY_HH-mm"
      )}.pdf`;
      doc.save(fileName);
      resetReportFilters();
      setReportModalOpen(false);
    } catch (error) {
      console.error("Error generando reporte de cobros:", error);
      setReportMessage("Ocurrió un error al generar el reporte.");
    } finally {
      setReportLoading(false);
    }
  };

  // Agregamos paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Funciones para el registro multi-step (no se usan en edición)
  const handleNextStep = () => {
    if (currentStep < 2) setCurrentStep(currentStep + 1);
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

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

  // Actualizar horario
  const handleScheduleChange = (field, value) => {
    setNewBusiness((prev) => ({
      ...prev,
      schedule: { ...prev.schedule, [field]: value },
    }));
  };

  // Función para descargar QR
  const downloadQR = (qrUrl, name) => {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${name}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para abrir el historial de cobros
  const abrirHistorialCobros = (business) => {
    setSelectedBusinessForHistorial(business);
    setHistorialModalOpen(true);
    setOpenDropdownId(null);
  };

  // Función para descargar el padrón completo de negocios en Excel
  const handleDownloadAllBusinesses = () => {
    if (newBusinesses.length === 0) {
      alert("No se encontraron negocios.");
      return;
    }
    const data = newBusinesses.map((biz) => {
      return {
        ID: biz.id,
        Nombre: biz.name || "Sin nombre",
        Dirección: biz.address || "No disponible",
        Teléfono: biz.phone || "No disponible",
        Propietario: biz.owner || "No disponible",
        "Agente Asignado": agentMapping[biz.agentId] || "Sin asignar",
        Tipo: biz.type || "No disponible",
        Quota:
          biz.quota !== undefined && biz.quota !== null ? biz.quota : "Sin cuota",
        Estado: biz.status || "No disponible",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Negocios");
    const currentDate = dayjs().format("DD-MM-YY");
    const fileName = `padron_completo_${currentDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Obtener negocios (carga inicial)
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

  // Suscripción en tiempo real para negocios
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

  // Suscripción en tiempo real para agentes (usuarios con rol "Cobrador")
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

  // Manejar cambios en inputs simples
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewBusiness({ ...newBusiness, [name]: value });
  };

  // Registrar negocio (modo creación, multi-step)
  const handleFormSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : "unknown";
      const timestamp = new Date().toISOString();

      if (!newBusiness.schedule?.days || newBusiness.schedule.days.length === 0) {
        alert("Por favor selecciona al menos un día de apertura.");
        return;
      }

      const businessData = {
        ...newBusiness,
        createdAt: timestamp,
        creatorId: userId,
      };

      const docRef = await addDoc(collection(db, "negocios"), businessData);

      // Generar el QR (solo en creación)
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 400;
      const context = canvas.getContext("2d");

      const QRCode = require("qrcode");
      await QRCode.toCanvas(canvas, docRef.id, { width: 300 });

      const logoImage = new Image();
      logoImage.src = require("../assets/logoQr.png");
      logoImage.onload = async () => {
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
      };
    } catch (error) {
      console.error("Error al registrar negocio:", error);
    }
  };

  // Iniciar edición (modo edición)
  const handleEditBusiness = (business) => {
    setNewBusiness(business);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  // Enviar formulario en modo edición
  const handleEditFormSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const { id, name, owner, phone, type, quota, schedule, agentId } = newBusiness;
      const dataToUpdate = {
        name,
        owner,
        phone,
        type,
        quota,
        agentId,
        schedule,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "negocios", id), dataToUpdate);
      setAlert({
        type: "success",
        message: "Negocio actualizado correctamente",
      });
      setNewBusiness(initialBusinessState);
      setIsModalOpen(false);
      setIsEditing(false);
    } catch (error) {
      console.error("Error actualizando negocio:", error);
      setAlert({
        type: "error",
        message: "Hubo un error actualizando el negocio",
      });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  // Función para cambiar el estado del negocio
  const handleStatusChange = async (businessId, newStatus) => {
    try {
      const docRef = doc(db, "negocios", businessId);
      await updateDoc(docRef, { status: newStatus });
      setAlert({
        type: "success",
        message:
          newStatus === "activo"
            ? "El negocio se ha ACTIVADO con éxito"
            : "El negocio se ha DESACTIVADO con éxito",
      });
      setTimeout(() => setAlert(null), 3000);
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      setAlert({
        type: "error",
        message: "Hubo un error al cambiar el estado.",
      });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  // Función para actualizar el agente asignado desde la tabla
  const handleAgentChange = async (businessId, newAgentId) => {
    try {
      const docRef = doc(db, "negocios", businessId);
      await updateDoc(docRef, {
        agentId: newAgentId,
        updatedAt: new Date().toISOString(),
      });
      setAlert({
        type: "success",
        message: "Agente actualizado correctamente",
      });
      setEditingAgentBusinessId(null);
    } catch (error) {
      console.error("Error actualizando agente:", error);
      setAlert({
        type: "error",
        message: "Hubo un error actualizando el agente.",
      });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  // Filtrar negocios según la búsqueda
  const filteredBusinesses = newBusinesses.filter((business) => {
    const query = searchQuery.toLowerCase();
    return (
      (business.name && business.name.toLowerCase().includes(query)) ||
      (business.owner && business.owner.toLowerCase().includes(query)) ||
      (business.type && business.type.toLowerCase().includes(query)) ||
      (business.address && business.address.toLowerCase().includes(query))
    );
  });

  // Paginación
  const totalPages = Math.ceil(filteredBusinesses.length / itemsPerPage);
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }
  const paginatedBusinesses = filteredBusinesses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="container mx-auto p-4 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Lista de Negocios</h1>

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

      {/* Botón de registro, buscador y botón para descargar todos los negocios */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 space-y-2 md:space-y-0">
        <div className="flex items-center space-x-2">
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            onClick={() => {
              setNewBusiness(initialBusinessState);
              setIsEditing(false);
              setCurrentStep(1);
              setIsModalOpen(true);
            }}
          >
            Registrar Negocio
          </button>
          <button
            onClick={handleDownloadAllBusinesses}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Descargar Padrón Completo
          </button>
          <button
            onClick={() => {
              resetReportFilters();
              setReportModalOpen(true);
            }}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 flex items-center space-x-2"
          >
            <FaFilePdf />
            <span>Generar Reporte</span>
          </button>
        </div>
        <div ref={autocompleteRef} className="relative w-full md:w-1/3">
          <input
            type="text"
            autoComplete="off"
            placeholder="Buscar por nombre, propietario, tipo..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsAutocompleteOpen(true);
              setAutocompleteFocusedIndex(-1);
            }}
            onFocus={() => setIsAutocompleteOpen(true)}
            onKeyDown={handleSearchKeyDown}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isAutocompleteOpen && filteredAutocompleteSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded border bg-white shadow-lg text-sm">
              {filteredAutocompleteSuggestions.map((business, index) => (
                <li
                  key={business.id}
                  onMouseEnter={() => setAutocompleteFocusedIndex(index)}
                  onMouseLeave={() => setAutocompleteFocusedIndex(-1)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSuggestionSelect(business)}
                  className={`px-3 py-2 cursor-pointer ${
                    autocompleteFocusedIndex === index
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <div className="font-medium">
                    {business.name || "Negocio sin nombre"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {business.owner || "Propietario desconocido"} ·{" "}
                    {business.phone || "Sin teléfono"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tabla de negocios */}
      <table className="w-full table-auto bg-white shadow-md rounded-lg text-sm">
        <thead className="bg-gray-200 text-gray-700 uppercase">
          <tr>
            <th className="py-2 px-2 text-left">Nombre</th>
            <th className="py-2 px-2 text-left">Ubicación</th>
            <th className="py-2 px-2 text-left">Teléfono</th>
            <th className="py-2 px-2 text-left">Propietario</th>
            <th className="py-2 px-2 text-left">Agente Asignado</th>
            <th className="py-2 px-2 text-left">Tipo</th>
            <th className="py-2 px-2 text-left">Cuota</th>
            <th className="py-2 px-2 text-left">Estado</th>
            <th className="py-2 px-2 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody className="text-gray-600">
          {paginatedBusinesses.length > 0 ? (
            paginatedBusinesses.map((business, index) => (
              <tr
                key={business.id || index}
                className="border-b hover:bg-gray-100"
              >
                <td className="py-2 px-2 break-words">{business.name}</td>
                <td className="py-2 px-2 break-words">
                  {business.address || "No disponible"}
                </td>
                <td className="py-2 px-2 break-words">{business.phone}</td>
                <td className="py-2 px-2 break-words">{business.owner}</td>
                <td className="py-2 px-2 break-words">
                  {editingAgentBusinessId === business.id ? (
                    <select
                      value={selectedAgentValue}
                      onChange={(e) => setSelectedAgentValue(e.target.value)}
                      onBlur={async () => {
                        await handleAgentChange(business.id, selectedAgentValue);
                      }}
                      className="px-2 py-1 border rounded"
                      autoFocus
                    >
                      <option value="">Seleccionar Agente</option>
                      {Object.keys(agentMapping).map((agentId) => (
                        <option key={agentId} value={agentId}>
                          {agentMapping[agentId]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => {
                        setSelectedAgentValue(business.agentId);
                        setEditingAgentBusinessId(business.id);
                      }}
                    >
                      {agentMapping[business.agentId] || "N/A"}
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 break-words">{business.type}</td>
                <td className="py-2 px-2 break-words">
                  ${business.quota || "0.00"}
                </td>
                <td className="py-2 px-2">
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
                <td className="py-2 px-2 text-center relative">
                  <button
                    className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-800"
                    onClick={() =>
                      setOpenDropdownId(
                        openDropdownId === business.id ? null : business.id
                      )
                    }
                  >
                    Acciones
                  </button>
                  {openDropdownId === business.id && (
                    <div className="absolute right-0 mt-1 w-48 bg-white border rounded shadow-lg z-10">
                      {business.qrUrl ? (
                        <button
                          className="block w-full text-left px-3 py-2 hover:bg-gray-200 text-sm"
                          onClick={() => {
                            downloadQR(business.qrUrl, business.name);
                            setOpenDropdownId(null);
                          }}
                        >
                          Descargar QR
                        </button>
                      ) : (
                        <button
                          className="block w-full text-left px-3 py-2 text-gray-400 text-sm cursor-not-allowed"
                          disabled
                        >
                          QR No disponible
                        </button>
                      )}
                      <button
                        className="block w-full text-left px-3 py-2 hover:bg-gray-200 text-sm"
                        onClick={() => {
                          handleEditBusiness(business);
                          setOpenDropdownId(null);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="block w-full text-left px-3 py-2 hover:bg-gray-200 text-sm flex items-center space-x-2"
                        onClick={() => abrirHistorialCobros(business)}
                      >
                        <FaEye className="text-blue-500" />
                        <span>Ver Historial</span>
                      </button>
                      <button
                        className="block w-full text-left px-3 py-2 hover:bg-gray-200 text-sm flex items-center space-x-2"
                        onClick={() => {
                          setSelectedBusinessForHistorial(business);
                          setHistorialModalOpen(true);
                          setOpenDropdownId(null);
                        }}
                      >
                        <FaFilePdf className="text-red-500" />
                        <span>Descargar PDF</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan="9"
                className="text-center py-2 text-gray-500 italic"
              >
                No hay negocios disponibles.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Controles de paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-4 space-x-4">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            className="px-3 py-1 bg-gray-300 rounded disabled:opacity-50"
            disabled={currentPage === 1}
          >
            Anterior
          </button>
          <span className="text-sm">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            className="px-3 py-1 bg-gray-300 rounded disabled:opacity-50"
            disabled={currentPage === totalPages}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal para registro/edición */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50"
          onClick={(e) => {
            if (e.target.classList.contains("bg-gray-600")) {
              setIsModalOpen(false);
              setIsEditing(false);
              setNewBusiness(initialBusinessState);
            }
          }}
        >
          <div className="bg-white p-6 rounded shadow-md w-[800px] relative">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setIsEditing(false);
                setNewBusiness(initialBusinessState);
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
              <FaTimes size={20} />
            </button>
            {isEditing ? (
              <BusinessEditForm
                newBusiness={newBusiness}
                handleInputChange={handleInputChange}
                handleFormSubmit={handleEditFormSubmit}
                handleCancel={() => {
                  setIsModalOpen(false);
                  setIsEditing(false);
                  setNewBusiness(initialBusinessState);
                }}
                agentMapping={agentMapping}
                handleScheduleChange={handleScheduleChange}
              />
            ) : (
              <BusinessForm
                newBusiness={newBusiness}
                setNewBusiness={setNewBusiness}
                handleInputChange={handleInputChange}
                handleNextStep={handleNextStep}
                handlePreviousStep={handlePreviousStep}
                detectLocation={detectLocation}
                handleFormSubmit={handleFormSubmit}
                currentStep={currentStep}
                handleCancel={() => {
                  setIsModalOpen(false);
                  setNewBusiness(initialBusinessState);
                }}
                isEditing={isEditing}
              />
            )}
          </div>
        </div>
      )}

      {/* Modal para reporte de cobros */}
      {reportModalOpen && (
        <ReporteCobrosModal
          isOpen={reportModalOpen}
          onClose={handleReportModalClose}
          businesses={newBusinesses}
          selectedBusinesses={selectedBusinessesForReport}
          onToggleBusiness={toggleBusinessSelectionForReport}
          selectAll={reportSelectAll}
          onToggleSelectAll={handleToggleSelectAll}
          startDate={reportStartDate}
          endDate={reportEndDate}
          onDateChange={handleReportDateChange}
          onGenerate={handleGenerateReport}
          loading={reportLoading}
          message={reportMessage}
          dateRangeError={reportDateRangeError}
        />
      )}
      {/* Modal para historial de cobros */}
      <HistorialCobrosModal
        isOpen={historialModalOpen}
        onClose={() => {
          setHistorialModalOpen(false);
          setSelectedBusinessForHistorial(null);
        }}
        businessId={selectedBusinessForHistorial?.id}
        businessName={selectedBusinessForHistorial?.name}
      />
    </div>
  );
};

export default BusinessesPage;

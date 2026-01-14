// AgentesGrupos.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isBetween from "dayjs/plugin/isBetween";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import AgentScoreboardModal from "./AgentScoreboardModal";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const AgentesGrupos = () => {
  const db = getFirestore();

  const [selectedTab, setSelectedTab] = useState("agentes");
  const [agents, setAgents] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Estados de carga global
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "Cobrador"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const agentsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAgents(agentsData);
      setLoadingAgents(false);
    });
    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    const q = query(collection(db, "negocios"), where("status", "==", "activo"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const businessesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setBusinesses(businessesData);
      setLoadingBusinesses(false);
    });
    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cobros"), (snapshot) => {
      const paymentsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        let parsedDate;
        if (typeof data.date === "string") {
          parsedDate = dayjs(data.date, "D [de] MMMM [de] YYYY, h:mm:ss a [UTC]Z").toDate();
        } else if (data.date && data.date.toDate) {
          parsedDate = data.date.toDate();
        } else {
          parsedDate = new Date();
        }
        return {
          id: doc.id,
          ...data,
          paymentDate: parsedDate,
          amount: Number(data.netAmount !== undefined ? data.netAmount : data.amount || 0),
          businessId: data.businessId,
          receiptUrl: data.receiptUrl,
        };
      });
      setPayments(paymentsData);
      setLoadingPayments(false);
    });
    return () => unsubscribe();
  }, [db]);

  const businessCountByAgent = useMemo(() => {
    const mapping = {};
    businesses.forEach((biz) => {
      if (biz.agentId) {
        mapping[biz.agentId] = (mapping[biz.agentId] || 0) + 1;
      }
    });
    return mapping;
  }, [businesses]);

  const getActiveBusinessCount = useCallback(
    (agentId) => businessCountByAgent[agentId] || 0,
    [businessCountByAgent]
  );

  const handleDownloadPadron = useCallback(
    (agent) => {
      if (!businesses || businesses.length === 0) {
        alert("No se encontraron negocios.");
        return;
      }
      const assignedBusinesses = businesses.filter((biz) => biz.agentId === agent.id);
      if (assignedBusinesses.length === 0) {
        alert("No hay negocios asignados a este agente.");
        return;
      }
      const data = assignedBusinesses.map((biz) => ({
        ID: biz.id,
        "Nombre del Negocio": biz.name || "Sin nombre",
        Dirección: biz.address || "Sin dirección",
        Estado: biz.status,
        "Teléfono del Negocio": biz.phone || "Sin teléfono",
        Quota: biz.quota !== undefined && biz.quota !== null ? biz.quota : "Sin quota",
        "Agente": agent.name,
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Negocios");
      const currentDate = dayjs().format("DD-MM-YY");
      const fileName = `padron_${agent.name}_${currentDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    },
    [businesses]
  );

  const isLoading = loadingAgents || loadingBusinesses || loadingPayments;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
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
        <p className="text-lg">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Agentes y Grupos</h1>
      <div className="mb-4 border-b">
        <nav className="flex space-x-4">
          <button
            onClick={() => setSelectedTab("agentes")}
            className={`px-4 py-2 focus:outline-none ${
              selectedTab === "agentes" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-500"
            }`}
          >
            Agentes
          </button>
          <button
            onClick={() => setSelectedTab("grupos")}
            className={`px-4 py-2 focus:outline-none ${
              selectedTab === "grupos" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-500"
            }`}
          >
            Grupos
          </button>
        </nav>
      </div>

      {selectedTab === "agentes" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Lista de Agentes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white shadow rounded-lg">
              <thead>
                <tr className="bg-gray-200 text-gray-700 uppercase text-sm leading-normal">
                  <th className="py-3 px-6 text-left">Nombre</th>
                  <th className="py-3 px-6 text-left">Negocios Activos</th>
                  <th className="py-3 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 text-sm font-light">
                {agents.length > 0 ? (
                  agents.map((agent) => (
                    <tr key={agent.id} className="border-b border-gray-200 hover:bg-gray-100">
                      <td className="py-3 px-6 text-left whitespace-nowrap">{agent.name}</td>
                      <td className="py-3 px-6 text-left">{getActiveBusinessCount(agent.id)}</td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setSelectedAgent(agent)}
                            className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                          >
                            Ver Score
                          </button>
                          <button
                            onClick={() => handleDownloadPadron(agent)}
                            className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                          >
                            Descargar Padrón
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center py-3 text-gray-500 italic">
                      No se encontraron agentes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTab === "grupos" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Grupos</h2>
          <p>Aún no hay grupos creados.</p>
        </div>
      )}

      {selectedAgent && (
        <AgentScoreboardModal
          agent={selectedAgent}
          businesses={businesses}
          payments={payments}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
};

export default AgentesGrupos;

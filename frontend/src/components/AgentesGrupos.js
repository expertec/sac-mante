// AgentesGrupos.js

// Todas las importaciones deben estar al inicio del archivo:
import React, { useState, useEffect } from "react";
import { getFirestore, collection, query, where, onSnapshot } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isBetween from "dayjs/plugin/isBetween";
import { Line } from "react-chartjs-2";
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

// Ahora, después de todos los imports, ejecutamos las extensiones y registros:
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Componente principal:
const AgentesGrupos = () => {
  const db = getFirestore();

  // Estados generales
  const [selectedTab, setSelectedTab] = useState("agentes");
  const [agents, setAgents] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Suscripción a agentes (usuarios con rol "Cobrador")
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "Cobrador"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const agentsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAgents(agentsData);
    });
    return () => unsubscribe();
  }, [db]);

  // Suscripción a negocios activos
  useEffect(() => {
    const q = query(collection(db, "negocios"), where("status", "==", "activo"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const businessesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setBusinesses(businessesData);
    });
    return () => unsubscribe();
  }, [db]);

  // Suscripción a cobros
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cobros"), (snapshot) => {
      const paymentsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          paymentDate: data.date && data.date.toDate ? data.date.toDate() : new Date(),
          amount: Number(data.netAmount !== undefined ? data.netAmount : data.amount || 0),
          // Se asume que cada pago tiene la propiedad businessId para identificar el negocio
          businessId: data.businessId,
        };
      });
      setPayments(paymentsData);
    });
    return () => unsubscribe();
  }, [db]);

  // Función para obtener la cantidad de negocios activos asignados a un agente
  const getActiveBusinessCount = (agentId) => {
    return businesses.filter((biz) => biz.agentId === agentId).length;
  };

  // Modal: Scorecard con opción para seleccionar período y scroll
  const AgentScoreboardModal = ({ agent, onClose }) => {
    // Por defecto, el período es desde hace 1 mes (a partir del día actual) hasta el día actual, usando "America/Mexico_City"
    const defaultStart = dayjs().tz("America/Mexico_City").subtract(1, "month").format("YYYY-MM-DD");
    const defaultEnd = dayjs().tz("America/Mexico_City").format("YYYY-MM-DD");
    const [periodStart, setPeriodStart] = useState(defaultStart);
    const [periodEnd, setPeriodEnd] = useState(defaultEnd);

    // Función para calcular las métricas en un período dado (zona horaria de México)
    const getAgentMetricsForPeriod = (agentId, start, end) => {
      const startDate = dayjs.tz(start, "America/Mexico_City");
      const endDate = dayjs.tz(end, "America/Mexico_City").endOf("day");

      const agentPayments = payments.filter((p) => {
        const paymentDate = dayjs(p.paymentDate).tz("America/Mexico_City");
        return p.agentId === agentId && paymentDate.isBetween(startDate, endDate, null, "[]");
      });

      const totalCobros = agentPayments.reduce((sum, p) => sum + p.amount, 0);
      const numeroCobros = agentPayments.length;

      // Agrupar cobros por día
      const dailyGroups = {};
      agentPayments.forEach((payment) => {
        const dayKey = dayjs(payment.paymentDate).tz("America/Mexico_City").format("YYYY-MM-DD");
        dailyGroups[dayKey] = (dailyGroups[dayKey] || 0) + payment.amount;
      });
      const daysWithPayments = Object.keys(dailyGroups).length;
      const promedioCobroDiario = daysWithPayments > 0 ? totalCobros / daysWithPayments : 0;
      const dailyData = Object.entries(dailyGroups)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const lastPayment = agentPayments.reduce((latest, current) => {
        return !latest || dayjs(current.paymentDate).isAfter(latest.paymentDate)
          ? current
          : latest;
      }, null);

      return { totalCobros, numeroCobros, promedioCobroDiario, lastPayment, dailyData };
    };

    // Función para calcular el porcentaje de clientes (negocios) a los que se les cobró en el período
    const getPaymentPercentageForPeriod = (agentId, start, end) => {
      const assigned = businesses.filter((biz) => biz.agentId === agentId);
      const totalClients = assigned.length;
      if (totalClients === 0) return 0;
      const startDate = dayjs.tz(start, "America/Mexico_City");
      const endDate = dayjs.tz(end, "America/Mexico_City").endOf("day");
      const agentPayments = payments.filter((p) => {
        const paymentDate = dayjs(p.paymentDate).tz("America/Mexico_City");
        return p.agentId === agentId && paymentDate.isBetween(startDate, endDate, null, "[]") && p.businessId;
      });
      const uniquePaid = new Set(agentPayments.map((p) => p.businessId));
      return (uniquePaid.size / totalClients) * 100;
    };

    const metrics = getAgentMetricsForPeriod(agent.id, periodStart, periodEnd);
    const paymentPercentage = getPaymentPercentageForPeriod(agent.id, periodStart, periodEnd);

    // Preparar datos para la gráfica
    const dailyData = metrics.dailyData || [];
    const chartLabels = dailyData.map((item) => item.date);
    const chartValues = dailyData.map((item) => item.total);
    const chartData = {
      labels: chartLabels,
      datasets: [
        {
          label: "Cobros Diarios",
          data: chartValues,
          fill: false,
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          tension: 0.4,
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 20,
            callback: (value) =>
              new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value),
          },
        },
      },
      plugins: {
        legend: { position: "top" },
        title: { display: true, text: "Evolución de Cobros Diarios" },
      },
    };

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-50 p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* Encabezado fijo */}
          <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex justify-between items-center">
            <h2 className="text-3xl font-bold text-gray-800">Scorecard: {agent.name}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Contenido del modal */}
          <div className="p-6">
            {/* Selección de período */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Selecciona un período</h3>
              <div className="flex space-x-4">
                <div>
                  <label className="block text-gray-700">Inicio</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-700">Fin</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 p-2 border rounded"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card: Negocios Activos */}
              <div className="bg-blue-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M4 21h16a1 1 0 001-1v-9a1 1 0 00-1-1H4a1 1 0 00-1 1v9a1 1 0 001 1z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-blue-700">Negocios Activos</h3>
                    <p className="text-2xl font-bold text-blue-900">{getActiveBusinessCount(agent.id)}</p>
                  </div>
                </div>
              </div>

              {/* Card: Número de Cobros */}
              <div className="bg-green-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2l4-4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 22a10 10 0 100-20 10 10 0 000 20z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-green-700">Número de Cobros</h3>
                    <p className="text-2xl font-bold text-green-900">{metrics.numeroCobros}</p>
                  </div>
                </div>
              </div>

              {/* Card: Total de Cobros */}
              <div className="bg-purple-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v2m0 16v2m8-10h2M2 12H4m13.657-7.657l1.414 1.414M4.93 19.07l1.414-1.414m0-11.314L4.93 4.93m13.657 13.657l-1.414-1.414" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-purple-700">Total de Cobros</h3>
                    <p className="text-2xl font-bold text-purple-900">
                      {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(metrics.totalCobros)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card: Promedio de Cobro Diario */}
              <div className="bg-indigo-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3v18h18" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 13h4v4H7zM13 7h4v10h-4z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-indigo-700">Promedio de Cobro Diario</h3>
                    <p className="text-2xl font-bold text-indigo-900">
                      {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(metrics.promedioCobroDiario)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card: Último Cobro */}
              <div className="bg-red-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-red-700">Último Cobro</h3>
                    {metrics.lastPayment ? (
                      <p className="text-2xl font-bold text-red-900">
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(metrics.lastPayment.amount)}
                        <span className="text-base font-normal text-red-800 ml-2">
                          el {dayjs(metrics.lastPayment.paymentDate).tz("America/Mexico_City").format("DD/MM/YYYY")}
                        </span>
                      </p>
                    ) : (
                      <p className="text-2xl font-bold text-red-900">0</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Card: Cobertura de Clientes */}
              <div className="bg-yellow-100 rounded-lg p-4 shadow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055a9 9 0 011 17.945M4.935 7.934a9 9 0 0114.13 0" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-yellow-700">Cobertura de Clientes</h3>
                    <p className="text-2xl font-bold text-yellow-900">{paymentPercentage.toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfica lineal */}
            <div className="mt-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Cobros Diarios</h3>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Agentes y Grupos</h1>
      <div className="mb-4 border-b">
        <nav className="flex space-x-4">
          <button
            onClick={() => setSelectedTab("agentes")}
            className={`px-4 py-2 focus:outline-none ${selectedTab === "agentes" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-500"}`}
          >
            Agentes
          </button>
          <button
            onClick={() => setSelectedTab("grupos")}
            className={`px-4 py-2 focus:outline-none ${selectedTab === "grupos" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-500"}`}
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
                  <th className="py-3 px-6 text-left">Promedio de Cobro Diario</th>
                  <th className="py-3 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 text-sm font-light">
                {agents.length > 0 ? (
                  agents.map((agent) => (
                    <tr key={agent.id} className="border-b border-gray-200 hover:bg-gray-100">
                      <td className="py-3 px-6 text-left whitespace-nowrap">{agent.name}</td>
                      <td className="py-3 px-6 text-left">{getActiveBusinessCount(agent.id)}</td>
                      <td className="py-3 px-6 text-left">
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                          (() => {
                            const startDate = dayjs().tz("America/Mexico_City").subtract(1, "month");
                            const endDate = dayjs().tz("America/Mexico_City").endOf("day");
                            const agentPayments = payments.filter((p) => {
                              const paymentDate = dayjs(p.paymentDate).tz("America/Mexico_City");
                              return p.agentId === agent.id && paymentDate.isBetween(startDate, endDate, null, "[]");
                            });
                            const total = agentPayments.reduce((sum, p) => sum + p.amount, 0);
                            const days = Object.keys(
                              agentPayments.reduce((acc, p) => {
                                const key = dayjs(p.paymentDate).tz("America/Mexico_City").format("YYYY-MM-DD");
                                acc[key] = true;
                                return acc;
                              }, {})
                            ).length;
                            return days > 0 ? total / days : 0;
                          })()
                        )}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <button onClick={() => setSelectedAgent(agent)} className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                          Ver Score
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center py-3 text-gray-500 italic">
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
        <AgentScoreboardModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
};

export default AgentesGrupos;

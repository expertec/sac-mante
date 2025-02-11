// AgentScoreboardModal.jsx
import React from "react";
import dayjs from "dayjs";
import {
  FaTimes,
  FaChartLine,
  FaBriefcase,
  FaDollarSign,
  FaBalanceScale,
} from "react-icons/fa";

const AgentScoreboardModal = ({ agent, metrics, activeBusinessCount, onClose }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-4xl p-6 relative">
        {/* Botón de cierre */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-800"
          title="Cerrar"
        >
          <FaTimes size={24} />
        </button>

        {/* Encabezado */}
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Score Card - {agent.name}
        </h2>

        {/* Grid de métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tarjeta: Negocios Activos */}
          <div className="bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg p-5 shadow-lg">
            <div className="flex items-center">
              <FaBriefcase className="text-4xl mr-4" />
              <div>
                <p className="text-lg">Negocios Activos</p>
                <p className="text-3xl font-bold">{activeBusinessCount}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-green-300 rounded-full h-2">
                {/* Aquí se simula una barra de progreso (ejemplo: si cada negocio equivale a 10% hasta un máximo de 100%) */}
                <div
                  className="bg-white h-2 rounded-full"
                  style={{ width: `${Math.min(activeBusinessCount * 10, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Tarjeta: Número de Cobros (Mes) */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-lg p-5 shadow-lg">
            <div className="flex items-center">
              <FaChartLine className="text-4xl mr-4" />
              <div>
                <p className="text-lg">Número de Cobros (Mes)</p>
                <p className="text-3xl font-bold">{metrics.numeroCobros}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-blue-300 rounded-full h-2">
                <div
                  className="bg-white h-2 rounded-full"
                  style={{ width: `${Math.min(metrics.numeroCobros * 10, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Tarjeta: Total de Cobros (Mes) */}
          <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg p-5 shadow-lg">
            <div className="flex items-center">
              <FaDollarSign className="text-4xl mr-4" />
              <div>
                <p className="text-lg">Total de Cobros (Mes)</p>
                <p className="text-3xl font-bold">
                  {new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: "MXN",
                  }).format(metrics.totalCobros)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-purple-300 rounded-full h-2">
                <div className="bg-white h-2 rounded-full" style={{ width: `100%` }}></div>
              </div>
            </div>
          </div>

          {/* Tarjeta: Promedio de Cobro Diario */}
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-700 text-white rounded-lg p-5 shadow-lg">
            <div className="flex items-center">
              <FaBalanceScale className="text-4xl mr-4" />
              <div>
                <p className="text-lg">Promedio de Cobro Diario</p>
                <p className="text-3xl font-bold">
                  {new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: "MXN",
                  }).format(metrics.promedioCobroDiario)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-yellow-300 rounded-full h-2">
                <div className="bg-white h-2 rounded-full" style={{ width: `100%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Sección: Último Cobro */}
        <div className="mt-8 bg-gray-100 p-4 rounded-lg">
          <h3 className="text-xl font-semibold text-gray-800">Último Cobro</h3>
          {metrics.lastPayment ? (
            <div className="mt-2 flex justify-between items-center">
              <p className="text-gray-700 text-lg">
                {new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: "MXN",
                }).format(metrics.lastPayment.amount)}
              </p>
              <p className="text-gray-500">
                {dayjs(metrics.lastPayment.paymentDate).format("DD/MM/YYYY")}
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No hay registros de cobro.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentScoreboardModal;

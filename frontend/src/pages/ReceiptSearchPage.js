import React, { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { FaExternalLinkAlt, FaSearch } from "react-icons/fa";
import { db } from "../config/firebase";
import logo from "../assets/logo.png";

const buildPhoneCandidates = (digits) => {
  const sanitized = digits.replace(/\D/g, "");
  if (!sanitized) return [];

  const candidates = [sanitized];

  if (!sanitized.startsWith("52")) {
    candidates.push(`52${sanitized}`);
  }

  if (!sanitized.startsWith("521")) {
    candidates.push(`521${sanitized}`);
  }

  return Array.from(new Set(candidates));
};

const toTimestampMillis = (value) => {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
};

const ITEMS_PER_PAGE = 6;

const ReceiptSearchPage = () => {
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [page, setPage] = useState(1);

  const handleSearch = async (event) => {
    event?.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setFeedback("Ingresa al menos 10 dígitos numéricos (sin espacios ni símbolos).");
      setResults([]);
      setPage(1);
      return;
    }
    setFeedback("");
    setLoading(true);
    setResults([]);

    try {
      const candidates = buildPhoneCandidates(digits);
      if (!candidates.length) {
        throw new Error("Teléfono inválido.");
      }

      const cobrosQuery = query(
        collection(db, "cobros"),
        where("businessPhone", "in", candidates)
      );
      const adeudosQuery = query(
        collection(db, "adeudos"),
        where("businessPhone", "in", candidates)
      );

      const [cobrosSnapshot, adeudosSnapshot] = await Promise.all([
        getDocs(cobrosQuery),
        getDocs(adeudosQuery),
      ]);

      const cobros = cobrosSnapshot.docs.map((doc) => ({
        id: doc.id,
        collection: "cobros",
        ...doc.data(),
      }));

      const adeudos = adeudosSnapshot.docs.map((doc) => ({
        id: doc.id,
        collection: "adeudos",
        ...doc.data(),
      }));

      const combined = [...cobros, ...adeudos];

      combined.sort((a, b) => toTimestampMillis(b.date) - toTimestampMillis(a.date));

      setResults(combined);
      setPage(1);

      if (!combined.length) {
        setFeedback("No se encontraron recibos para ese teléfono.");
      }
    } catch (error) {
      console.error("Error al buscar recibos:", error);
      setFeedback(
        "No fue posible buscar los recibos. Intenta de nuevo en unos momentos."
      );
    } finally {
      setLoading(false);
    }
  };

  const getReceiptUrl = (item) => item.receiptUrl || item.receiptURL;

  const getTransactionType = (item) => {
    if (item.collection === "adeudos" || item.tipo === "adeudo") {
      return "Adeudo";
    }
    if (item.tipo === "abono") {
      return "Abono";
    }
    return "Pago";
  };

  const getDisplayAmount = (item) => {
    if (item.netAmount != null) return item.netAmount;
    if (item.totalAmount != null) return item.totalAmount;
    if (item.dayAmount != null) return item.dayAmount;
    return 0;
  };

  const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
  const pageResults = results.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const handlePageChange = (direction) => {
    setPage((prev) => {
      const candidate = direction === "next" ? prev + 1 : prev - 1;
      if (candidate < 1) return 1;
      if (candidate > totalPages) return totalPages;
      return candidate;
    });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  return (
    <div className="min-h-screen bg-[#F8F5F4]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-10 text-center">
          <img src={logo} alt="Logo App" className="h-20 w-20 object-contain" />
          <div>
            <p className="text-xs uppercase tracking-wide text-[#861E3D]">
              Comprobantes digitales
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              Busca tus recibos por teléfono
            </h1>
          </div>
          <p className="text-sm text-gray-600">
            Escribe el mismo número que compartiste con tu agente (10 dígitos sin
            espacios ni símbolos) y podrás ver los comprobantes que se hayan
            emitido para ese teléfono.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <form
          onSubmit={handleSearch}
          className="rounded-2xl border border-[#E0DFDD] bg-white p-5 shadow-sm"
        >
          <label className="flex flex-col gap-3 text-sm font-semibold text-gray-700">
            Teléfono del negocio
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Ej. 5541122233"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-[#861E3D] focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#861E3D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5a1332] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FaSearch />
                {loading ? "Buscando..." : "Buscar recibos"}
              </button>
            </div>
          </label>
          {feedback && (
            <p className="mt-3 text-sm text-red-500">{feedback}</p>
          )}
        </form>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-gray-500">
            <span>
              {results.length
                ? `Se encontraron ${results.length} recibo${
                    results.length === 1 ? "" : "s"
                  }.`
                : "Introduce un teléfono para comenzar."}
            </span>
            <span className="text-xs uppercase tracking-wider text-[#861E3D]">
              {loading ? "Consultando Firestore" : "Datos públicos"}
            </span>
          </div>

          {results.length > 0 && (
            <div className="flex flex-col gap-4">
              {pageResults.map((item) => {
                const receiptUrl = getReceiptUrl(item);
                const dateMillis = toTimestampMillis(item.date);
                const formattedDate = dateMillis
                  ? new Date(dateMillis).toLocaleString("es-MX")
                  : "Fecha no disponible";
                return (
                  <article
                    key={`${item.collection}-${item.id}`}
                    className="rounded-2xl border border-[#E0DFDD] bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#861E3D]">
                          {getTransactionType(item)}
                        </p>
                        <h2 className="text-lg font-bold text-gray-900">
                          {item.businessName || "Nombre no disponible"}
                        </h2>
                        <p className="text-sm text-gray-500">
                          Folio: {item.folio || "N/D"} · {formattedDate}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(getDisplayAmount(item))}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <span>Agente: {item.agentName || "No registrado"}</span>
                      <span>Teléfono: {item.businessPhone || "N/A"}</span>
                      <span>Propietario: {item.ownerName || "N/A"}</span>
                    </div>

                    {receiptUrl ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#861E3D] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#861E3D] transition hover:bg-[#861E3D] hover:text-white"
                        >
                          <FaExternalLinkAlt />
                          Ver recibo
                        </a>
                        <span className="text-xs text-gray-500">
                          Se abrirá en una pestaña nueva
                        </span>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-gray-500">
                        No hay imagen del recibo disponible.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {results.length > ITEMS_PER_PAGE && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E0DFDD] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
              <button
                onClick={() => handlePageChange("prev")}
                disabled={page === 1}
                className="rounded-full border border-gray-300 px-3 py-1 text-[11px] font-semibold text-gray-700 transition enabled:hover:border-[#861E3D] enabled:hover:text-[#861E3D] disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-[11px] text-gray-500">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => handlePageChange("next")}
                disabled={page === totalPages}
                className="rounded-full border border-gray-300 px-3 py-1 text-[11px] font-semibold text-gray-700 transition enabled:hover:border-[#861E3D] enabled:hover:text-[#861E3D] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ReceiptSearchPage;

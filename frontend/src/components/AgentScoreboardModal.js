// AgentScoreboardModal.js
import React, { useMemo, useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/es";
import { jsPDF } from "jspdf";
import { FaTimes } from "react-icons/fa";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("es");

const TZ = "America/Mexico_City";
const LOGO_URL = "https://i.imgur.com/5BMF8oB.png";

const C = {
  text: [17, 17, 17],
  muted: [102, 102, 102],
  border: [226, 232, 240],
  success: [167, 19, 54],
  green: [13, 148, 136],
};

// --- Helpers ---
const isFsTs = (v) => v && typeof v === "object" && typeof v.toDate === "function";
const toDate = (v) => (isFsTs(v) ? v.toDate() : v ? new Date(v) : null);
const fmtDate = (d) => (d ? dayjs(d).tz(TZ).format("D/M/YYYY, h:mm:ss a") : "");
const fmtMx = (n) =>
  typeof n === "number"
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })
    : n ?? "";

async function urlToBase64(url) {
  const res = await fetch(url, { mode: "cors" });
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

const drawWrappedParagraph = (pdf, text, x, y, maxWidth, lineHeight, maxHeight) => {
  const wrapped = pdf.splitTextToSize(String(text || ""), maxWidth);
  let curY = y;
  for (let i = 0; i < wrapped.length; i++) {
    if (curY + lineHeight > y + maxHeight) {
      pdf.text("…", x, curY);
      return curY + lineHeight;
    }
    pdf.text(wrapped[i], x, curY);
    curY += lineHeight;
  }
  return curY;
};

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export default function AgentScoreboardModal({ agent, payments = [], onClose }) {
  const defaultStart = dayjs().tz(TZ).subtract(1, "day").format("YYYY-MM-DD");
  const defaultEnd = dayjs().tz(TZ).format("YYYY-MM-DD");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [logoBase64, setLogoBase64] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const agentId = agent?.id || agent?.uid || agent?.userId;
  const agentName = useMemo(() => agent?.name || agent?.displayName || "Agente", [agent]);

  useEffect(() => {
    urlToBase64(LOGO_URL).then(setLogoBase64).catch(() => setLogoBase64(null));
  }, []);

  const getRows = useCallback(() => {
    const start = dayjs.tz(periodStart, TZ).startOf("day");
    const end = dayjs.tz(periodEnd, TZ).endOf("day");
    return payments
      .filter((p) => {
        const d = toDate(p.date ?? p.paymentDate);
        if (!d) return false;
        const dd = dayjs(d).tz(TZ);
        return p.agentId === agentId && dd.isBetween(start, end, null, "[]");
      })
      .map((p) => {
        const dt = toDate(p.date ?? p.paymentDate);
        const amount = Number(p.totalAmount ?? p.netAmount ?? p.amount ?? 0);
        return {
          folio: p.folio || p.id || p.paymentId || "",
          cargo: fmtMx(amount),
          total: fmtMx(amount),
          cobradoPor: agentName,
          pagadoPor: p.ownerName || p.customerName || p.clientName || p.customer || "",
          fecha: fmtDate(dt),
        };
      });
  }, [payments, periodStart, periodEnd, agentId, agentName]);

  const drawCard = (pdf, x, y, w, h, data) => {
    pdf.setDrawColor(...C.border);
    pdf.roundedRect(x, y, w, h, 3, 3);

    const padding = 6;
    let cursorY = y + padding;

    if (logoBase64) {
      const logoW = 28;
      const logoH = 12;
      pdf.addImage(logoBase64, "PNG", x + padding, cursorY, logoW, logoH);
    }

    pdf.setTextColor(...C.success);
    pdf.setFontSize(16);
    pdf.setFont(undefined, "normal");
    pdf.text("Pago Exitoso", x + padding + (logoBase64 ? 34 : 0), cursorY + 8);

    cursorY += logoBase64 ? 30 : 24;

    pdf.setTextColor(...C.text);
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text(`Folio: ${data.folio}`, x + padding, cursorY);
    cursorY += 8;

    pdf.setTextColor(...C.green);
    pdf.text(`Cargo del día: ${data.cargo}`, x + padding, cursorY);
    cursorY += 8;

    pdf.setTextColor(...C.text);
    pdf.text(`Total ${data.total}`, x + padding, cursorY);
    cursorY += 10;

    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text(`Cobrado por: ${data.cobradoPor}`, x + padding, cursorY);
    cursorY += 6;
    pdf.text(`Pagado por: ${data.pagadoPor || "-"}`, x + padding, cursorY);
    cursorY += 6;
    pdf.setTextColor(...C.muted);
    pdf.text(data.fecha, x + padding, cursorY);
    cursorY += 10;

    pdf.setTextColor(...C.muted);
    pdf.setFontSize(8);

    const legalParas = [
      "Apartado 8. Por el uso de la vía pública por comerciantes ambulantes o con puestos fijos y semifijos.",
      "Artículo 18.- Los derechos por el uso de la vía pública se causarán conforme a lo siguiente:",
      "I. Los comerciantes ambulantes, pagarán de $10.00 diarios;",
      "II. Los puestos fijos o semifijos pagarán de $10.00 pesos diarios por m².",
      "*El presente comprobante no representa un permiso.",
    ];

    const maxWidth = w - padding * 2;
    const lineHeight = 3.6;
    const availableHeight = (y + h) - padding - cursorY;

    let usedY = 0;
    for (const p of legalParas) {
      if (usedY > 0) cursorY += 1.5;
      const before = cursorY;
      cursorY = drawWrappedParagraph(
        pdf, p, x + padding, cursorY, maxWidth, lineHeight, availableHeight - usedY
      );
      usedY += (cursorY - before);
      if (usedY >= availableHeight - lineHeight) break;
    }
  };

  const handleDownload = useCallback(async () => {
    try {
      // ✅ Cambia inmediatamente el botón
      setDownloadLoading(true);
      setDownloadError(null);
      setProgress(5);
      setStatus("Procesando...");

      const rows = getRows();
      if (!rows.length) {
        setDownloadError("No hay pagos en el período/agente seleccionado.");
        setDownloadLoading(false);
        setProgress(0);
        setStatus("");
        return;
      }

      setProgress(15);
      setStatus("Inicializando PDF...");

      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;

      pdf.setTextColor(...C.text);
      pdf.setFontSize(12);
      const headerText = `${agentName} | Período: ${periodStart} a ${periodEnd}`;
      pdf.text(headerText, pageW / 2, 10, { align: "center" });

      const top = 20;
      const colGap = 10;
      const rowGap = 16;
      const colW = (pageW - margin * 2 - colGap) / 2;
      const rowH = (pageH - top - margin - rowGap) / 2;

      setStatus("Dibujando tarjetas...");
      const base = 20;
      const end = 95;
      for (let idx = 0; idx < rows.length; idx++) {
        if (idx > 0 && idx % 4 === 0) {
          pdf.addPage();
          pdf.text(headerText, pageW / 2, 10, { align: "center" });
        }
        const local = idx % 4;
        const col = local % 2;
        const r = Math.floor(local / 2);
        const x = margin + col * (colW + colGap);
        const y = top + r * (rowH + rowGap);
        drawCard(pdf, x, y, colW, rowH, rows[idx]);

        const p = base + Math.floor(((idx + 1) / rows.length) * (end - base));
        setProgress(p);
        await sleep(0);
      }

      setStatus("Guardando archivo…");
      setProgress(98);
      const fileName = `recibos_cards_${agentId || "agente"}_${periodStart}_${periodEnd}.pdf`;
      pdf.save(fileName);

      setProgress(100);
      setStatus("Listo ✅");
    } catch (e) {
      console.error(e);
      setDownloadError("Error al generar el PDF.");
    } finally {
      // dejar unos segundos el estado "Listo"
      setTimeout(() => {
        setDownloadLoading(false);
        setStatus("");
        setProgress(0);
      }, 2000);
    }
  }, [getRows, agentName, periodStart, periodEnd, agentId, logoBase64]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-800">Descargar PDF</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <FaTimes size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex gap-4">
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

          <button
            onClick={handleDownload}
            disabled={downloadLoading}
            className={`w-full text-white py-2 px-4 rounded ${downloadLoading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {downloadLoading ? "Procesando..." : "Descargar PDF "}
          </button>

          {(downloadLoading || progress > 0) && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded">
                <div
                  className="bg-blue-600 text-xs leading-none py-1 text-center text-white rounded transition-all"
                  style={{ width: `${progress}%` }}
                >
                  {progress}%
                </div>
              </div>
              {status && <p className="text-sm text-gray-600">{status}</p>}
              {downloadError && <p className="text-red-500">{downloadError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

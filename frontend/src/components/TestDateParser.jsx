import React, { useEffect } from "react";

// == Imports de dayjs / plugins
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import "dayjs/locale/es";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

dayjs.locale("es");
// Forzar una zona, p. ej. "America/Mexico_City"
dayjs.tz.setDefault("America/Mexico_City");

function TestDateParser() {

  useEffect(() => {
    // 1) Fecha de prueba
    const testDateStr = "28 de enero de 2025, 9:18:01 p. m. UTC-6";
    
    // 2) Reemplazo p. m. => PM
    let replaced = testDateStr
      .replace("p. m.", "PM")
      .replace("a. m.", "AM");
    
    console.log("Cadena final (después de reemplazo):", replaced);

    // 3) Parse con dayjs.tz y el formato "D [de] MMMM [de] YYYY, h:mm:ss A [UTC]Z"
    const parsed = dayjs.tz(
      replaced,
      "D [de] MMMM [de] YYYY, h:mm:ss A [UTC]Z",
      "America/Mexico_City"
    );
    
    // 4) Mostramos resultados
    if (parsed.isValid()) {
      console.log("Dayjs => toString():", parsed.toString());    // 28/Ene 21:18 ...
      console.log("Dayjs => toDate():", parsed.toDate());        // objeto Date nativo
    } else {
      console.warn("No se pudo parsear la fecha:", testDateStr);
    }

  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Test Date Parser</h1>
      <p>Revisa la consola para ver resultados.</p>
    </div>
  );
}

export default TestDateParser;

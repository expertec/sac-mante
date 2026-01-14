import { useState, useEffect } from "react";

const PING_URL = "https://TUDOMINIO.COM/api/ping"; // Usa tu endpoint real aquí

function useOnlineStatus(pingUrl = PING_URL, interval = 8000) {
  const [online, setOnline] = useState(window.navigator.onLine);

  useEffect(() => {
    let timer;

    const checkConnection = () => {
      fetch(pingUrl, { method: 'GET', cache: 'no-store' })
        .then(res => setOnline(res.ok))
        .catch(() => setOnline(false));
    };

    // Revisa inmediatamente y cada X segundos
    checkConnection();
    timer = setInterval(checkConnection, interval);

    // Si el navegador detecta cambios rápidos
    const onStatusChange = () => checkConnection();
    window.addEventListener("online", onStatusChange);
    window.addEventListener("offline", onStatusChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onStatusChange);
      window.removeEventListener("offline", onStatusChange);
    };
  }, [pingUrl, interval]);

  return online;
}

export default useOnlineStatus;

import React, { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

const AdminDashboard = () => {
  const [businessInfo, setBusinessInfo] = useState(null);
  const [agents, setAgents] = useState([]);
  const [newAgent, setNewAgent] = useState({ name: "", email: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Suscripción a los datos de la empresa
    const businessDocRef = doc(db, "companies", "yourCompanyId"); // Reemplaza 'yourCompanyId' con el ID de la empresa
    const unsubscribeBusiness = onSnapshot(businessDocRef, (doc) => {
      if (doc.exists()) {
        setBusinessInfo(doc.data());
      }
    });

    // Suscripción a la lista de agentes
    const agentsCollectionRef = collection(db, "companies/yourCompanyId/agents"); // Reemplaza 'yourCompanyId'
    const unsubscribeAgents = onSnapshot(agentsCollectionRef, (snapshot) => {
      const agentsList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAgents(agentsList);
    });

    // Limpieza de las suscripciones
    return () => {
      unsubscribeBusiness();
      unsubscribeAgents();
    };
  }, []);

  const handleAddAgent = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Verificar campos vacíos
      if (!newAgent.name || !newAgent.email) {
        setError("Por favor completa todos los campos.");
        return;
      }

      // Llamada al backend para agregar un agente
      const response = await fetch("/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newAgent.name,
          email: newAgent.email,
        }),
      });

      if (!response.ok) {
        const responseData = await response.json();
        setError(responseData.message || "Error al agregar el agente.");
        return;
      }

      // Limpiar formulario
      setNewAgent({ name: "", email: "" });
    } catch (err) {
      console.error("Error al agregar el agente:", err);
      setError("Error inesperado al agregar el agente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
        
    hola mundo
    </div>
  );
};

export default AdminDashboard;

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import MainLayout from "./components/MainLayout";
import AdminHome from "./pages/AdminHome";
import AgentDashboard from "./pages/AgentDashboard";
import BusinessesPage from "./pages/BusinessesPage";
import UsersPage from "./pages/UsersPage"; // Importación del UsersPage
import SingleBusinessPage from "./pages/SingleBusinessPage";
import PaymentReceipt from "./components/PaymentReceipt";
import SettingsPage from "./pages/SettingsPage";



const ProtectedRoute = ({ children, role }) => {
  const { user, role: userRole } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (role && userRole !== role) {
    return <Navigate to={`/${userRole}`} />;
  }

  return children;
};

const App = () => {
  return (
    <Router>
      <Routes>
        {/* Ruta de inicio de sesión */}
        <Route path="/login" element={<LoginPage />} />

        {/* Ruta de registro */}
        <Route path="/mb87fsBHYNMsm8r4pCd6mrcw" element={<RegisterPage />} />

        {/* Rutas protegidas con el MainLayout */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Ruta del Dashboard */}
          <Route index element={<AdminHome />} />
          {/* Ruta para Negocios */}
          <Route path="negocios" element={<BusinessesPage />} />
          {/* Ruta para Usuarios */}
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
        </Route>

        {/* Ruta protegida para agentes */}
        <Route
          path="/cobrador"
          element={
            <ProtectedRoute role="Cobrador">
              <AgentDashboard />
            </ProtectedRoute>
            
          }
          
        />
<Route path="/negocio/:businessId" element={<SingleBusinessPage />} />
<Route path="/recibo" element={<PaymentReceipt />} />



        {/* Redirección desde la raíz */}
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;

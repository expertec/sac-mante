import { Link, Outlet, useNavigate } from "react-router-dom";
import { FaHome, FaSignOutAlt, FaBriefcase, FaUsers, FaUserFriends, FaCog } from "react-icons/fa"; // Se agregó FaUserFriends
import { getAuth, signOut } from "firebase/auth";
import logo from "../assets/logo.png"; // Importa el logo

const MainLayout = () => {
  const navigate = useNavigate();
  const auth = getAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/"); // Redirige al login después del cierre de sesión
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <nav
        className="w-20 lg:w-24 p-4 flex flex-col items-center fixed left-0 top-0 h-screen shadow-lg"
        style={{ background: "linear-gradient(to top, #701730, white)" }}
      >
        {/* Logo */}
        <div className="mb-8">
          <Link to="/admin">
            <img src={logo} alt="Logo" className="w-12 h-12 object-contain" />
          </Link>
        </div>

        {/* Navigation Links */}
        <ul className="space-y-4 text-sm text-[#083416]">
          <li className="flex flex-col items-center group">
            <Link
              to="/admin"
              className="flex flex-col items-center p-3 hover:bg-[#083416]/10 rounded-md transition-all"
              title="Dashboard"
            >
              <FaHome className="text-2xl" />
              <span className="mt-1 text-xs">Dashboard</span>
            </Link>
          </li>
          {/* Opción de menú: Negocios */}
          <li className="flex flex-col items-center group">
            <Link
              to="negocios"
              className="flex flex-col items-center p-3 hover:bg-[#083416]/10 rounded-md transition-all"
              title="Negocios"
            >
              <FaBriefcase className="text-2xl" />
              <span className="mt-1 text-xs">Negocios</span>
            </Link>
          </li>
          {/* Nueva opción de menú: Agentes y Grupos */}
          <li className="flex flex-col items-center group">
            <Link
              to="agentes-grupos"
              className="flex flex-col items-center p-3 hover:bg-[#083416]/10 rounded-md transition-all"
              title="Agentes y Grupos"
            >
              <FaUserFriends className="text-2xl" />
              <span className="mt-1 text-xs">Agentes y Grupos</span>
            </Link>
          </li>
          {/* Opción de menú: Usuarios */}
          <li className="flex flex-col items-center group">
            <Link
              to="usuarios"
              className="flex flex-col items-center p-3 hover:bg-[#083416]/10 rounded-md transition-all"
              title="Usuarios"
            >
              <FaUsers className="text-2xl" />
              <span className="mt-1 text-xs">Usuarios</span>
            </Link>
          </li>
          {/* Opción de menú: Ajustes */}
          <li className="flex flex-col items-center group">
            <Link
              to="ajustes"
              className="flex flex-col items-center p-3 hover:bg-[#083416]/10 rounded-md transition-all"
              title="Ajustes"
            >
              <FaCog className="text-2xl" />
              <span className="mt-1 text-xs">Ajustes</span>
            </Link>
          </li>
        </ul>

        {/* Botón de logout */}
        <div className="mt-auto mb-4">
          <button
            onClick={handleLogout}
            className="px-5 py-3 bg-primary text-white rounded-lg shadow hover:bg-secondary transition duration-300"
            title="Salir"
          >
            <FaSignOutAlt className="text-2xl" />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-20 lg:ml-24">
        <main className="p-8 flex-grow bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;

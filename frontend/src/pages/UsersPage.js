import React, { useState } from "react";
import { getApps, initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, firebaseConfig } from "../config/firebase"; // Asegúrate de tener exportados auth, db y firebaseConfig

const UsersPage = () => {
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "Cobrador",
  });
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState(""); // "success" o "error"

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const { name, email, password, role } = newUser;
    if (!name || !email || !password || !role) {
      setAlertType("error");
      setAlertMessage("Por favor, completa todos los campos.");
      return;
    }
    setLoading(true);
    setAlertMessage("");

    try {
      // Crear una instancia secundaria para la autenticación
      let secondaryApp;
      const apps = getApps();
      const secondaryAppName = "Secondary";
      if (apps.find(app => app.name === secondaryAppName)) {
        secondaryApp = apps.find(app => app.name === secondaryAppName);
      } else {
        secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      }

      const secondaryAuth = getAuth(secondaryApp);

      // Crear el usuario con la instancia secundaria
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

      // Actualizar el perfil del usuario en la instancia secundaria
      await updateProfile(userCredential.user, { displayName: name });

      // Ahora, usar la instancia principal de Firestore (importada como "db") para crear el documento
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        email,
        role,
        createdAt: serverTimestamp(),
      });

      // Cerrar sesión en la instancia secundaria y eliminar la instancia secundaria
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      setAlertType("success");
      setAlertMessage("Usuario registrado correctamente.");
      // Limpiar el formulario
      setNewUser({ name: "", email: "", password: "", role: "Cobrador" });
    } catch (error) {
      console.error("Error al registrar usuario:", error);
      setAlertType("error");
      setAlertMessage("Hubo un error al registrar el usuario.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Usuarios</h1>

      {/* Alerta personalizada */}
      {alertMessage && (
        <div
          className={`mb-4 p-3 rounded text-center ${
            alertType === "success"
              ? "bg-green-100 border border-green-400 text-green-700"
              : "bg-red-100 border border-red-400 text-red-700"
          }`}
        >
          {alertMessage}
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nombre</label>
          <input
            type="text"
            name="name"
            value={newUser.name}
            onChange={handleChange}
            className="w-full border border-gray-300 p-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={newUser.email}
            onChange={handleChange}
            className="w-full border border-gray-300 p-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contraseña</label>
          <input
            type="password"
            name="password"
            value={newUser.password}
            onChange={handleChange}
            className="w-full border border-gray-300 p-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Rol</label>
          <select
            name="role"
            value={newUser.role}
            onChange={handleChange}
            className="w-full border border-gray-300 p-2 rounded"
            required
          >
            <option value="Admin">Admin</option>
            <option value="Cobrador">Cobrador</option>
            <option value="Registrador">Registrador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className={`px-4 py-2 rounded ${
            loading ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
          } text-white`}
        >
          {loading ? "Registrando..." : "Registrar Usuario"}
        </button>
      </form>
    </div>
  );
};

export default UsersPage;

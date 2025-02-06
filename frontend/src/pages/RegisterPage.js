import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../config/firebase"; // Asegúrate de tener configurado y exportado 'db' (Firestore)
import { doc, setDoc, serverTimestamp } from "firebase/firestore"; // Importa las funciones necesarias de Firestore
import logo from "../assets/logo.png";

const RegisterPage = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { name, email, password } = form;

    if (!name || !email || !password) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Crear usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Actualizar el perfil del usuario con el nombre
      await updateProfile(userCredential.user, { displayName: name });

      // Crear el documento en la colección "users" con la estructura requerida
      await setDoc(doc(db, "users", userCredential.user.uid), {
        createdAt: serverTimestamp(), // Usa serverTimestamp para que Firestore asigne la hora del servidor
        email: email,
        name: name,
        role: "admin", // Asigna el rol que necesites
      });

      console.log("Usuario registrado, documento creado y autenticado");
      navigate("/dashboard");
    } catch (err) {
      console.error("Error al registrar:", err);
      setError("Hubo un error al registrar. Por favor, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-white to-primary items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Logo" className="w-24 h-24" />
        </div>

        <h1 className="text-2xl font-bold text-center text-primary">Registro de Cuenta</h1>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary">Nombre</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Ingresa tu nombre"
                required
                className="appearance-none rounded-lg border border-gray-300 p-2 w-full focus:outline-none focus:ring-secondary focus:border-secondary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Ingresa tu email"
                required
                className="appearance-none rounded-lg border border-gray-300 p-2 w-full focus:outline-none focus:ring-secondary focus:border-secondary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary">Contraseña</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Ingresa tu contraseña"
                required
                className="appearance-none rounded-lg border border-gray-300 p-2 w-full focus:outline-none focus:ring-secondary focus:border-secondary"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-white text-sm font-medium ${
              loading ? "bg-secondary cursor-not-allowed" : "bg-primary hover:bg-secondary"
            } focus:outline-none`}
          >
            {loading ? "Registrando..." : "Registrarse"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          ¿Ya tienes una cuenta?{" "}
          <a href="/login" className="text-primary hover:text-secondary font-semibold">
            Inicia sesión
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;

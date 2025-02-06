import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
     
  apiKey: "AIzaSyC1j0qVXMC4xnRP4moBJW4BffPuf6_IgqY",
  authDomain: "cobrosapp-16297.firebaseapp.com",
  projectId: "cobrosapp-16297",
  storageBucket: "cobrosapp-16297.firebasestorage.app",
  messagingSenderId: "685798415444",
  appId: "1:685798415444:web:0cb18f20bbea927d5ee1c1",
  measurementId: "G-7SEEC0Y72V"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Solo una instancia de Firestore
export { auth, db, firebaseConfig }; // No es necesario exportar `firestore` con otro nombre

   
   
   


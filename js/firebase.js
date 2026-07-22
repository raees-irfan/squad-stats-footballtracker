import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* Your Firebase project's web config (Project settings > your app).
   This is not a secret - it identifies the project, not a credential.
   Real access control is enforced by firestore.rules. */
const firebaseConfig = {
  apiKey: "AIzaSyAyhzLOKkX2ZZJQbLdcNr4Y8xTf15My6EI",
  authDomain: "matchday-bbdf3.firebaseapp.com",
  projectId: "matchday-bbdf3",
  storageBucket: "matchday-bbdf3.firebasestorage.app",
  messagingSenderId: "833275024370",
  appId: "1:833275024370:web:c7a1216ecfeb2d8889916b"
};
const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc
};

export const playersCol = collection(db, 'players');
export const matchesCol = collection(db, 'matches');
export const usersCol = collection(db, 'users');
export const feedbackCol = collection(db, 'feedback');
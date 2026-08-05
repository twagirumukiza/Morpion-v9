// =====================================================
// firebase.js — Firebase Initialisation
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBG6oid29bMq8GVvBkNvPtSDZTRO5K09uk",
    authDomain: "focus-game-1c7ee.firebaseapp.com",
    databaseURL: "https://focus-game-1c7ee-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "focus-game-1c7ee",
    storageBucket: "focus-game-1c7ee.firebasestorage.app",
    messagingSenderId: "856695121197",
    appId: "1:856695121197:web:cfc0d876ba9d1885499fa4"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export let currentUid = null;

export async function firebaseLogin() {
    try {
        const cred = await signInAnonymously(auth);
        currentUid = cred.user.uid;
        return cred.user;
    } catch (e) {
        console.error("Connexion Firebase impossible", e);
        alert("Impossible de se connecter à Firebase.");
        throw e;
    }
}

onAuthStateChanged(auth, user => {
    if (user) {
        currentUid = user.uid;
        console.log("UID :", currentUid);
    }
});
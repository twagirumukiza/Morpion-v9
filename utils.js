// =====================================================
// utils.js
// Morpion V2.0
// =====================================================

// -----------------------------------------------------
// Nettoyage des données avant envoi à Firebase
// -----------------------------------------------------

export function sanitizeFirebaseData(value) {

    if (value === undefined)
        return null;

    if (value === null)
        return null;

    if (Array.isArray(value)) {

        return value.map(v => sanitizeFirebaseData(v));

    }

    if (typeof value === "object") {

        const out = {};

        for (const key in value) {

            out[key] = sanitizeFirebaseData(value[key]);

        }

        return out;

    }

    return value;

}

// -----------------------------------------------------
// Génération d'un code de salon
// -----------------------------------------------------

export function generateRoomCode(length = 6) {

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < length; i++) {

        code += chars[Math.floor(Math.random() * chars.length)];

    }

    return code;

}

// -----------------------------------------------------
// Création d'un lien d'invitation
// -----------------------------------------------------

export function roomLink(code) {

    return `${location.origin}${location.pathname}?room=${code}`;

}

// -----------------------------------------------------
// Lecture du code présent dans l'URL
// -----------------------------------------------------

export function getRoomCodeFromURL() {

    const params = new URLSearchParams(location.search);

    return params.get("room");

}

// -----------------------------------------------------
// Copier dans le presse-papiers
// -----------------------------------------------------

export async function copy(text) {

    try {

        await navigator.clipboard.writeText(text);

        return true;

    } catch {

        return false;

    }

}

// -----------------------------------------------------
// Timestamp
// -----------------------------------------------------

export function now() {

    return Date.now();

}

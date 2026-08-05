// =====================================================
// rooms.js — Gestion des salons Firebase V3
// =====================================================

import { db, auth } from "./firebase.js";
import { sanitizeFirebaseData, generateRoomCode, now } from "./utils.js";
import { ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const MAX_PIONS = { 3: 3, 5: 12, 7: 24 };

export async function createRoom(boardSize = 3, playerName = "Joueur 1") {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Utilisateur non authentifié.");

    let code;
    do { code = generateRoomCode(); } while (await roomExists(code));

    const totalCells = boardSize * boardSize;
    const maxP = MAX_PIONS[boardSize] || Math.floor(totalCells / 2);

    const room = {
        code,
        boardSize,
        status: "waiting",
        createdAt: now(),
        hostUid: uid,
        guestUid: null,
        turn: "X",
        winner: null,
        board: Array(totalCells).fill(""),
        pions: { X: maxP, O: maxP },
        players: {
            X: { uid, name: playerName },
            O: null
        }
    };

    await set(ref(db, "rooms/" + code), sanitizeFirebaseData(room));
    return code;
}

export async function joinRoom(code, playerName = "Joueur 2") {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Utilisateur non authentifié.");

    const roomRef = ref(db, "rooms/" + code);
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error("Salon introuvable.");
    const room = snap.val();
    if (room.guestUid) throw new Error("Salon déjà complet.");

    await update(roomRef, sanitizeFirebaseData({
        guestUid: uid,
        status: "playing",
        "players/O": { uid, name: playerName }
    }));
    return room;
}

export async function leaveRoom(code) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const roomRef = ref(db, "rooms/" + code);
    const snap = await get(roomRef);
    if (!snap.exists()) return;
    const room = snap.val();

    if (room.hostUid === uid) { await remove(roomRef); return; }
    if (room.guestUid === uid) {
        await update(roomRef, sanitizeFirebaseData({
            guestUid: null, status: "waiting", "players/O": null
        }));
    }
}

export async function roomExists(code) {
    return (await get(ref(db, "rooms/" + code))).exists();
}

export async function getRoom(code) {
    const snap = await get(ref(db, "rooms/" + code));
    return snap.exists() ? snap.val() : null;
}

export async function patchRoom(code, data) {
    await update(ref(db, "rooms/" + code), sanitizeFirebaseData(data));
}

export async function writeRoom(code, room) {
    await set(ref(db, "rooms/" + code), sanitizeFirebaseData(room));
}

export async function deleteRoom(code) {
    await remove(ref(db, "rooms/" + code));
}
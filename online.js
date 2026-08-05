// =====================================================
// online.js — Logique multijoueur V3
// =====================================================

import { db, auth } from "./firebase.js";
import { patchRoom, getRoom } from "./rooms.js";
import { ref, onValue, off, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

let roomCode = null;
let roomListener = null;
let boardCallback = null;
let statusCallback = null;

export function setBoardCallback(cb) { boardCallback = cb; }
export function setStatusCallback(cb) { statusCallback = cb; }

export function connectRoom(code) {
    roomCode = code;
    const roomRef = ref(db, "rooms/" + code);
    roomListener = onValue(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            if (statusCallback) statusCallback("Salon supprimé.");
            return;
        }
        const room = snapshot.val();
        const size = room.boardSize || 3;
        const total = size * size;
        if (room.board && !Array.isArray(room.board)) {
            room.board = Array.from({length: total}, (_, i) => room.board[i] || "");
        }
        if (boardCallback) boardCallback(room);
        if (statusCallback) {
            switch(room.status) {
                case "waiting": statusCallback("En attente d'un adversaire..."); break;
                case "playing": statusCallback("Partie en cours"); break;
                case "finished": statusCallback("Partie terminée"); break;
                default: statusCallback(room.status);
            }
        }
    });
}

export function disconnectRoom() {
    if (!roomCode) return;
    off(ref(db, "rooms/" + roomCode));
    roomCode = null;
}

export async function playMove(code, move) {
    if (!code) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await runTransaction(ref(db, "rooms/" + code), (room) => {
        if (!room || room.status !== "playing") return room;
        const mySymbol = room.hostUid === uid ? "X" : "O";
        if (room.turn !== mySymbol) return room;
        if (!room.board) room.board = {};
        if (!room.pions) room.pions = { X: 3, O: 3 };

        if (move.type === 'place') {
            if (room.pions[mySymbol] <= 0) return room;
            if (room.board[move.to]) return room;
            room.board[move.to] = mySymbol;
            room.pions[mySymbol] = (room.pions[mySymbol] || 0) - 1;
        }

        room.turn = mySymbol === "X" ? "O" : "X";
        return room;
    });
}

export async function declareWinner(symbol) {
    if (!roomCode) return;
    await patchRoom(roomCode, { winner: symbol, status: "finished" });
}

export async function declareDraw() {
    if (!roomCode) return;
    await patchRoom(roomCode, { winner: "draw", status: "finished" });
}

export async function restartGame() {
    if (!roomCode) return;
    const room = await getRoom(roomCode);
    if (!room) return;
    const size = room.boardSize || 3;
    const maxP = size === 3 ? 3 : (size === 5 ? 12 : 24);
    await patchRoom(roomCode, {
        winner: null,
        status: "playing",
        turn: "X",
        board: Array(size * size).fill(""),
        pions: { X: maxP, O: maxP }
    });
}

export async function getCurrentRoom() {
    if (!roomCode) return null;
    return await getRoom(roomCode);
}
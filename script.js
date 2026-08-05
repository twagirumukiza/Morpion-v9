// =====================================================
// MORPION NÉON V3.0 — Script Principal Unifié
// by Twagirumukiza
// Plateaux : 3×3 (3 pions), 4×4 (8 pions), 6×6 (18 pions)
// Règle : aligner 3 pions = victoire
// =====================================================

import { firebaseLogin, auth } from "./firebase.js";
import { createRoom, joinRoom, leaveRoom } from "./rooms.js";
import { connectRoom, disconnectRoom, playMove, restartGame, declareWinner, declareDraw, setBoardCallback, setStatusCallback } from "./online.js";
import { roomLink, copy, getRoomCodeFromURL } from "./utils.js";

document.addEventListener('DOMContentLoaded', () => {

    firebaseLogin();

    // --- CONFIG ---
    const MAX_PIONS = { 3: 3, 5: 12, 7: 24 };
    let boardSize = 3;
    let board = [];
    let pions = { X: 3, O: 3 };

    let currentRoomCode = null;
    let gameMode = 'ai';
    let aiDifficulty = 'unbeatable';
    let playerSymbol = 'X';
    let aiSymbol = 'O';
    let soundEnabled = true;
    let scores = { X: 0, O: 0, draws: 0, total: 0 };

    let localCurrentPlayer = 'X';
    let localGameActive = false;
    let moveHistory = [];

    // --- DOM ---
    const screens = {
        menu: document.getElementById('menu-screen'),
        aiConfig: document.getElementById('ai-config-screen'),
        online: document.getElementById('online-screen'),
        lobby: document.getElementById('lobby-screen'),
        join: document.getElementById('join-screen'),
        game: document.getElementById('game-screen')
    };

    const boardEl = document.getElementById('board');
    const turnIndicator = document.getElementById('turn-indicator');
    const badgeX = document.getElementById('badge-x');
    const badgeO = document.getElementById('badge-o');
    const pionsXEl = document.getElementById('pions-x');
    const pionsOEl = document.getElementById('pions-o');

    const statsModal = document.getElementById('stats-modal');
    const gameoverModal = document.getElementById('gameover-modal');
    const gameoverTitle = document.getElementById('gameover-title');
    const gameoverSubtitle = document.getElementById('gameover-subtitle');

    // --- AUDIO ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    async function playSound(type) {
        if (!soundEnabled) return;
        if (audioCtx.state === 'suspended') {
            try { await audioCtx.resume(); } catch(e) { return; }
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (type === 'move') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'win') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.15);
            osc.frequency.setValueAtTime(783.99, now + 0.3);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            osc.start(now); osc.stop(now + 0.6);
        } else if (type === 'draw') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(150, now + 0.3);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);

    }

    // --- NAVIGATION ---
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.getAttribute('data-mode');
            gameMode = mode;
            if (mode === 'ai') showScreen('aiConfig');
            else if (mode === 'local') startLocalGame();
            else if (mode === 'online') showScreen('online');
        });
    });

    document.getElementById('back-to-menu-ai').addEventListener('click', () => showScreen('menu'));
    document.getElementById('back-to-menu-online').addEventListener('click', () => showScreen('menu'));
    document.getElementById('back-to-menu-join').addEventListener('click', () => showScreen('menu'));

    document.getElementById('btn-quit').addEventListener('click', () => {
        if (gameMode === 'online' && currentRoomCode) {
            disconnectRoom();
            leaveRoom(currentRoomCode);
            currentRoomCode = null;
        }
        localGameActive = false;
        showScreen('menu');
    });

    // Config IA
    document.querySelectorAll('.symbol-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.symbol-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            playerSymbol = e.currentTarget.getAttribute('data-symbol');
            aiSymbol = playerSymbol === 'X' ? 'O' : 'X';
        });
    });

    document.getElementById('start-ai-game').addEventListener('click', () => {
        boardSize = parseInt(document.getElementById('board-size').value);
        aiDifficulty = document.getElementById('ai-difficulty').value;
        startLocalGame();
    });

    // --- GRILLE DYNAMIQUE ---
    function initBoard(size) {
        boardSize = size;
        board = Array(size * size).fill('');
        pions = { X: MAX_PIONS[size], O: MAX_PIONS[size] };
        boardEl.className = 'board size-' + size;
        boardEl.innerHTML = '';
        for (let i = 0; i < size * size; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.setAttribute('data-index', i);
            cell.addEventListener('click', () => onCellClick(i));
            boardEl.appendChild(cell);
        }
    }

    function getCells() {
        return document.querySelectorAll('.cell');
    }

    function renderBoard(state) {
        const cells = getCells();
        cells.forEach((cell, i) => {
            const val = state[i] || '';
            cell.textContent = val;
            cell.className = 'cell';
            if (val === 'X') cell.classList.add('x');
            if (val === 'O') cell.classList.add('o');

        });
    }

    function updateBadges(turn) {
        if (turn === 'X') { badgeX.classList.add('active'); badgeO.classList.remove('active'); }
        else { badgeO.classList.add('active'); badgeX.classList.remove('active'); }
    }

    function updatePionsDisplay() {
        pionsXEl.textContent = '(' + pions.X + ')';
        pionsOEl.textContent = '(' + pions.O + ')';
    }

    // --- CONDITIONS DE VICTOIRE DYNAMIQUES ---
    function generateWinConditions(size, align) {
        const conds = [];
        // Horizontales
        for (let r = 0; r < size; r++) {
            for (let c = 0; c <= size - align; c++) {
                const line = [];
                for (let k = 0; k < align; k++) line.push(r*size + c + k);
                conds.push(line);
            }
        }
        // Verticales
        for (let c = 0; c < size; c++) {
            for (let r = 0; r <= size - align; r++) {
                const line = [];
                for (let k = 0; k < align; k++) line.push((r+k)*size + c);
                conds.push(line);
            }
        }
        // Diagonales ↘
        for (let r = 0; r <= size - align; r++) {
            for (let c = 0; c <= size - align; c++) {
                const line = [];
                for (let k = 0; k < align; k++) line.push((r+k)*size + c + k);
                conds.push(line);
            }
        }
        // Diagonales ↙
        for (let r = 0; r <= size - align; r++) {
            for (let c = align - 1; c < size; c++) {
                const line = [];
                for (let k = 0; k < align; k++) line.push((r+k)*size + c - k);
                conds.push(line);
            }
        }
        return conds;
    }

    function getAlign(size) {
        return size === 3 ? 3 : (size === 5 ? 4 : 5);
    }

    function checkWin(b, size) {
        const align = getAlign(size);
        const conds = generateWinConditions(size, align);
        for (let cond of conds) {
            const first = b[cond[0]];
            if (!first) continue;
            let win = true;
            for (let i = 1; i < cond.length; i++) {
                if (b[cond[i]] !== first) { win = false; break; }
            }
            if (win) return first;
        }
        return null;
    }

    function isBoardFull(b) {
        return b.every(c => c !== '');
    }

    // --- MOTEUR LOCAL / IA ---
    function startLocalGame() {
        initBoard(boardSize);
        localGameActive = true;
        localCurrentPlayer = 'X';
        moveHistory = [];
        renderBoard(board);
        updateBadges(localCurrentPlayer);
        updatePionsDisplay();
        updateTurnText();
        showScreen('game');
        if (gameMode === 'ai' && aiSymbol === 'X') setTimeout(makeAIMove, 500);
    }

    function updateTurnText() {
        const p = pions[localCurrentPlayer];
        turnIndicator.textContent = `Tour de ${localCurrentPlayer} — ${p} pion${p > 1 ? 's' : ''} restant${p > 1 ? 's' : ''}`;
    }

    function onCellClick(index) {
        if (gameMode === 'online') {
            handleOnlineClick(index);
            return;
        }
        if (!localGameActive) return;
        if (gameMode === 'ai' && localCurrentPlayer === aiSymbol) return;

        if (board[index] !== '') return;
        if (pions[localCurrentPlayer] <= 0) return;

        executeLocalMove({ to: index });
        if (localGameActive && gameMode === 'ai' && localCurrentPlayer === aiSymbol) {
            setTimeout(makeAIMove, 600);
        }
    }

    function executeLocalMove(move) {
        const player = localCurrentPlayer;
        board[move.to] = player;
        pions[player]--;
        moveHistory.push({ to: move.to, player, pionsBefore: { ...pions } });
        renderBoard(board);
        playSound('move');
        updatePionsDisplay();

        const winRes = checkWin(board, boardSize);
        if (winRes) {
            endLocalGame(winRes);
        } else if (pions.X === 0 && pions.O === 0) {
            // Tous les pions posés sans victoire = match nul
            endLocalGame('draw');
        } else {
            localCurrentPlayer = localCurrentPlayer === 'X' ? 'O' : 'X';
            updateBadges(localCurrentPlayer);
            updateTurnText();
        }
    }

    function endLocalGame(result) {
        localGameActive = false;
        scores.total++;
        if (result === 'draw') {
            playSound('draw');
            gameoverTitle.textContent = "Match Nul !";
            gameoverSubtitle.textContent = "Égalité parfaite.";
            scores.draws++;
        } else {
            playSound('win');
            gameoverTitle.textContent = `Victoire de ${result} !`;
            gameoverSubtitle.textContent = "Superbe partie !";
            if (result === 'X') scores.X++; else scores.O++;
        }
        saveStats();
        setTimeout(() => gameoverModal.classList.add('active'), 400);
    }

    // --- IA ---
    function makeAIMove() {
        if (!localGameActive) return;
        const move = findAIMove();
        if (move) executeLocalMove(move);
    }

    function findAIMove() {
        if (aiDifficulty === 'easy') return getRandomMove();
        if (aiDifficulty === 'medium') return getMediumMove();
        return getBestMove();
    }

    function getAllMoves(b, sym, pionsRestants) {
        const moves = [];
        const size = boardSize;
        if (pionsRestants > 0) {
            for (let i = 0; i < b.length; i++) {
                if (b[i] === '') moves.push({ type: 'place', to: i });
            }
        } else {
            for (let i = 0; i < b.length; i++) {
                if (b[i] === sym) {
                    for (let j = 0; j < b.length; j++) {
                        if (b[j] === '' && i !== j) moves.push({ type: 'move', from: i, to: j });
                    }
                }
            }
        }
        return moves;
    }

    function getRandomMove() {
        const moves = getAllMoves(board, aiSymbol, pions[aiSymbol]);
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }

    function getMediumMove() {
        const moves = getAllMoves(board, aiSymbol, pions[aiSymbol]);
        // Gagner si possible
        for (let m of moves) {
            const test = simulateMove(board, m, aiSymbol);
            if (checkWin(test, boardSize) === aiSymbol) return m;
        }
        // Bloquer si possible
        const opp = playerSymbol;
        const oppPions = pions[opp];
        const oppMoves = getAllMoves(board, opp, oppPions);
        for (let om of oppMoves) {
            const test = simulateMove(board, om, opp);
            if (checkWin(test, boardSize) === opp) {
                // Trouver un coup qui bloque indirectement ou jouer au hasard
                for (let m of moves) {
                    const after = simulateMove(board, m, aiSymbol);
                    const afterOpp = getAllMoves(after, opp, oppPions);
                    let blocked = true;
                    for (let aom of afterOpp) {
                        const t2 = simulateMove(after, aom, opp);
                        if (checkWin(t2, boardSize) === opp) { blocked = false; break; }
                    }
                    if (blocked) return m;
                }
            }
        }
        return moves[Math.floor(Math.random() * moves.length)];
    }

    function simulateMove(b, move, sym) {
        const nb = [...b];
        if (move.type === 'place') nb[move.to] = sym;
        else { nb[move.from] = ''; nb[move.to] = sym; }
        return nb;
    }

    function getBestMove() {
        const moves = getAllMoves(board, aiSymbol, pions[aiSymbol]);
        if (moves.length === 0) return null;

        // Pour 3x3 : minimax complet
        // Pour 4x4 : profondeur 5
        // Pour 6x6 : profondeur 3
        const maxDepth = boardSize === 3 ? 12 : (boardSize === 5 ? 4 : 2);

        let bestScore = -Infinity;
        let bestMove = moves[0];

        for (let m of moves) {
            const nb = simulateMove(board, m, aiSymbol);
            const np = { ...pions, [aiSymbol]: pions[aiSymbol] - (m.type === 'place' ? 1 : 0) };
            const score = minimax(nb, np, 0, false, -Infinity, Infinity, maxDepth);
            if (score > bestScore) {
                bestScore = score;
                bestMove = m;
            }
        }
        return bestMove;
    }

    function minimax(b, pionsState, depth, isMax, alpha, beta, maxDepth) {
        const winner = checkWin(b, boardSize);
        if (winner === aiSymbol) return 1000 - depth;
        if (winner === playerSymbol) return depth - 1000;
        if (isBoardFull(b)) return 0;
        if (depth >= maxDepth) return evaluateBoard(b);

        const sym = isMax ? aiSymbol : playerSymbol;
        const moves = getAllMoves(b, sym, pionsState[sym]);
        if (moves.length === 0) return 0;

        if (isMax) {
            let maxScore = -Infinity;
            for (let m of moves) {
                const nb = simulateMove(b, m, sym);
                const np = { ...pionsState, [sym]: pionsState[sym] - (m.type === 'place' ? 1 : 0) };
                const score = minimax(nb, np, depth + 1, false, alpha, beta, maxDepth);
                maxScore = Math.max(score, maxScore);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (let m of moves) {
                const nb = simulateMove(b, m, sym);
                const np = { ...pionsState, [sym]: pionsState[sym] - (m.type === 'place' ? 1 : 0) };
                const score = minimax(nb, np, depth + 1, true, alpha, beta, maxDepth);
                minScore = Math.min(score, minScore);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    function evaluateBoard(b) {
        let score = 0;
        const align = getAlign(boardSize);
        const conds = generateWinConditions(boardSize, align);
        for (let cond of conds) {
            const vals = cond.map(i => b[i]);
            const aiCount = vals.filter(v => v === aiSymbol).length;
            const plCount = vals.filter(v => v === playerSymbol).length;
            const emptyCount = vals.filter(v => v === '').length;
            if (aiCount === align - 1 && emptyCount === 1) score += 50;
            if (plCount === align - 1 && emptyCount === 1) score -= 50;
            if (aiCount === align - 2 && emptyCount === 2) score += 10;
            if (plCount === align - 2 && emptyCount === 2) score -= 10;
            if (aiCount >= 1 && plCount === 0) score += aiCount;
            if (plCount >= 1 && aiCount === 0) score -= plCount;
        }
        // Centre
        const centers = boardSize === 3 ? [4] : (boardSize === 5 ? [12] : [24]);
        for (let c of centers) {
            if (b[c] === aiSymbol) score += 3;
            if (b[c] === playerSymbol) score -= 3;
        }
        return score;
    }

    // --- MULTIJOUEUR FIREBASE ---
    function normalizeBoard(boardObj, size) {
        if (Array.isArray(boardObj)) return boardObj;
        if (!boardObj) return Array(size * size).fill('');
        return Array.from({ length: size * size }, (_, i) => boardObj[i] || '');
    }

    function normalizePions(pObj, size) {
        if (!pObj || typeof pObj !== 'object') return { X: MAX_PIONS[size], O: MAX_PIONS[size] };
        return { X: pObj.X ?? MAX_PIONS[size], O: pObj.O ?? MAX_PIONS[size] };
    }

    setBoardCallback((room) => {
        const size = room.boardSize || 3;
        const b = normalizeBoard(room.board, size);
        const p = normalizePions(room.pions, size);

        if (gameMode === 'online') {
            boardSize = size;
            board = b;
            pions = p;
            if (auth.currentUser) {
                myOnlineSymbol = room.hostUid === auth.currentUser.uid ? 'X' : 'O';
            }
            if (boardEl.childElementCount !== size * size) {
                initBoard(size);
            }
            renderBoard(board);
            updateBadges(room.turn);
            updatePionsDisplay();
            const mySym = myOnlineSymbol;
            const myPions = mySym ? pions[mySym] : 0;
            if (room.turn === mySym) {
                turnIndicator.textContent = `Votre tour — ${myPions} pion${myPions > 1 ? 's' : ''} restant${myPions > 1 ? 's' : ''}`;
            } else {
                turnIndicator.textContent = `Tour de l'adversaire...`;
            }

            const winRes = checkWin(board, boardSize);
            if (room.status === "playing") {
                if (winRes && auth.currentUser && room.hostUid === auth.currentUser.uid) declareWinner(winRes);
                else if (isBoardFull(board) && auth.currentUser && room.hostUid === auth.currentUser.uid) declareDraw();
            }

            if (room.status === "playing" && screens.lobby.classList.contains('active')) {
                showScreen('game');
            }

            if (room.status === "finished") {
                gameoverModal.classList.remove('active');
                if (room.winner === "draw") {
                    playSound('draw');
                    gameoverTitle.textContent = "Match Nul !";
                    gameoverSubtitle.textContent = "Égalité parfaite en ligne.";
                } else {
                    playSound('win');
                    gameoverTitle.textContent = `Victoire de ${room.winner} !`;
                    gameoverSubtitle.textContent = "Superbe duel en réseau !";
                }
                setTimeout(() => gameoverModal.classList.add('active'), 400);
            } else if (room.status === "playing") {
                gameoverModal.classList.remove('active');
            }
        }
    });

    setStatusCallback((text) => {
        const ls = document.getElementById('lobby-status');
        if (ls) ls.textContent = text;
    });

    async function handleOnlineClick(index) {
        if (!auth.currentUser || !currentRoomCode) return;
        // La logique de sélection/déplacement est gérée côté client
        // On envoie le coup à Firebase qui valide
        const uid = auth.currentUser.uid;
        // On récupère le room pour connaître notre symbole et les pions
        // Mais c'est coûteux. On peut déduire de l'état local synchronisé
        const mySymbol = pions; // pions est synchronisé par le callback
        // En fait, on utilise playMove qui fait une transaction Firebase
        // Il faut adapter playMove pour gérer les coups complexes

        // Pour simplifier : on envoie le coup directement via playMove enrichi
        // Mais online.js ne gère que index simple. Il faut le modifier.
        // Pour l'instant, utilisons une approche simplifiée :
        // Si on a des pions, c'est un placement. Sinon c'est un déplacement.
        // Mais on ne sait pas si c'est un déplacement sans l'état Firebase.

        // Solution : on utilise l'état local `board` et `pions` synchronisé par le callback
        const mySym = await getMySymbol();
        if (!mySym) return;
        const myPions = pions[mySym];

        if (myPions > 0) {
            // Placement
            if (board[index] === '') {
                await playMove(currentRoomCode, { type: 'place', to: index });
            }
        } else {
            // Déplacement
            if (selectedIndex === null) {
                if (board[index] === mySym) {
                    selectedIndex = index;
                    playSound('select');
                    renderBoard(board);
                }
            } else {
                if (board[index] === '' && selectedIndex !== index) {
                    await playMove(currentRoomCode, { type: 'move', from: selectedIndex, to: index });
                    selectedIndex = null;
                } else if (board[index] === mySym) {
                    selectedIndex = index;
                    playSound('select');
                    renderBoard(board);
                } else {
                    selectedIndex = null;
                    renderBoard(board);
                }
            }
        }
    }

    async function getMySymbol() {
        if (!auth.currentUser) return null;
        const room = await import("./online.js").then(m => m.getCurrentRoom());
        if (!room) return null;
        return room.hostUid === auth.currentUser.uid ? 'X' : 'O';
    }

    // --- CONTRÔLES ---
    document.getElementById('btn-undo').addEventListener('click', () => {
        if (gameMode === 'online') return;
        if (!localGameActive || moveHistory.length === 0) return;
        let steps = (gameMode === 'ai') ? 2 : 1;
        if (gameMode === 'ai' && moveHistory.length < 2) return;
        for (let i = 0; i < steps; i++) {
            const last = moveHistory.pop();
            if (!last) continue;
            board[last.to] = '';
            pions[last.player]++;
        }
        localCurrentPlayer = moveHistory.length > 0 ? (moveHistory[moveHistory.length - 1].player === 'X' ? 'O' : 'X') : 'X';
        renderBoard(board);
        updateBadges(localCurrentPlayer);
        updatePionsDisplay();
        updateTurnText();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
        if (gameMode === 'online') restartGame();
        else startLocalGame();
    });

    document.getElementById('btn-revenche').addEventListener('click', () => {
        gameoverModal.classList.remove('active');
        if (gameMode === 'online') restartGame();
        else startLocalGame();
    });

    document.getElementById('btn-back-menu').addEventListener('click', () => {
        gameoverModal.classList.remove('active');
        if (gameMode === 'online' && currentRoomCode) {
            disconnectRoom();
            leaveRoom(currentRoomCode);
            currentRoomCode = null;
        }
        showScreen('menu');
    });

    // --- SALONS ---
    document.getElementById("create-room").addEventListener("click", async () => {
        try {
            if (!auth.currentUser) await firebaseLogin();
            const size = parseInt(document.getElementById('online-board-size').value);
            const playerName = document.getElementById('host-name').value.trim() || "Joueur 1";
            const code = await createRoom(size, playerName);
            currentRoomCode = code;
            gameMode = "online";
            connectRoom(code);

            document.getElementById('lobby-code').textContent = code;
            const link = roomLink(code);
            document.getElementById('lobby-link').textContent = link;
            document.getElementById('feedback-code').textContent = '';
            document.getElementById('feedback-link').textContent = '';
            showScreen('lobby');
        } catch (err) {
            console.error(err);
            alert("Erreur création salon : " + err.message);
        }
    });

    document.getElementById("copy-lobby-code").addEventListener("click", async () => {
        const ok = await copy(document.getElementById('lobby-code').textContent);
        const fb = document.getElementById('feedback-code');
        fb.textContent = ok ? "✓ Code copié !" : "✗ Erreur";
        setTimeout(() => fb.textContent = '', 2000);
    });

    document.getElementById("copy-lobby-link").addEventListener("click", async () => {
        const ok = await copy(document.getElementById('lobby-link').textContent);
        const fb = document.getElementById('feedback-link');
        fb.textContent = ok ? "✓ Lien copié !" : "✗ Erreur";
        setTimeout(() => fb.textContent = '', 2000);
    });

    document.getElementById("lobby-cancel").addEventListener("click", async () => {
        if (currentRoomCode) { disconnectRoom(); await leaveRoom(currentRoomCode); currentRoomCode = null; }
        showScreen('menu');
    });

    document.getElementById("join-room").addEventListener("click", async () => {
        const code = document.getElementById("room-code-input").value.trim().toUpperCase();
        if (!code) { alert("Veuillez entrer un code."); return; }
        await doJoinRoom(code);
    });

    document.getElementById("btn-confirm-join").addEventListener("click", async () => {
        const code = document.getElementById("join-code-display").textContent.trim();
        if (!code || code === '---') return;
        await doJoinRoom(code);
    });

    async function doJoinRoom(code) {
        try {
            if (!auth.currentUser) await firebaseLogin();
            const playerName = document.getElementById('join-player-name')?.value.trim() || "Joueur 2";
            await joinRoom(code, playerName);
            currentRoomCode = code;
            gameMode = "online";
            connectRoom(code);
            showScreen('game');
        } catch (err) {
            alert("Erreur pour rejoindre : " + err.message);
        }
    }

    const codeURL = getRoomCodeFromURL();
    if (codeURL) {
        document.getElementById("join-code-display").textContent = codeURL;
        showScreen('join');
    }

    // --- STATS ---
    function loadStats() {
        const saved = localStorage.getItem('morpion_stats_v3');
        if (saved) scores = JSON.parse(saved);
    }
    function saveStats() { localStorage.setItem('morpion_stats_v3', JSON.stringify(scores)); }

    document.getElementById('btn-stats').addEventListener('click', () => {
        loadStats();
        document.getElementById('stat-x').textContent = scores.X;
        document.getElementById('stat-o').textContent = scores.O;
        document.getElementById('stat-draws').textContent = scores.draws;
        document.getElementById('stat-total').textContent = scores.total;
        const wr = scores.total > 0 ? Math.round((scores.X / scores.total) * 100) : 0;
        document.getElementById('stat-winrate').textContent = wr + '%';
        statsModal.classList.add('active');
    });

    document.getElementById('close-stats').addEventListener('click', () => statsModal.classList.remove('active'));
    document.getElementById('reset-stats').addEventListener('click', () => {
        scores = { X: 0, O: 0, draws: 0, total: 0 };
        saveStats();
        ['stat-x','stat-o','stat-draws','stat-total'].forEach(id => document.getElementById(id).textContent = '0');
        document.getElementById('stat-winrate').textContent = '0%';
    });

    // --- THÈME & AUDIO ---
    const themeToggle = document.getElementById('theme-toggle');
    const soundToggle = document.getElementById('sound-toggle');

    themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        const t = html.getAttribute('data-theme');
        html.setAttribute('data-theme', t === 'dark' ? 'light' : 'dark');
        themeToggle.innerHTML = t === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

    soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggle.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    });

    loadStats();
});
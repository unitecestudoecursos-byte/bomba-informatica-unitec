const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true, game: "Bomba da Informática - Unitec" }));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 20;
const rooms = new Map();

const WORDS = [
  "MOUSE", "TECLADO", "MONITOR", "WINDOWS", "PASTA", "ARQUIVO",
  "INTERNET", "HARDWARE", "SOFTWARE", "NAVEGADOR", "PROCESSADOR",
  "MEMORIA", "PLANILHA", "ATALHO", "PERIFERICO", "PLACA MAE",
  "SISTEMA", "DOWNLOAD", "SEGURANCA", "COMPATIBILIDADE",
  "ALGORITMO", "FIREWALL", "BANCO DE DADOS", "ARMAZENAMENTO",
  "GABINETE", "IMPRESSORA", "RESOLUCAO", "PROGRAMACAO"
];

function cleanWord(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, alive: p.alive, score: p.score,
      correct: p.correct, eliminations: p.eliminations
    })),
    bombHolderId: room.bombHolderId,
    deadline: room.deadline,
    currentWord: room.currentWord,
    round: room.round,
    winnerId: room.winnerId,
    message: room.message
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function alivePlayers(room) {
  return [...room.players.values()].filter(p => p.alive);
}
function chooseWord(room) {
  const candidates = WORDS.filter(w => w !== room.lastWord);
  room.currentWord = candidates[crypto.randomInt(candidates.length)];
  room.lastWord = room.currentWord;
}
function stopTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function startBomb(room, playerId) {
  stopTimer(room);
  room.bombHolderId = playerId;
  room.currentWord = "";
  chooseWord(room);
  // Variable fuse: players do not know the exact time.
  const fuseMs = crypto.randomInt(9000, 19001);
  room.deadline = Date.now() + fuseMs;
  room.timer = setTimeout(() => explode(room.code), fuseMs);
}
function finishIfNeeded(room) {
  const alive = alivePlayers(room);
  if (alive.length <= 1) {
    stopTimer(room);
    room.status = "finished";
    room.bombHolderId = null;
    room.deadline = null;
    room.winnerId = alive[0]?.id || null;
    room.message = alive[0] ? `${alive[0].name} venceu a Bomba da Informática!` : "Fim de jogo!";
    emitRoom(room);
    io.to(room.code).emit("game:finished", { winnerId: room.winnerId, winnerName: alive[0]?.name || null });
    return true;
  }
  return false;
}
function explode(code) {
  const room = rooms.get(code);
  if (!room || room.status !== "playing") return;
  const holder = room.players.get(room.bombHolderId);
  if (holder && holder.alive) {
    holder.alive = false;
    room.message = `💥 BOOM! ${holder.name} foi eliminado!`;
    io.to(room.code).emit("game:explosion", { playerId: holder.id, playerName: holder.name });
  }
  room.bombHolderId = null;
  room.deadline = null;
  if (finishIfNeeded(room)) return;
  emitRoom(room);
  // Short dramatic pause, then a surviving player receives the bomb.
  setTimeout(() => {
    const latest = rooms.get(code);
    if (!latest || latest.status !== "playing") return;
    const alive = alivePlayers(latest);
    if (!alive.length) return;
    const next = alive[crypto.randomInt(alive.length)];
    latest.round += 1;
    latest.message = "A bomba voltou a circular. Digite rápido!";
    startBomb(latest, next.id);
    emitRoom(latest);
  }, 1800);
}
function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;
  const player = room.players.get(socket.id);
  if (player) {
    room.players.delete(socket.id);
    if (room.status === "playing" && player.alive && room.bombHolderId === socket.id) {
      stopTimer(room);
      room.bombHolderId = null;
      room.deadline = null;
      room.message = `${player.name} saiu da partida; a bomba foi redistribuída.`;
    }
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value || null;
  }
  if (room.players.size === 0) {
    stopTimer(room);
    rooms.delete(code);
    return;
  }
  if (room.status === "playing") {
    if (!finishIfNeeded(room)) {
      const alive = alivePlayers(room);
      if (!room.bombHolderId && alive.length) startBomb(room, alive[crypto.randomInt(alive.length)].id);
    }
  }
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, callback = () => {}) => {
    const playerName = String(name || "").trim().slice(0, 18);
    if (!playerName) return callback({ ok: false, error: "Digite seu nome." });
    let code;
    do { code = roomCode(); } while (rooms.has(code));
    const room = {
      code, hostId: socket.id, status: "lobby", players: new Map(),
      bombHolderId: null, deadline: null, currentWord: "", round: 0,
      winnerId: null, message: "Aguardando jogadores...", timer: null, lastWord: ""
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, score: 0, correct: 0, eliminations: 0 });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback({ ok: true, code });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}, callback = () => {}) => {
    const roomCodeValue = String(code || "").trim().toUpperCase();
    const playerName = String(name || "").trim().slice(0, 18);
    const room = rooms.get(roomCodeValue);
    if (!playerName) return callback({ ok: false, error: "Digite seu nome." });
    if (!room) return callback({ ok: false, error: "Sala não encontrada. Confira o código." });
    if (room.status !== "lobby") return callback({ ok: false, error: "A partida já começou." });
    if (room.players.size >= MAX_PLAYERS) return callback({ ok: false, error: "A sala já tem 20 jogadores." });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return callback({ ok: false, error: "Esse nome já está sendo usado na sala." });
    }
    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, score: 0, correct: 0, eliminations: 0 });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    callback({ ok: true, code: room.code });
    emitRoom(room);
  });

  socket.on("game:start", (_, callback = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return callback({ ok: false, error: "Entre em uma sala primeiro." });
    if (room.hostId !== socket.id) return callback({ ok: false, error: "Somente quem criou a sala pode iniciar." });
    if (room.status !== "lobby") return callback({ ok: false, error: "A partida já foi iniciada." });
    if (room.players.size < 2) return callback({ ok: false, error: "São necessários pelo menos 2 jogadores." });
    room.status = "playing";
    room.round = 1;
    room.message = "Valendo! Digite a palavra e passe a bomba!";
    const alive = alivePlayers(room);
    startBomb(room, alive[crypto.randomInt(alive.length)].id);
    emitRoom(room);
    callback({ ok: true });
  });

  socket.on("word:submit", ({ word } = {}, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "playing") return callback({ ok: false, error: "A partida não está em andamento." });
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return callback({ ok: false, error: "Você está fora da rodada." });
    if (room.bombHolderId !== socket.id) return callback({ ok: false, error: "A bomba não está com você." });
    if (Date.now() >= room.deadline) return callback({ ok: false, error: "Tarde demais! A bomba já explodiu." });
    if (cleanWord(word) !== cleanWord(room.currentWord)) return callback({ ok: false, error: "Palavra incorreta. Tente novamente!" });
    const alive = alivePlayers(room);
    const targets = alive.filter(p => p.id !== socket.id);
    if (!targets.length) return callback({ ok: false, error: "Não há outro jogador para receber a bomba." });
    player.correct += 1;
    player.score += 10;
    // Automatically pass to a random surviving opponent.
    const next = targets[crypto.randomInt(targets.length)];
    room.message = `⚡ ${player.name} acertou e passou a bomba para ${next.name}!`;
    startBomb(room, next.id);
    emitRoom(room);
    callback({ ok: true, message: "Correto! Bomba passada!" });
  });

  socket.on("disconnect", () => leaveRoom(socket));
  socket.on("room:leave", () => {
    leaveRoom(socket);
    socket.leaveAll();
  });
});

server.listen(PORT, () => console.log(`Bomba da Informática rodando na porta ${PORT}`));

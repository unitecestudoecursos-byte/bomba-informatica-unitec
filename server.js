const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const app = express();
const server = http.createServer(app);
const socketServer = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC));
app.use("/milhao", express.static(path.join(PUBLIC, "milhao")));
app.get("/health", (_req,res)=>res.json({ok:true,app:"UNITEC Game Center",games:["Bomba da Digitação","Show de Milhões"]}));
app.get("/bomba", (_req,res)=>res.sendFile(path.join(PUBLIC,"bomba.html")));
app.get("/milhao", (_req,res)=>res.sendFile(path.join(PUBLIC,"milhao","index.html")));

function setupBomb(io) {
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
    countdownEndsAt: room.countdownEndsAt || null,
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


  // Reações rápidas na sala de espera: somente emojis permitidos e com limite de envio.
  socket.on("lobby:emoji", ({ emoji } = {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    const player = room?.players.get(socket.id);
    const allowed = ["😀","😂","😎","🤩","👏","👍","🔥","💪","❤️","🎉","🚀","🤔","😱","💻"];
    if (!room || room.status !== "lobby" || !player || !allowed.includes(emoji)) return;
    const now = Date.now();
    if (socket.data.lastLobbyEmoji && now - socket.data.lastLobbyEmoji < 650) return;
    socket.data.lastLobbyEmoji = now;
    io.to(code).emit("lobby:emoji", { playerName: player.name, emoji });
  });

  socket.on("game:start", (_, callback = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return callback({ ok: false, error: "Entre em uma sala primeiro." });
    if (room.hostId !== socket.id) return callback({ ok: false, error: "Somente quem criou a sala pode iniciar." });
    if (room.status !== "lobby") return callback({ ok: false, error: "A partida já foi iniciada." });
    if (room.players.size < 2) return callback({ ok: false, error: "São necessários pelo menos 2 jogadores." });
    room.status = "countdown";
    room.round = 1;
    room.message = "Prepare-se! A partida vai começar...";
    room.countdownEndsAt = Date.now() + 3500;
    emitRoom(room);
    setTimeout(() => {
      const latest = rooms.get(code);
      if (!latest || latest.status !== "countdown") return;
      const survivors = alivePlayers(latest);
      if (!survivors.length) { latest.status = "finished"; latest.message = "Partida encerrada."; emitRoom(latest); return; }
      latest.status = "playing"; latest.countdownEndsAt = null;
      latest.message = "Valendo! Digite a palavra e passe a bomba!";
      const firstPlayer = survivors[crypto.randomInt(survivors.length)];
      startBomb(latest, firstPlayer.id); emitRoom(latest);
    }, 3500);
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


}
function setupMillion(io) {
const QUESTIONS = [
  { category:"Informática", level:1, q:"Qual componente é considerado o cérebro do computador?", a:["Memória RAM","Processador (CPU)","Placa de vídeo","Fonte de alimentação"], correct:1, explanation:"A CPU executa instruções e coordena operações do computador." },
  { category:"Windows", level:1, q:"Qual atalho normalmente copia um item selecionado no Windows?", a:["Ctrl + V","Ctrl + X","Ctrl + C","Alt + F4"], correct:2, explanation:"Ctrl + C copia; Ctrl + V cola; Ctrl + X recorta." },
  { category:"Word", level:1, q:"Qual ferramenta deixa o texto mais escuro e destacado no Word?", a:["Itálico","Negrito","Sublinhado","Tachado"], correct:1, explanation:"O botão Negrito ou Ctrl + N (em configurações comuns do Word em português) aplica destaque em negrito." },
  { category:"Excel", level:2, q:"Qual símbolo inicia uma fórmula no Excel?", a:["#","=","@","&"], correct:1, explanation:"As fórmulas do Excel começam com o sinal de igual." },
  { category:"Hardware", level:2, q:"Qual componente mantém dados temporários enquanto o computador está ligado?", a:["SSD","Memória RAM","Placa-mãe","Cooler"], correct:1, explanation:"A RAM é uma memória volátil usada pelos programas em execução." },
  { category:"Internet", level:2, q:"O que significa HTTPS em um endereço de site?", a:["Conexão com criptografia TLS","Um tipo de arquivo de imagem","Um antivírus","Uma rede sem fio"], correct:0, explanation:"HTTPS protege a comunicação entre navegador e servidor usando criptografia." },
  { category:"Excel", level:3, q:"Qual função soma valores em um intervalo no Excel em português?", a:["CONT.SE","MÉDIA","SOMA","MÁXIMO"], correct:2, explanation:"A função SOMA adiciona os valores indicados." },
  { category:"Redes", level:3, q:"Qual equipamento encaminha pacotes entre redes diferentes?", a:["Teclado","Roteador","Monitor","Scanner"], correct:1, explanation:"O roteador encaminha tráfego entre redes IP." },
  { category:"Segurança", level:4, q:"Qual prática ajuda a proteger uma conta contra roubo de senha?", a:["Reutilizar a mesma senha","Compartilhar a senha com colegas","Ativar autenticação em dois fatores","Desativar atualizações"], correct:2, explanation:"A autenticação em dois fatores adiciona uma camada extra de proteção." },
  { category:"Excel VBA", level:4, q:"No VBA do Excel, qual palavra-chave costuma iniciar uma macro comum?", a:["Functionary","Sub","MacroStart","Begin"], correct:1, explanation:"Uma macro procedural normalmente começa com Sub e termina com End Sub." },
  { category:"Hardware", level:5, q:"Qual padrão de armazenamento costuma oferecer menor latência: HDD mecânico ou SSD?", a:["HDD mecânico","SSD","Disquete","CD-ROM"], correct:1, explanation:"SSDs não dependem de discos mecânicos e geralmente têm acesso muito mais rápido." },
  { category:"Redes", level:5, q:"Qual endereço é usado para testar a pilha TCP/IP local em IPv4?", a:["192.168.0.1","8.8.8.8","127.0.0.1","255.255.255.0"], correct:2, explanation:"127.0.0.1 é o endereço de loopback IPv4." },
  { category:"Windows", level:1, q:"Qual tecla abre o menu Iniciar do Windows?", a:["Esc","Tecla Windows","Tab","Shift"], correct:1, explanation:"A tecla Windows abre o menu Iniciar." },
  { category:"Informática", level:1, q:"Qual destes é um dispositivo de entrada?", a:["Monitor","Impressora","Teclado","Caixa de som"], correct:2, explanation:"O teclado envia informações para o computador." },
  { category:"Hardware", level:1, q:"Qual peça usamos para movimentar o ponteiro na tela?", a:["Mouse","Fonte","Memória RAM","Roteador"], correct:0, explanation:"O mouse controla o ponteiro e permite selecionar itens." },
  { category:"Windows", level:1, q:"Qual combinação bloqueia rapidamente o computador?", a:["Windows + L","Ctrl + P","Alt + Tab","Ctrl + C"], correct:0, explanation:"Windows + L bloqueia a sessão do usuário." },
  { category:"Informática", level:1, q:"O que é um arquivo PDF?", a:["Um formato de documento","Uma peça do PC","Um navegador","Uma memória"], correct:0, explanation:"PDF é um formato de documento que preserva a apresentação." },
  { category:"Hardware", level:1, q:"Qual componente exibe imagens do computador?", a:["Monitor","Teclado","Microfone","Pendrive"], correct:0, explanation:"O monitor é o dispositivo de saída visual." },
  { category:"Internet", level:1, q:"Qual programa usamos para acessar páginas da internet?", a:["Navegador","Calculadora","Bloco de Notas","Paint"], correct:0, explanation:"Chrome, Edge e Firefox são navegadores." },
  { category:"Word", level:1, q:"Qual comando salva um documento na maioria dos programas?", a:["Ctrl + S","Ctrl + Z","Ctrl + A","Ctrl + X"], correct:0, explanation:"Ctrl + S salva o arquivo atual." },
  { category:"Excel", level:2, q:"Qual função calcula a média de valores no Excel?", a:["SOMA","MÉDIA","CONT.VALORES","MÁXIMO"], correct:1, explanation:"MÉDIA calcula a média aritmética dos valores." },
  { category:"Windows", level:2, q:"Qual ferramenta do Windows mostra processos em execução?", a:["Gerenciador de Tarefas","Paint","Explorador de Arquivos","Bloco de Notas"], correct:0, explanation:"O Gerenciador de Tarefas permite acompanhar processos e desempenho." },
  { category:"Hardware", level:2, q:"Qual conexão é comum para ligar um monitor moderno?", a:["HDMI","RJ-11","SATA","PS/2"], correct:0, explanation:"HDMI transmite áudio e vídeo digital." },
  { category:"Excel", level:2, q:"Qual referência fixa uma célula ao copiar uma fórmula?", a:["A1","$A$1","A:A","1:1"], correct:1, explanation:"O cifrão fixa coluna e linha na referência absoluta." },
  { category:"Word", level:2, q:"Qual recurso do Word identifica erros de escrita?", a:["Verificação ortográfica","Mala direta","Quebra de seção","Controle de alterações"], correct:0, explanation:"A revisão ortográfica sinaliza possíveis erros de escrita." },
  { category:"Redes", level:2, q:"O que significa Wi-Fi?", a:["Tecnologia de rede sem fio","Tipo de cabo de vídeo","Memória do PC","Sistema operacional"], correct:0, explanation:"Wi-Fi permite conexão de rede sem fio." },
  { category:"Excel", level:2, q:"Qual recurso organiza dados em ordem crescente ou decrescente?", a:["Classificar","Congelar Painéis","Mesclar","Quebra de Texto"], correct:0, explanation:"Classificar organiza os registros conforme critérios escolhidos." },
  { category:"PowerPoint", level:2, q:"Qual tecla inicia uma apresentação do começo?", a:["F5","F2","F7","F12"], correct:0, explanation:"F5 inicia a apresentação de slides desde o primeiro slide." },
  { category:"Excel", level:3, q:"Qual função conta células que atendem a um critério?", a:["SOMASE","CONT.SE","PROCV","SEERRO"], correct:1, explanation:"CONT.SE conta células de um intervalo que atendem a um critério." },
  { category:"Excel", level:3, q:"Em uma tabela dinâmica, para que serve a área Valores?", a:["Resumir campos numericamente","Definir impressão","Criar macros","Alterar tema"], correct:0, explanation:"A área Valores agrega dados como soma, contagem e média." },
  { category:"Redes", level:3, q:"Qual serviço traduz nomes de domínio em endereços IP?", a:["DNS","DHCP","FTP","SMTP"], correct:0, explanation:"O DNS resolve nomes de domínio para endereços IP." },
  { category:"Hardware", level:3, q:"Qual padrão é usado para conectar SSDs NVMe diretamente via PCIe?", a:["M.2","VGA","IDE","PATA"], correct:0, explanation:"Unidades NVMe usam PCIe e frequentemente o formato M.2." },
  { category:"Windows", level:3, q:"Qual comando do Windows verifica arquivos protegidos do sistema?", a:["sfc /scannow","ipconfig /release","diskpart clean","ping -t"], correct:0, explanation:"O Verificador de Arquivos do Sistema examina arquivos protegidos." },
  { category:"Excel", level:3, q:"Qual função procura um valor na primeira coluna de uma matriz?", a:["PROCV","MÉDIA","AGORA","TEXTO"], correct:0, explanation:"PROCV pesquisa na primeira coluna e retorna um valor de outra coluna." },
  { category:"Segurança", level:3, q:"O que é phishing?", a:["Golpe para obter dados por engano","Backup automático","Atualização do Windows","Tipo de memória"], correct:0, explanation:"Phishing tenta enganar pessoas para capturar credenciais ou dados." },
  { category:"Redes", level:3, q:"Qual protocolo distribui automaticamente configurações IP?", a:["DHCP","DNS","HTTPS","SSH"], correct:0, explanation:"DHCP entrega parâmetros de rede automaticamente." },
  { category:"Excel VBA", level:4, q:"Qual objeto representa a pasta de trabalho ativa no VBA?", a:["ActiveWorkbook","ActiveCell","SelectionRow","ThisMacro"], correct:0, explanation:"ActiveWorkbook representa a pasta de trabalho ativa." },
  { category:"Redes", level:4, q:"Qual máscara corresponde normalmente a uma rede IPv4 /24?", a:["255.255.255.0","255.0.0.0","255.255.0.0","255.255.255.252"], correct:0, explanation:"O prefixo /24 equivale a 255.255.255.0." },
  { category:"Segurança", level:4, q:"Qual princípio concede somente as permissões necessárias?", a:["Menor privilégio","Acesso irrestrito","Confiança implícita","Senha compartilhada"], correct:0, explanation:"O princípio do menor privilégio reduz a superfície de risco." },
  { category:"Excel VBA", level:4, q:"Qual evento é executado quando uma planilha é alterada?", a:["Worksheet_Change","Workbook_Open","Auto_Close","OnPrint"], correct:0, explanation:"Worksheet_Change ocorre quando células da planilha são modificadas." },
  { category:"Redes", level:4, q:"Qual protocolo seguro é usado para acesso remoto por terminal?", a:["SSH","Telnet","HTTP","POP3"], correct:0, explanation:"SSH fornece acesso remoto criptografado." },
  { category:"Banco de Dados", level:4, q:"Em SQL, qual comando combina linhas de duas tabelas relacionadas?", a:["JOIN","DROP","ALTER","TRUNCATE"], correct:0, explanation:"JOIN combina registros de tabelas com base em uma condição." },
  { category:"Segurança", level:4, q:"O que caracteriza uma vulnerabilidade zero-day?", a:["Falha ainda sem correção disponível","Senha expirada","Backup antigo","Porta USB desativada"], correct:0, explanation:"É uma falha explorável antes de existir uma correção amplamente disponível." },
  { category:"Sistemas", level:4, q:"O que é uma condição de corrida em sistemas?", a:["Resultado depende da ordem de execução concorrente","Falha física no HD","Erro de resolução de tela","Perda de pacote DNS"], correct:0, explanation:"O resultado depende do timing entre operações concorrentes." }
];
const LEVELS = {
  aprendiz: { label: "Aprendiz", difficulty: 1 },
  praticante: { label: "Praticante", difficulty: 2 },
  especialista: { label: "Especialista", difficulty: 3 },
  mestre: { label: "Mestre da Informática", difficulty: 4 }
};
const rooms = new Map();
const QUESTION_TIME = 25;

function code() {
  let out;
  do { out = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(out));
  return out;
}
function cleanName(s) {
  return String(s || "").trim().replace(/[<>]/g, "").slice(0, 18);
}
function roomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    level: room.level,
    levelLabel: LEVELS[room.level]?.label || "Aprendiz",
    aliveCount: [...room.players.values()].filter(p => !p.eliminated).length,
    winner: room.winner || null,
    finishReason: room.finishReason || null,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, correct: p.correct,
      streak: p.streak, lives: p.lives, answered: !!p.answered, connected: p.connected, eliminated: !!p.eliminated, eliminationReason: p.eliminationReason || null
    })).sort((a,b) => b.score-a.score || b.correct-a.correct || a.name.localeCompare(b.name)),
    questionIndex: room.questionIndex,
    totalQuestions: room.questionOrder.length,
    question: (room.status === "playing" || room.status === "reveal") && room.questionIndex >= 0 ? publicQuestion(room) : null,
    timeLeft: room.timeLeft,
    results: room.lastResults || null,
    prizes: room.questionOrder.map((_, i) => (i + 1) * 1000)
  };
}
function publicQuestion(room) {
  const q = room.questionOrder[room.questionIndex];
  if (!q) return null;
  return { category:q.category, level:q.level, q:q.q, a:q.a, prize:(room.questionIndex+1)*1000, number:room.questionIndex+1, total:room.questionOrder.length };
}
function broadcast(room) { io.to(room.code).emit("room:update", roomState(room)); }
function stopTimer(room) { if (room.timer) clearInterval(room.timer); room.timer = null; }
function startQuestion(room) {
  stopTimer(room);
  room.lastResults = null;
  room.timeLeft = QUESTION_TIME;
  for (const p of room.players.values()) { p.answered = false; p.answer = null; p.usedThisQuestion = false; p.removedOptions = []; }
  broadcast(room);
  room.timer = setInterval(() => {
    if (room.status !== "playing") return stopTimer(room);
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      room.timeLeft = 0;
      resolveQuestion(room, true);
    } else broadcast(room);
  }, 1000);
}
function resolveQuestion(room) {
  if (room.status !== "playing" || room.lastResults) return;
  stopTimer(room);
  const q = room.questionOrder[room.questionIndex];
  const results = [];
  for (const p of room.players.values()) {
    if (p.eliminated) continue;
    const timedOut = !p.answered;
    const correct = !timedOut && p.answer === q.correct;
    let points = 0;
    if (correct) {
      // Pontuação sem teto: cada acerto soma 1.000 pontos + bônus pelo tempo.
      points = 1000 + Math.max(0, room.timeLeft) * 10;
      p.score += points; p.correct += 1; p.streak += 1;
    } else {
      p.streak = 0;
      p.lives = Math.max(0, (p.lives ?? 3) - 1);
      if (p.lives === 0) {
        p.eliminated = true;
        p.eliminationReason = timedOut ? "Tempo esgotado" : "Resposta incorreta";
      }
    }
    results.push({ id:p.id, name:p.name, correct, answer:p.answer, timedOut, points, lives:p.lives, eliminated:p.eliminated });
  }
  room.lastResults = { correctIndex:q.correct, explanation:q.explanation, results };
  room.status = "reveal";
  broadcast(room);
  room.nextTimer = setTimeout(() => {
    room.nextTimer = null;
    const alive = [...room.players.values()].filter(p => !p.eliminated);
    if (alive.length <= 1 || room.questionIndex + 1 >= room.questionOrder.length) {
      room.status = "finished";
      if (alive.length === 1) { room.winner = alive[0].name; room.finishReason = "last-survivor"; }
      else if (alive.length > 1) { room.winner = [...alive].sort((a,b)=>b.score-a.score || b.correct-a.correct)[0].name; room.finishReason = "question-bank"; }
      else { room.winner = null; room.finishReason = "no-survivor"; }
      broadcast(room);
    } else {
      room.questionIndex += 1;
      room.status = "playing";
      startQuestion(room);
    }
  }, 5000);
}
function createRoom(host, name, level) {
  const c = code();
  const chosen = LEVELS[level] ? level : "aprendiz";
  const difficulty = LEVELS[chosen].difficulty;
  const pool = QUESTIONS.filter(q => q.level === difficulty);
  const order = [...pool].sort(() => Math.random() - 0.5);
  const room = { code:c, hostId:host.id, status:"lobby", level:chosen, players:new Map(), questionOrder:order, questionIndex:-1, timeLeft:QUESTION_TIME, timer:null, nextTimer:null, lastResults:null, winner:null, finishReason:null };
  room.players.set(host.id, newPlayer(host.id, name, true));
  rooms.set(c, room);
  host.join(c);
  host.data.room = c;
  return room;
}
function newPlayer(id, name, isHost=false) {
  return { id, name, isHost, score:0, correct:0, streak:0, lives:3, answered:false, answer:null, connected:true, eliminated:false, eliminationReason:null, helps:{fifty:false,audience:false,skip:false}, eliminatedAnswers:[] };
}
io.on("connection", socket => {
  socket.on("room:create", ({name, level} = {}, cb = () => {}) => {
    name = cleanName(name);
    if (!name) return cb({ok:false, error:"Digite seu nome ou apelido."});
    const room = createRoom(socket, name, level);
    cb({ok:true, code:room.code, playerId:socket.id});
    broadcast(room);
  });
  socket.on("room:join", ({code:rawCode, name} = {}, cb = () => {}) => {
    const c = String(rawCode || "").trim().toUpperCase();
    name = cleanName(name);
    const room = rooms.get(c);
    if (!room) return cb({ok:false, error:"Sala não encontrada. Confira o código."});
    if (room.status !== "lobby") return cb({ok:false, error:"Essa partida já começou."});
    if (!name) return cb({ok:false, error:"Digite seu nome ou apelido."});
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return cb({ok:false, error:"Esse nome já está sendo usado na sala."});
    room.players.set(socket.id, newPlayer(socket.id, name));
    socket.join(c); socket.data.room = c;
    cb({ok:true, code:c, playerId:socket.id});
    broadcast(room);
  });
  socket.on("game:start", (_data, cb = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return cb({ok:false, error:"Somente quem criou a sala pode iniciar."});
    if (room.status !== "lobby") return cb({ok:false, error:"A partida já foi iniciada."});
    if (room.players.size < 2) return cb({ok:false, error:"É preciso ter pelo menos 2 jogadores."});
    if (!room.questionOrder.length) return cb({ok:false, error:"Ainda não há perguntas cadastradas para este nível."});
    room.status = "playing"; room.questionIndex = 0;
    for (const p of room.players.values()) { p.score=0; p.correct=0; p.streak=0; p.lives=3; p.answered=false; p.answer=null; p.eliminated=false; p.eliminationReason=null; p.helps={fifty:false,audience:false,skip:false}; p.removedOptions=[]; }
    room.winner=null; room.finishReason=null;
    startQuestion(room);
    cb({ok:true});
  });
  socket.on("game:answer", ({index} = {}, cb = () => {}) => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);
    if (!room || !p || room.status !== "playing" || p.answered || p.eliminated) return cb({ok:false, error:"Você não pode responder agora."});
    const q = room.questionOrder[room.questionIndex];
    if (!Number.isInteger(index) || index < 0 || index > 3 || p.removedOptions.includes(index)) return cb({ok:false, error:"Alternativa inválida."});
    p.answered = true; p.answer = index;
    cb({ok:true});
    if ([...room.players.values()].filter(x => !x.eliminated).every(x => x.answered)) resolveQuestion(room);
    else broadcast(room);
  });
  socket.on("game:help", ({type} = {}, cb = () => {}) => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);
    if (!room || !p || room.status !== "playing" || p.answered || p.eliminated) return cb({ok:false, error:"Ajuda indisponível neste momento."});
    if (!["fifty","audience"].includes(type) || p.helps[type]) return cb({ok:false, error:"Essa ajuda já foi usada ou não existe."});
    const q = room.questionOrder[room.questionIndex];
    p.helps[type] = true;
    let data = {};
    if (type === "fifty") {
      const wrong = [0,1,2,3].filter(i => i !== q.correct);
      p.removedOptions = wrong.sort(() => Math.random()-0.5).slice(0,2);
      data.eliminated = p.removedOptions;
    } else if (type === "audience") {
      const votes = [0,0,0,0];
      votes[q.correct] = 48 + Math.floor(Math.random()*35);
      let remaining = 100-votes[q.correct];
      const wrong = [0,1,2,3].filter(i=>i!==q.correct).sort(()=>Math.random()-0.5);
      wrong.forEach((idx,j) => { const v = j===2 ? remaining : Math.floor(Math.random()*(remaining+1)); votes[idx]=v; remaining-=v; });
      data.votes = votes;
    }
    cb({ok:true, data});
    broadcast(room);
  });
  socket.on("disconnect", () => {
    const c = socket.data.room;
    const room = rooms.get(c);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) p.connected = false;
    if (room.status === "lobby" && room.hostId === socket.id) {
      // Preserve the room for the remaining players, but elect the first connected player.
      const next = [...room.players.values()].find(x=>x.connected);
      if (next) room.hostId = next.id;
    }
    broadcast(room);
    if ([...room.players.values()].every(x=>!x.connected)) {
      stopTimer(room); if(room.nextTimer) clearTimeout(room.nextTimer); rooms.delete(c);
    }
  });
});

}
setupBomb(socketServer.of("/bomba"));
setupMillion(socketServer.of("/milhao"));
server.listen(PORT,()=>console.log(`UNITEC Game Center rodando na porta ${PORT}`));

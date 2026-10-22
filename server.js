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

const WORD_BANK = {
  basico: `MOUSE|TECLADO|MONITOR|WINDOWS|PASTA|ARQUIVO|INTERNET|HARDWARE|SOFTWARE|NAVEGADOR|PROCESSADOR|MEMORIA|PLANILHA|ATALHO|PERIFERICO|SISTEMA|DOWNLOAD|SEGURANCA|GABINETE|IMPRESSORA|RESOLUCAO|PROGRAMACAO|WORD|EXCEL|POWERPOINT|OUTLOOK|ACCESS|ONEDRIVE|TEAMS|PAINT|BLOCO DE NOTAS|CALCULADORA|LIXEIRA|AREA DE TRABALHO|MENU INICIAR|BARRA DE TAREFAS|PAPEL DE PAREDE|JANELA|ICONE|CURSOR|CLIQUE|SENHA|LOGIN|LOGOUT|WIFI|REDE|CABO|USB|HDMI|FONE|WEBCAM|MICROFONE|CAIXA DE SOM|IMPRESSAO|COPIAR|COLAR|RECORTAR|SALVAR|ABRIR|FECHAR|PASTA DE DOWNLOADS|CAPS LOCK|SHIFT|ENTER|BACKSPACE|DELETE|ESCAPE|TAB|ESPAÇO|SETAS|BATERIA|CARREGADOR|NOTEBOOK|DESKTOP|TABLET|CELULAR|TELA|TOUCHPAD|MOUSE PAD|PENDRIVE|CARTAO DE MEMORIA|HD EXTERNO|CAMERA|FONTE|PLACA DE VIDEO|PLACA MAE|ROTEADOR|MODEM|INTRANET|SITE|LINK|EMAIL|ANEXO|SPAM|NUVEM|VIDEO|AUDIO|FOTO|PASTA COMPARTILHADA|ATUALIZAR|REINICIAR|DESLIGAR|LIGAR|PESQUISAR|LIXEIRA DO WINDOWS|AREA DE NOTIFICACAO|RELÓGIO|IDIOMA|USUARIO|CONTA|PAPELERA`.split("|"),
  medio: `PLANILHA ELETRONICA|FORMULA|FUNCAO|CELULA|COLUNA|LINHA|GRAFICO|TABELA DINAMICA|FILTRO|CLASSIFICACAO|FORMATACAO CONDICIONAL|SOMASE|PROCV|PROCX|CONT SE|CONT VALORES|VALIDACAO DE DADOS|MALA DIRETA|CABECALHO|RODAPE|SUMARIO|REFERENCIA|HIPERLINK|TRANSICAO|ANIMACAO|APRESENTACAO|SLIDE|MODELO|TEMA|COMENTARIO|REVISAO|COLABORACAO|SINCRONIZACAO|BACKUP|RESTAURACAO|ATUALIZACAO|DRIVER|DISPOSITIVO|GERENCIADOR DE TAREFAS|PAINEL DE CONTROLE|EXPLORADOR DE ARQUIVOS|WINDOWS UPDATE|FIREWALL|ANTIVIRUS|CRIPTOGRAFIA|AUTENTICACAO|PERMISSAO|COMPARTILHAMENTO|WORDART|SMARTART|QUEBRA DE PAGINA|NUMERACAO DE PAGINAS|ORIENTACAO DE PAGINA|MARGENS|RECUO|ESPACAMENTO|FONTE TIPOGRAFICA|NEGRITO|ITALICO|SUBLINHADO|ALINHAMENTO|MESCLAR CELULAS|CONGELAR PAINEIS|FORMATO DE MOEDA|FORMATO DE DATA|FORMATO PERCENTUAL|MEDIA|MEDIANA|MAXIMO|MINIMO|ARREDONDAR|CONCATENAR|ESQUERDA|DIREITA|EXT.TEXTO|HOJE|AGORA|SEERRO|SOMASES|CONT.SES|FILTRO AVANCADO|REMOVER DUPLICATAS|NOME DE INTERVALO|REFERENCIA ABSOLUTA|REFERENCIA RELATIVA|APRESENTADOR|MODO DE EXIBICAO|NOTAS DO APRESENTADOR|MESTRE DE SLIDES|INSERIR IMAGEM|INSERIR TABELA|CITACAO|BIBLIOGRAFIA|INDICE REMISSIVO|CONTROLE DE ALTERACOES|RESTRICAO DE EDICAO|MODELO DE DOCUMENTO|PDF|EXPORTAR|IMPORTAR|ATALHO DE TECLADO|AREA DE TRANSFERENCIA|HISTORICO DE VERSOES|ONEDRIVE|SHAREPOINT|TEAMS|FORMULARIO|PESQUISA|CALENDARIO|CONTATO|REUNIAO ONLINE|PLANILHA|DOCUMENTO|APRESENTACAO|BANCO DE DADOS|CONSULTA|RELATORIO|CAMPO|REGISTRO|CHAVE PRIMARIA|TABELA RELACIONAL`.split("|"),
  avancado: `COMPATIBILIDADE|ALGORITMO|BANCO DE DADOS|ARMAZENAMENTO|SISTEMA OPERACIONAL|PLACA MAE|MEMORIA RAM|MEMORIA ROM|SSD|NVME|DISCO RIGIDO|FONTE DE ALIMENTACAO|PROCESSADOR GRAFICO|COOLER|DISSIPADOR|PASTA TERMICA|SOCKET|CHIPSET|BIOS|UEFI|BOOTLOADER|PARTICAO|FORMATACAO|INSTALACAO|VIRTUALIZACAO|MAQUINA VIRTUAL|SISTEMA DE ARQUIVOS|NTFS|FAT32|EXFAT|ENDERECO IP|DNS|DHCP|ROTEADOR|SWITCH|MODEM|PONTO DE ACESSO|ETHERNET|TCP IP|HTTP|HTTPS|FTP|SSH|VPN|LATENCIA|LARGURA DE BANDA|PACOTE DE DADOS|SERVIDOR|CLIENTE|HOSPEDAGEM|DOMINIO|CERTIFICADO SSL|PHISHING|RANSOMWARE|MALWARE|SPYWARE|ENGENHARIA SOCIAL|AUTENTICACAO DE DOIS FATORES|HASH|FIREWALL DE REDE|PROTOCOLO DE REDE|PCI EXPRESS|SATA|M2|FREQUENCIA DE CLOCK|CACHE L3|THREAD|NUCLEO|FIRMWARE|RECUPERACAO DE SISTEMA|PONTO DE RESTAURACAO|IMAGEM DE DISCO|CLONAGEM DE DISCO|DEPURACAO|COMPILADOR|INTERPRETADOR|API|JSON|HTML|CSS|JAVASCRIPT|PYTHON|JAVA|C PLUS PLUS|LINUX|POWERSHELL|PROMPT DE COMANDO|REGISTRO DO WINDOWS|BITLOCKER|MODO DE SEGURANCA|RESTAURACAO DE FABRICA|MEMORIA VIRTUAL|ARQUIVO PAGINACAO|PERMISSOES NTFS|GRUPO DE TRABALHO|ACTIVE DIRECTORY|IMPRESSORA DE REDE|COMPARTILHAMENTO SMB|ENDERECO MAC|MASCARA DE SUBREDE|GATEWAY PADRAO|PING|TRACERT|IPCONFIG|NSLOOKUP|GERENCIADOR DE DISPOSITIVOS|EVENT VIEWER|DISCO DE INICIALIZACAO|PARTICAO DE RECUPERACAO|CONECTOR ATX|CONECTOR EPS|PCI EXPRESS X16|PINO DE PROCESSADOR|DUAL CHANNEL|DDR4|DDR5|FREQUENCIA DA MEMORIA|TDP|THROTTLING|FLUXO DE AR|PRESSAO ESTATICA|FAN HUB|CONTROLADORA SATA|CONECTOR FRONT PANEL|PINO USB|CONECTOR DE AUDIO|CONECTOR RJ45|FIBRA OPTICA|ACCESS POINT|REPETIDOR|MESH WIFI|BANDA 2.4 GHZ|BANDA 5 GHZ|WPA2|WPA3|ENDERECO IPV6|NAT|PORT FORWARDING|VLAN|POE|RAID 0|RAID 1|RAID 5|OVERclock|THERMAL THROTTLING|GARGALO DE DESEMPENHO|ELETRICIDADE ESTATICA|ATERRAMENTO|FONTE MODULAR|CERTIFICACAO 80 PLUS|PASTA TERMICA|SO DIMM|DIMM|UEFI SECURE BOOT|TPM|GPT|MBR|CLUSTER|FRAGMENTACAO|DESFRAGMENTACAO|SMART DISK|BAD BLOCK|SETORES DO DISCO|CACHE DO NAVEGADOR|COOKIE|CERTIFICADO DIGITAL|CRIPTOGRAFIA AES|CHAVE PUBLICA|CHAVE PRIVADA|BACKUP INCREMENTAL|BACKUP COMPLETO|REPLICACAO|ALTA DISPONIBILIDADE|BALANCEAMENTO DE CARGA|CONTAINER|DOCKER|GIT|REPOSITORIO|DEPLOY|WEBSOCKET|SOCKET IO|NODE JS|NPM|VARIAVEL DE AMBIENTE|LOG DE ERROS|ENDPOINT|LATENCIA DE REDE`.split("|"),
  expert: `ARRAY BIDIMENSIONAL|REFERENCIA ABSOLUTA|REFERENCIA RELATIVA|TABELA ESTRUTURADA|MACRO VBA|POWER QUERY|POWER PIVOT|DASHBOARD|INDICE CORRESP|PROCV ANINHADO|FUNCAO LOGICA|FUNCAO DE TEXTO|FUNCAO DE DATA|FORMATACAO PERSONALIZADA|QUEBRA DE SECAO|ESTILO DE PARAGRAFO|CONTROLE DE ALTERACOES|SUMARIO AUTOMATICO|BANCO RELACIONAL|CHAVE ESTRANGEIRA|CONSULTA SQL|NORMALIZACAO DE DADOS|INTEGRIDADE REFERENCIAL|ENDERECO MAC|SUBREDE|MASCARA DE REDE|GATEWAY PADRAO|ROTEAMENTO|NAT|VLAN|POE|RAID 0|RAID 1|RAID 5|OVERCLOCK|THERMAL THROTTLING|GARGALO DE DESEMPENHO|ELETRICIDADE ESTATICA|ATERRAMENTO|CONECTOR ATX|CONECTOR EPS|PCI EXPRESS|SATA|M2 NVME|FREQUENCIA DE CLOCK|CACHE L3|THREAD|NUCLEO|FIRMWARE|RECUPERACAO DE SISTEMA|PONTO DE RESTAURACAO|IMAGEM DE DISCO|CLONAGEM DE DISCO|DEPURACAO|COMPILADOR|INTERPRETADOR|API REST|JSON PARSE|DOM VIRTUAL|EVENT LOOP|PROMISE|ASYNC AWAIT|CONSULTA PARAMETRIZADA|INDICE CLUSTERIZADO|PROCEDURE|TRIGGER SQL|VIEW SQL|ACID|TRANSACAO|DEADLOCK|REPLICACAO DE BANCO|DATA WAREHOUSE|ETL|OLAP|OLTP|BUSINESS INTELLIGENCE|POWER BI|DAX|M LINGUAGEM|MODELO DE DADOS|RELACIONAMENTO UM PARA MUITOS|CHAVE COMPOSTA|NORMALIZACAO TERCEIRA FORMA|INJECAO SQL|CROSS SITE SCRIPTING|CSRF|ZERO DAY|PRIVILEGIO MINIMO|TOKEN DE ACESSO|OAUTH|SAML|CERTIFICADO TLS|HANDSHAKE TLS|CRIPTOGRAFIA ASSIMETRICA|CRIPTOGRAFIA SIMETRICA|FUNCAO HASH|SALT CRIPTOGRAFICO|SEGMENTACAO DE REDE|IDS|IPS|SIEM|HONEYPOT|PRINCIPIO DE MENOR PRIVILEGIO|DISASTER RECOVERY|RPO|RTO|SNAPSHOT|CONTAINER ORQUESTRADO|KUBERNETES|CI CD|PIPELINE DE DEPLOY|CONTROLE DE VERSAO|MERGE CONFLICT|PULL REQUEST|BRANCH GIT|COMMIT HASH|TESTE UNITARIO|TESTE DE INTEGRACAO|TESTE DE REGRESSAO|REFATORACAO|PADRAO MVC|ORIENTACAO A OBJETOS|ENCAPSULAMENTO|HERANCA|POLIMORFISMO|RECURSAO|COMPLEXIDADE BIG O|ARVORE BINARIA|TABELA HASH|FILA DE PRIORIDADE|GRAFO DIRECIONADO|BUSCA EM LARGURA|BUSCA EM PROFUNDIDADE|CRIPTOGRAFIA DE DISCO|SECURE BOOT|TPM 2.0|IOMMU|ECC RAM|NUMA|THUNDERBOLT|USB C|DISPLAYPORT|REFRESH RATE|TEMPO DE RESPOSTA|CALIBRACAO DE COR|HDR|VRAM|RAY TRACING|DLSS|FSR|BIOS FLASHBACK|CLEAR CMOS|VRM|FASE DE ALIMENTACAO|BATERIA CMOS|SENSOR TERMICO|CURVA DE VENTOINHA|UNDERVOLT|BENCHMARK|STRESS TEST|MEMTEST|SMART|TRIM SSD|WEAR LEVELING|OVERPROVISIONING|CACHE SLC|CONTROLADORA NVME|FILA DE COMANDOS|LATENCIA DE MEMORIA|LARGURA DE BANDA DE MEMORIA`.split("|")
};
const WORDS = [...new Set(Object.values(WORD_BANK).flat())];
const POWERS = {
  shield: { label: "🛡️ Escudo", description: "Protege você de uma explosão" },
  time: { label: "⏱️ Tempo extra", description: "Adiciona 4 segundos se você estiver com a bomba" },
  jam: { label: "⚡ Sabotagem", description: "Reduz em 3 segundos o próximo fusível de um rival" }
};

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
    message: room.message,
    totalCorrect: room.totalCorrect,
    difficulty: room.difficulty,
    power: room.players.get(io.sockets.sockets.get(room.hostId)?.id)?.power || null,
    powers: [...room.players.values()].map(p => ({ id: p.id, power: p.power }))
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function alivePlayers(room) {
  return [...room.players.values()].filter(p => p.alive);
}
function chooseWord(room) {
  const tier = room.difficulty >= 4 ? "expert" : room.difficulty >= 3 ? "avancado" : room.difficulty >= 2 ? "medio" : "basico";
  const eligible = Object.entries(WORD_BANK).filter(([level]) => ({basico:1,medio:2,avancado:3,expert:4}[level]) <= room.difficulty).flatMap(([, list]) => list);
  const candidates = eligible.filter(w => w !== room.lastWord);
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
  const difficultyPenalty = Math.min(5000, (room.difficulty - 1) * 1200);
  const fuseMs = crypto.randomInt(Math.max(4500, 9000 - difficultyPenalty), Math.max(8000, 19001 - difficultyPenalty));
  const recipient = room.players.get(playerId);
  const penalty = recipient?.fusePenalty ? 3000 : 0;
  if (recipient?.fusePenalty) recipient.fusePenalty = false;
  room.deadline = Date.now() + Math.max(3000, fuseMs - penalty);
  room.timer = setTimeout(() => explode(room.code), Math.max(0, room.deadline - Date.now()));
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
    if (holder.power === "shield") {
      holder.power = null;
      room.message = `🛡️ ${holder.name} usou o escudo e sobreviveu à explosão!`;
      io.to(room.code).emit("power:used", { playerId: holder.id, message: room.message });
    } else {
      holder.alive = false;
      room.message = `💥 BOOM! ${holder.name} foi eliminado!`;
      io.to(room.code).emit("game:explosion", { playerId: holder.id, playerName: holder.name });
    }
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
      totalCorrect: 0, difficulty: 1,
      winnerId: null, message: "Aguardando jogadores...", timer: null, lastWord: ""
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, score: 0, correct: 0, eliminations: 0, power: null, nextPowerAt: 3 });
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
    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, score: 0, correct: 0, eliminations: 0, power: null, nextPowerAt: 3 });
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
    room.totalCorrect += 1;
    if (room.totalCorrect % 10 === 0) {
      room.difficulty = Math.min(4, 1 + Math.floor(room.totalCorrect / 10));
      room.message = `🚀 RODADA ${room.difficulty}: dificuldade aumentada!`; 
      io.to(room.code).emit("round:up", { round: room.difficulty, totalCorrect: room.totalCorrect });
    }
    if (!player.power && player.correct >= player.nextPowerAt && Math.random() < 0.85) {
      const choices = ["shield", "time", "jam"];
      player.power = choices[crypto.randomInt(choices.length)];
      player.nextPowerAt = player.correct + 4;
      io.to(socket.id).emit("power:earned", { power: player.power, ...POWERS[player.power] });
    }
    // Automatically pass to a random surviving opponent.
    const next = targets[crypto.randomInt(targets.length)];
    room.message = `⚡ ${player.name} acertou e passou a bomba para ${next.name}!${room.totalCorrect % 10 === 0 ? ` 🚀 Dificuldade aumentou para nível ${room.difficulty}!` : ""}`;
    startBomb(room, next.id);
    emitRoom(room);
    callback({ ok: true, message: "Correto! Bomba passada!" });
  });

  socket.on("power:use", ({ targetId } = {}, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (!room || room.status !== "playing" || !player || !player.alive) return callback({ ok: false, error: "Você não pode usar poder agora." });
    if (!player.power) return callback({ ok: false, error: "Você ainda não tem um poder." });
    const power = player.power;
    if (power === "shield") {
      callback({ ok: false, error: "O escudo é automático: ele protege você da próxima explosão." });
      return;
    }
    if (power === "time") {
      if (room.bombHolderId !== socket.id) return callback({ ok: false, error: "O tempo extra só pode ser usado quando a bomba estiver com você." });
      room.deadline += 4000;
      player.power = null;
      room.message = `⏱️ ${player.name} ganhou 4 segundos extras!`;
      stopTimer(room);
      room.timer = setTimeout(() => explode(room.code), Math.max(0, room.deadline - Date.now()));
      emitRoom(room);
      io.to(room.code).emit("power:used", { playerId: player.id, message: room.message });
      return callback({ ok: true, message: "4 segundos adicionados!" });
    }
    if (power === "jam") {
      const target = room.players.get(targetId);
      if (!target || !target.alive || target.id === player.id) return callback({ ok: false, error: "Escolha um rival que ainda esteja vivo." });
      target.fusePenalty = true;
      player.power = null;
      room.message = `⚡ ${player.name} sabotou o próximo fusível de ${target.name}!`;
      emitRoom(room);
      io.to(room.code).emit("power:used", { playerId: player.id, message: room.message });
      return callback({ ok: true, message: `Sabotagem aplicada em ${target.name}!` });
    }
    callback({ ok: false, error: "Poder desconhecido." });
  });

  socket.on("disconnect", () => leaveRoom(socket));
  socket.on("room:leave", () => {
    leaveRoom(socket);
    socket.leaveAll();
  });
});

server.listen(PORT, () => console.log(`Bomba da Informática rodando na porta ${PORT}`));

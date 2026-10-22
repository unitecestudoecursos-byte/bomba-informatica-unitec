const socket = io();
const $ = id => document.getElementById(id);
const sections = ["entry","lobby","game","finished"];
let roomState = null;
let myId = null;
let timerFrame = null;
let lastExplosion = 0;
const socketIdReady = new Promise(resolve => socket.on("connect", () => { myId = socket.id; resolve(); }));
function showSection(id){ sections.forEach(s => $(s).classList.toggle("hidden",s!==id)); }
function toast(msg){ const el=$("toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2400); }
function entryError(msg){$("entryError").textContent=msg||"";}
function emitAck(event,payload){return new Promise(resolve=>socket.emit(event,payload||{},resolve));}
function nameValue(){return $("playerName").value.trim();}
async function createRoom(){
  entryError("");
  const r=await emitAck("room:create",{name:nameValue()});
  if(!r?.ok){entryError(r?.error||"Não foi possível criar a sala.");return;}
  $("roomCode").textContent=r.code; $("gameRoomCode").textContent=r.code;
  showSection("lobby");
}
async function joinRoom(){
  entryError("");
  const r=await emitAck("room:join",{name:nameValue(),code:$("roomCodeInput").value});
  if(!r?.ok){entryError(r?.error||"Não foi possível entrar.");return;}
  $("roomCode").textContent=r.code; $("gameRoomCode").textContent=r.code;
  showSection("lobby");
}

const powerNames = { shield: "🛡️ Escudo — protege de uma explosão", time: "⏱️ Tempo extra — +4 segundos quando a bomba estiver com você", jam: "⚡ Sabotagem — reduz 3 segundos do próximo fusível de um rival" };
$("usePowerBtn").addEventListener("click", async()=>{
  const targetId = $("powerTarget").value;
  const r = await emitAck("power:use", { targetId });
  toast(r?.ok ? (r.message || "Poder utilizado!") : (r?.error || "Não foi possível usar o poder."));
});
socket.on("power:earned", data=>toast("✨ PODER CONQUISTADO: " + (data.label || data.power) + "!"));
socket.on("round:up", data=>toast("🚀 NÍVEL " + data.round + "! As palavras ficaram mais difíceis."));

$("createBtn").addEventListener("click",createRoom);
$("joinBtn").addEventListener("click",joinRoom);
$("playerName").addEventListener("keydown",e=>{if(e.key==="Enter")createRoom()});
$("roomCodeInput").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("roomCode").textContent);toast("Código copiado!")}catch{toast("Código da sala: "+$("roomCode").textContent)}});
$("startBtn").addEventListener("click",async()=>{const r=await emitAck("game:start");if(!r?.ok)toast(r?.error||"Não foi possível iniciar.")});
$("wordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const input=$("wordInput"); if(!input.value.trim())return;
  const r=await emitAck("word:submit",{word:input.value});
  $("wordFeedback").textContent=r?.message||r?.error||"";
  $("wordFeedback").className="feedback "+(r?.ok?"good":"bad");
  if(r?.ok)input.value="";
  else { input.select(); }
});
$("backBtn").addEventListener("click",()=>location.reload());
socket.on("connect",()=>{myId=socket.id;});
socket.on("room:update",state=>{
  roomState=state;
  $("roomCode").textContent=state.code;$("gameRoomCode").textContent=state.code;
  $("playerCount").textContent=`${state.players.length} / 20`;
  const host=state.hostId===socket.id;
  $("hostArea").classList.toggle("hidden",!host||state.status!=="lobby");
  $("waitingText").classList.toggle("hidden",state.status!=="lobby"||host);
  $("lobbyPlayers").innerHTML=state.players.map(p=>`<div class="player-chip ${p.id===socket.id?"me":""}">${esc(p.name)}${p.id===socket.id?'<span class="mini">VOCÊ</span>':""}</div>`).join("");
  if(state.status==="lobby")showSection("lobby");
  if(state.status==="playing"){
    showSection("game");
    $("roundNum").textContent=String(state.round).padStart(2,"0");
    $("aliveCount").textContent=state.players.filter(p=>p.alive).length;
    const me=state.players.find(p=>p.id===socket.id);
    $("myScore").textContent=me?.score??0;
    const myPower = state.powers?.find(p=>p.id===socket.id)?.power || null;
    $("myPower").textContent = myPower ? (powerNames[myPower] || myPower) : "Nenhum poder no momento — continue acertando para ganhar um!";
    const canUse = !!myPower && myPower !== "shield" && (myPower !== "time" || state.bombHolderId === socket.id);
    $("usePowerBtn").disabled = !canUse;
    $("usePowerBtn").textContent = myPower === "shield" ? "ESCUDO AUTOMÁTICO" : "USAR PODER";
    const currentTarget = $("powerTarget").value;
    $("powerTarget").innerHTML = state.players.filter(p=>p.alive && p.id!==socket.id).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    if ([...$("powerTarget").options].some(o=>o.value===currentTarget)) $("powerTarget").value=currentTarget;
    $("powerTarget").classList.toggle("hidden", myPower !== "jam");
    $("wordPrompt").textContent=state.currentWord||"…";
    $("gameMessage").textContent=state.message||"";
    const holding=state.bombHolderId===socket.id;
    $("wordInput").disabled=!holding;
    $("wordForm").querySelector("button").disabled=!holding;
    if(holding){$("wordFeedback").textContent="A bomba está com você! Digite rápido!";$("wordFeedback").className="feedback";if(document.activeElement!==$("wordInput"))$("wordInput").focus();}
    else if(me&&!me.alive){$("wordFeedback").textContent="Você foi eliminado. Continue acompanhando!";$("wordFeedback").className="feedback bad";}
    else {$("wordFeedback").textContent="Aguarde a bomba chegar até você...";$("wordFeedback").className="feedback";}
    const sorted=[...state.players].sort((a,b)=>(b.alive-a.alive)||(b.score-a.score)||a.name.localeCompare(b.name));
    $("scorePlayers").innerHTML=sorted.map((p,i)=>`<div class="score-row ${p.id===state.bombHolderId?"holder":""} ${p.alive?"":"dead"}"><span class="rank">${String(i+1).padStart(2,"0")}</span><span class="score-name">${esc(p.name)}${p.id===socket.id?" <small>VOCÊ</small>":""}<small>${p.alive?(p.id===state.bombHolderId?"💣 COM A BOMBA":"● SOBREVIVENTE"):"✕ ELIMINADO"} · ${p.correct} acertos</small></span><span class="score-value">${p.score}</span></div>`).join("");
  }
  if(state.status==="finished")renderFinished(state);
});
socket.on("game:explosion",data=>{lastExplosion=Date.now();$("bomb").classList.add("urgent");toast("💥 BOOM! "+data.playerName+" foi eliminado!");setTimeout(()=>$("bomb").classList.remove("urgent"),1200)});
socket.on("game:finished",()=>{if(roomState)renderFinished({...roomState,status:"finished"})});
function renderFinished(state){
  showSection("finished");
  const winner=state.players.find(p=>p.id===state.winnerId);
  $("winnerTitle").textContent=winner?winner.name+" VENCEU!":"FIM DE JOGO!";
  $("winnerMessage").textContent=winner?"Último sobrevivente da Bomba da Informática!":"A partida terminou sem vencedor.";
  const sorted=[...state.players].sort((a,b)=>(b.alive-a.alive)||(b.score-a.score)||(b.correct-a.correct));
  $("finalRanking").innerHTML=sorted.map((p,i)=>`<div class="final-row"><span>${["🥇","🥈","🥉"][i]||"#"+(i+1)} ${esc(p.name)}</span><b>${p.score} pts · ${p.correct} acertos</b></div>`).join("");
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
// Client display timer is visual only; server owns the actual deadline.
function animateTimer(){
  if(roomState?.status==="playing"&&roomState.deadline){
    const left=Math.max(0,roomState.deadline-Date.now());
    const total=19000;
    $("timerText").textContent=(left/1000).toFixed(1)+"s";
    $("timerFill").style.width=Math.min(100,left/total*100)+"%";
    const urgent=left<4500;
    $("timerText").classList.toggle("urgent",urgent);
    $("bomb").classList.toggle("urgent",urgent);
  }else{
    $("timerText").textContent="--.-s";$("timerFill").style.width="100%";$("timerText").classList.remove("urgent");
  }
  requestAnimationFrame(animateTimer);
}
animateTimer();

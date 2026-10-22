# Bomba da Informática — Unitec Battle

Jogo multiplayer de digitação para até 20 alunos, com sala por código, bomba com tempo aleatório, eliminação e ranking.

## Requisitos
- Node.js 18 ou superior
- Uma plataforma/servidor com suporte a Node.js e WebSocket (por exemplo, Render, Railway ou servidor próprio)

## Executar localmente
1. Instale o Node.js.
2. Extraia o ZIP e abra um terminal na pasta `bomba_informatica_unitec`.
3. Execute:
   ```bash
   npm install
   npm start
   ```
4. Abra `http://localhost:3000` no computador que estiver executando o servidor.
5. Para testar em outros dispositivos na mesma rede, abra `http://IP-DO-COMPUTADOR:3000`.
   Para jogar pela internet, publique a aplicação em uma hospedagem Node.js e compartilhe a URL pública.

## Como jogar
1. O professor cria a sala e compartilha o código de 5 caracteres.
2. Os alunos entram com nome/apelido.
3. O criador inicia quando houver pelo menos 2 jogadores.
4. Quem recebe a bomba digita a palavra mostrada. Ao acertar, o servidor passa a bomba automaticamente para outro sobrevivente.
5. O fusível tem duração aleatória entre 9 e 19 segundos. Quando acaba, o portador é eliminado.
6. A partida termina quando resta um sobrevivente.

## Importante
- A partida é sincronizada pelo servidor; o cronômetro exibido no navegador é apenas visual, e o servidor decide quando a bomba explode.
- Esta é uma primeira versão funcional. Ela não tem persistência de estatísticas entre partidas, login, moderação ou reconexão de jogadores.
- O servidor guarda as salas em memória. Reiniciar a aplicação encerra as partidas em andamento.
- Para uso em aula, publique numa hospedagem confiável e teste com alguns dispositivos antes de usar com a turma toda.
- A lista de palavras fica no array `WORDS` em `server.js`. O sistema ignora acentos, espaços e pontuação na resposta, para facilitar palavras como “PLACA MÃE”.

# Publicar Bomba da Informática — Unitec Battle na internet

## 1. Enviar o projeto ao GitHub
1. Entre em https://github.com e crie uma conta ou entre na sua.
2. Clique em `+` > `New repository`.
3. Nome: `bomba-informatica-unitec`.
4. Marque `Public` (necessário para o fluxo mais simples) e clique em `Create repository`.
5. Na página do repositório, clique em `uploading an existing file`.
6. Extraia este ZIP no computador. Abra a pasta `bomba_informatica_unitec` e arraste os arquivos e a pasta `public` para a página do GitHub. Não envie um ZIP dentro do repositório; envie os arquivos extraídos.
7. Clique em `Commit changes`.

## 2. Publicar no Render
1. Entre em https://render.com e crie uma conta/entre.
2. No painel, clique em `New` > `Web Service`.
3. Conecte o GitHub e autorize o acesso ao repositório `bomba-informatica-unitec`.
4. Selecione esse repositório.
5. Configure/Confira:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type/Plan: `Free`
6. Clique em `Create Web Service` e espere o deploy terminar.
7. Abra a URL `https://...onrender.com` que o Render mostrar.

O arquivo `render.yaml` também registra as configurações padrão do serviço para ferramentas do Render que usem Blueprint.

## Importante
- O link do Render é o que você compartilha com os alunos. Não compartilhe `localhost:3000`.
- No plano gratuito, o serviço pode dormir após 15 minutos sem tráfego e demorar cerca de um minuto para voltar. Para uma aula, abra o link alguns minutos antes e faça um teste com dois dispositivos.
- O estado das salas e da partida fica em memória; se o servidor reiniciar/suspender, a partida em andamento pode ser perdida. Crie a sala somente depois de abrir o link e confirmar que o jogo está carregado.

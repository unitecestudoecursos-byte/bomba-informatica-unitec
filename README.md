# UNITEC Game Center

Plataforma integrada com dois jogos: Bomba da Digitação (`/bomba`) e Show de Milhões (`/milhao`). A página inicial `/` permite escolher o jogo.

## Publicar no Render
- Build Command: `npm install`
- Start Command: `npm start`
- Node.js 18 ou superior.

O projeto usa um único servidor HTTP e dois namespaces Socket.IO isolados (`/bomba` e `/milhao`) para impedir conflito entre eventos dos jogos.

## Rotas
- `/` central de jogos
- `/bomba` Bomba da Digitação (multiplayer e treinamento individual)
- `/milhao` Show de Milhões
- `/health` verificação de funcionamento


## Google AdSense
O script do editor AdSense foi incluído nas três páginas públicas (menu, Bomba da Digitação e Show de Milhões), usando o ID de publicação `ca-pub-4868608569810070` e carregamento assíncrono.

Para os anúncios aparecerem, o domínio publicado precisa estar cadastrado e aprovado no AdSense, e os Anúncios automáticos precisam estar ativados na conta. O código do editor, sozinho, não garante a exibição de anúncios. Não foram criados blocos manuais porque o código fornecido não contém IDs `data-ad-slot`.

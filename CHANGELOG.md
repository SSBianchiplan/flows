# Changelog

## 2.1.0 — 2026-10-19
- PWA instalável no celular e no computador: `manifest.webmanifest` (GPlanSiS|Flows / Flows, standalone, pt-BR), ícones PNG 192, 512 e 512 maskable e apple-touch-icon 180 gerados do `favicon.svg` (o favicon SVG continua o ícone da aba), metas `theme-color` (claro/escuro) e `apple-mobile-web-app-*`.
- Service worker `/sw.js` (escopo raiz): HTML rede-primeiro com cópia para abrir sem rede; shell (JS, CSS, fontes, ícones) cache-primeiro por versão; nunca intercepta `/api/*` nem requisições que não sejam GET; apaga caches de versões anteriores. A versão do cache é `2.1.0-<hash dos arquivos do app>`, trocada pelo servidor a cada publicação. Só registra na janela principal (não dentro da Mesa/iframe).
- Servidor: serve `manifest.webmanifest` (application/manifest+json, no-cache), `sw.js` (application/javascript, no-cache) e os PNG; CSP inalterada (manifest e worker cabem em `default-src`/`script-src 'self'`).
- Celular: cabeçalho sem rolagem horizontal da página (barra de botões rolável, marca e nome do documento recolhidos em telas estreitas), alvos de toque ≥ 40 px, campos com 16 px (sem zoom automático no iOS), gavetas de Formas e Propriedades com animação e safe-area, toque no desenho fecha a gaveta, um dedo no vazio move a vista (dois dedos aproximam), faixa de ferramentas só com ícones em paisagem baixa, minimapa oculto no celular.

## 2.0.0 — 2026-10-19
- Plataforma multiusuário: backend FastAPI + SQLite servindo app e API num contêiner.
- Login com sessão segura (scrypt, cookie HttpOnly/Secure/SameSite=Strict, bloqueio por tentativas, CSRF), troca obrigatória de senha provisória.
- Admin master único (contato@gplansis.com); papéis master, administrador, gestor, editor, operador e leitor; 16 permissões granulares, personalizáveis por usuário e conferidas no servidor a cada gravação.
- Documentos no servidor: gravação automática, controle de versão otimista com resolução de conflito, presença em tempo real, histórico de versões (automáticas, nomeadas, de publicação) com restauração, compartilhamento por pessoa ou organização, lixeira, duplicar, importar.
- Configurações: perfil com avatar (recorte e zoom) ou iniciais com cor, segurança (senha, sessões), preferências sincronizadas.
- Administração: painel com indicadores, usuários, matriz de papéis, auditoria do servidor encadeada por SHA-256 (verificação e CSV), configurações do sistema.
- IA pelo servidor (Claude, streaming) quando ANTHROPIC_API_KEY estiver definida; publicação e tarefas registram o usuário conectado.
- Implantação em flows.gplansis.com (Caddy, 127.0.0.1:8999).

## 1.0.0 — 2026-10-19
- Primeira versão de produção do GPlanSiS|Flows.
- Diagramação: 7 grupos de formas (BPMN 2.0, Integrações, Fluxograma, Básico, TI, Industrial, Organograma), AutoConexão, conectores ortogonais com desvio de formas, pools e raias, páginas, temas, layout automático.
- BPM: validação estrutural, simulação de eventos discretos determinística, mapa de calor, replay, cenário base, motor de execução com caixa de tarefas, portão humano para IA, publicação versionada com SHA-256, trilha de auditoria encadeada.
- Integração: atividades de chamada entre páginas, mapa de fluxos integrados, BPMN 2.0 com DI (ida e volta), DXF para o GPlanSiS|Drawings.
- Pacote: fontes locais, CSP restrita, nginx não root, compose com Traefik.

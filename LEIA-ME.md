# GPlanSiS|Flows 2.1

Diagramação estilo Visio com módulo BPM (validação, simulação, execução com caixa de tarefas, auditoria) — agora multiusuário: login, papéis e permissões, documentos no servidor com versões, compartilhamento, presença em tempo real, configurações com avatar e administração.

Produção: **https://flows.gplansis.com** (`/opt/flows`, contêiner `gplansis-flows` em `127.0.0.1:8999`, TLS no Caddy).

## Conteúdo

| Caminho | Uso |
|---|---|
| `app/index.html` | Editor (diagramação e BPM). Com a plataforma, só inicia depois do login |
| `app/manifest.webmanifest`, `app/sw.js`, `app/icon-*.png`, `app/apple-touch-icon.png` | PWA: manifesto, service worker e ícones (gerados do `favicon.svg`) |
| `app/plataforma.js`, `app/plataforma.css` | Login, central de documentos, sincronização, configurações, administração |
| `server/app.py` | API FastAPI + SQLite (`/data/flows.db`); serve também os arquivos de `app/` |
| `deploy/Dockerfile`, `deploy/docker-compose.yml` | Imagem Python, usuário não root, FS somente leitura, `127.0.0.1:8999` |
| `deploy/flows.caddy` | Bloco do Caddy para `flows.gplansis.com` |
| `deploy/.env.example` | `FLOWS_MASTER_EMAIL`, `FLOWS_MASTER_PASSWORD` (só 1ª subida), `ANTHROPIC_API_KEY` |
| `exemplos/` | Documento de exemplo, BPMN, SVG e DXF |

## Acesso

- **Admin master**: `contato@gplansis.com`. Único, não pode ser rebaixado, desativado nem excluído. Senha provisória definida na primeira subida; a troca é obrigatória no primeiro acesso.
- Contas novas são criadas em **Configurações › Usuários** (senha provisória gerada e exibida uma vez; troca obrigatória).
- Senhas com scrypt; sessão em cookie HttpOnly + Secure + SameSite=Strict; bloqueio de 15 min após 8 senhas erradas; proteção CSRF por cabeçalho e origem.

## Papéis e permissões

| Papel | Resumo |
|---|---|
| Admin master | Tudo. Único. |
| Administrador | Tudo; só o master cria ou altera administradores |
| Gestor de processos | Todos os documentos, publica versões, executa, aprova IA, vê auditoria |
| Editor | Cria, edita, compartilha, simula e executa os próprios documentos |
| Operador | Vê o que foi compartilhado, simula e conclui tarefas |
| Leitor | Somente visualiza |

16 permissões granulares (`docs.*`, `bpm.*`, `ai.use`, `export`, `audit.view`, `users.manage`, `system.settings`) — personalizáveis por pessoa. O servidor confere cada gravação: quem não edita o modelo não altera formas; quem não publica não muda versão de processo; quem não executa não mexe em instâncias.

## Documentos

- Gravação automática no servidor com controle de versão otimista; **conflito de edição** detectado com três saídas (recarregar, salvar como cópia, sobrescrever — só o dono).
- Presença: avatares de quem está no mesmo documento; atualização automática quando outra pessoa grava.
- Histórico: ponto automático a cada 10 min de edição (60 últimos), versões nomeadas e de publicação; restaurar guarda antes o estado atual.
- Compartilhar por pessoa (ver/editar) ou para a organização (ver/editar). Lixeira com restauração.
- Alterações que não chegaram ao servidor (queda de rede, sessão expirada) ficam no navegador e são oferecidas para recuperação.

## Configurações

Perfil (nome, cargo, departamento, **avatar com recorte e zoom** ou iniciais com cor), Segurança (senha, sessões abertas), Preferências (tema, abrir ao entrar, grade/guias/minimapa). Administração: Painel, Usuários, Papéis e permissões, Auditoria (cadeia SHA-256 com verificação e CSV) e Sistema (organização, aviso global, duração de sessão, política de senha, papel padrão, IA).

## IA

Proxy no servidor para o Claude (`claude-opus-5-5`, streaming, fallback do lado do servidor). Cadastre a chave em **Configurações › Sistema › Inteligência artificial** (salvar, testar conexão, remover); ela fica só no servidor e o navegador vê apenas o início e o fim. Alternativa: `ANTHROPIC_API_KEY` em `/opt/flows/deploy/.env` (a chave do painel tem precedência). Toda proposta de IA nas tarefas exige aprovação humana.

## Operação

```bash
# atualizar (da máquina local, na raiz do pacote; HOST = seu servidor SSH)
rsync -a --delete --exclude deploy/.env --exclude dados app server deploy exemplos $HOST:/opt/flows/
ssh $HOST 'cd /opt/flows && docker compose -f deploy/docker-compose.yml up -d --build'

# backup do banco (consistente com WAL)
ssh $HOST 'docker exec gplansis-flows python -c "import sqlite3;s=sqlite3.connect(\"/data/flows.db\");d=sqlite3.connect(\"/data/backup.db\");s.backup(d)"'

# logs
ssh $HOST 'docker logs -f gplansis-flows'   # e /var/log/caddy/flows.log
```

Desenvolvimento local: `FLOWS_DATA=./dados FLOWS_SECURE_COOKIE=0 FLOWS_MASTER_PASSWORD=... uvicorn app:app --app-dir server --port 8899`.

## Aplicativo (PWA) e celular

- **Instalar**: no Chrome/Edge do computador, ícone de instalar na barra de endereço (ou menu › Instalar GPlanSiS|Flows); no Android, menu › Instalar aplicativo; no iPhone/iPad (Safari), Compartilhar › Adicionar à Tela de Início. Abre em janela própria, com o ícone do Flows.
- **Service worker** (`/sw.js`, escopo `/`): guarda só o shell estático (HTML, JS, CSS, fontes, ícones). Documentos, login, IA e tudo em `/api/*` vão sempre ao servidor — nada de dado do usuário fica no cache do SW. Sem rede, o app abre e avisa "Servidor indisponível"; alterações não enviadas continuam no navegador, como antes.
- **Versão do cache**: o servidor substitui `__BUILD__` em `sw.js` por `2.1.0-<hash dos arquivos de app/>`. Toda publicação que muda algum arquivo troca a versão; o SW novo instala, assume e apaga os caches antigos — não é preciso editar o `sw.js` a cada publicação.
- **Celular**: Formas e Propriedades abrem como gavetas (botões no topo); toque numa forma da gaveta e depois no desenho para inserir; um dedo no vazio move a vista, dois dedos aproximam; ajustar zoom no seletor do rodapé. Renomear o documento fica em Arquivo › Renomear (o nome some do topo em telas < 400 px).
- Dentro da Mesa (iframe) o SW não é registrado; o Flows funciona como antes.

## Atalhos principais

V selecionar · C conector · T texto · H mão · F ajustar · Ctrl+Z/Y · Ctrl+C/V/D · Ctrl+G · Del · duplo clique edita texto · setas azuis ao passar o mouse criam a próxima forma ligada.

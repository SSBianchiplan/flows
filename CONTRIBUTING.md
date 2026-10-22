# Como contribuir com o GPlanSiS|Flows

Obrigado pelo interesse! Este guia explica como propor mudanças de forma que a revisão seja rápida.

## Antes de começar
- Leia o [código de conduta](CODE_OF_CONDUCT.md).
- Para mudanças maiores que uma correção pontual, **abra uma issue primeiro** (modelos "Ideia" ou "Bug") e combine a abordagem.
- Falhas de segurança **não** vão em issue pública: siga a [política de segurança](SECURITY.md).

## Ambiente de desenvolvimento
```bash
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
FLOWS_DATA=./dados FLOWS_SECURE_COOKIE=0 FLOWS_MASTER_EMAIL=admin@exemplo.com \
FLOWS_MASTER_PASSWORD='SenhaProvisoria123' .venv/bin/uvicorn app:app --app-dir server --port 8899 --reload
```
Abra <http://localhost:8899>. O frontend (`app/`) não tem etapa de build: edite e recarregue a página (se o service worker segurar uma versão antiga, use recarga forçada ou desregistre-o nas ferramentas do navegador).

## Organização do código
- `app/index.html` — editor de diagramas e módulo BPM (HTML, CSS e JS no mesmo arquivo).
- `app/plataforma.js` / `plataforma.css` — login, documentos, configurações e administração.
- `server/app.py` — API FastAPI + SQLite; toda regra de permissão é conferida aqui.
- `deploy/` — Dockerfile, compose e bloco do Caddy.

## Regras do projeto
- **Interface em português do Brasil**, textos curtos e diretos.
- **Sem dependências de build no frontend** e sem CDN: tudo é servido localmente (a CSP bloqueia origens externas).
- **Permissão no servidor**: qualquer ação nova precisa ser validada em `server/app.py`, não só escondida na interface.
- **Auditoria**: ações relevantes registram evento na trilha encadeada.
- **IA propõe, humano decide**: nenhuma ação de IA altera dados sem aprovação explícita.
- Nunca inclua segredos, `.env`, bancos (`dados/`) ou dados reais de usuários em commits ou capturas.
- Python: siga o estilo do arquivo (tipagem, funções curtas); rode `python -m py_compile server/app.py` antes de enviar.

## Pull requests
1. Faça um fork e crie uma branch a partir de `main` (`feat/…`, `fix/…`, `docs/…`).
2. Commits pequenos, com mensagem no imperativo explicando o porquê.
3. Preencha o modelo do PR: o que mudou, como testou, capturas se mexer na interface.
4. Atualize o `CHANGELOG.md` quando a mudança for visível para quem usa.

## Dúvidas
Abra uma issue com o modelo "Pergunta" ou escreva para contato@gplansis.com.

"""GPlanSiS|Flows 2.0 — API e servidor da aplicação.

Um processo, um SQLite em /data. Sessão por cookie HttpOnly, papéis com
permissões granulares, documentos no servidor com controle de versão otimista,
compartilhamento, presença, trilha de auditoria encadeada (SHA-256) e proxy de IA.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse

VERSION = "2.1.0"
DATA_DIR = Path(os.environ.get("FLOWS_DATA", "/data"))
STATIC_DIR = Path(os.environ.get("FLOWS_STATIC", Path(__file__).resolve().parent.parent / "app"))
DB_PATH = DATA_DIR / "flows.db"
MASTER_EMAIL = os.environ.get("FLOWS_MASTER_EMAIL", "contato@gplansis.com").strip().lower()
SECURE_COOKIE = os.environ.get("FLOWS_SECURE_COOKIE", "1") != "0"
COOKIE = "flows_sid"
MAX_DOC = 12 * 1024 * 1024
MAX_AVATAR = 400 * 1024
AI_MODEL = os.environ.get("FLOWS_AI_MODEL", "claude-opus-5-5")

log = logging.getLogger("flows")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# --------------------------------------------------------------------------- permissões
PERMS: dict[str, str] = {
    "docs.view": "Ver documentos compartilhados com ele",
    "docs.create": "Criar e importar documentos",
    "docs.edit": "Editar diagramas e modelos",
    "docs.delete": "Excluir os próprios documentos",
    "docs.share": "Compartilhar documentos",
    "docs.publish": "Publicar versões de processo (revisor)",
    "docs.all": "Acessar todos os documentos da organização",
    "bpm.simulate": "Validar e simular processos",
    "bpm.execute": "Iniciar e cancelar instâncias",
    "bpm.tasks": "Concluir tarefas da caixa de entrada",
    "bpm.ai_approve": "Aprovar ou rejeitar propostas de IA",
    "ai.use": "Gerar e revisar processos com IA",
    "export": "Exportar arquivos (SVG, PNG, BPMN, DXF, CSV, JSON)",
    "audit.view": "Ver a auditoria do sistema",
    "users.manage": "Gerenciar usuários e permissões",
    "system.settings": "Alterar configurações do sistema",
}
ALL = list(PERMS)
ROLES: dict[str, dict[str, Any]] = {
    "master": {"n": "Admin master", "d": "Controle total. Único e inalterável.", "p": ALL},
    "admin": {"n": "Administrador", "d": "Gerencia usuários, sistema e todos os documentos.", "p": ALL},
    "gestor": {"n": "Gestor de processos", "d": "Publica versões, executa e audita processos.",
               "p": ["docs.view", "docs.create", "docs.edit", "docs.delete", "docs.share", "docs.publish", "docs.all",
                     "bpm.simulate", "bpm.execute", "bpm.tasks", "bpm.ai_approve", "ai.use", "export", "audit.view"]},
    "editor": {"n": "Editor", "d": "Modela, simula e executa os próprios processos.",
               "p": ["docs.view", "docs.create", "docs.edit", "docs.delete", "docs.share", "bpm.simulate",
                     "bpm.execute", "bpm.tasks", "ai.use", "export"]},
    "operador": {"n": "Operador", "d": "Executa tarefas da caixa de entrada.",
                 "p": ["docs.view", "bpm.simulate", "bpm.tasks", "export"]},
    "leitor": {"n": "Leitor", "d": "Somente visualiza o que foi compartilhado.", "p": ["docs.view"]},
}
DEFAULT_SETTINGS = {"org_name": "GPlanSiS|Group", "session_hours": 12, "pw_min": 10, "ai_enabled": True,
                    "default_role": "editor", "banner": ""}
COLORS = ["#b86e00", "#1f6fd1", "#2e7d32", "#8e24aa", "#c62828", "#00838f", "#5d4037", "#3949ab"]

# --------------------------------------------------------------------------- banco
_wlock = threading.RLock()


def connect() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=15000")
    return c


@contextmanager
def tx():
    with _wlock:
        c = connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()


@contextmanager
def ro():
    c = connect()
    try:
        yield c
    finally:
        c.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  pw TEXT NOT NULL, role TEXT NOT NULL, perms TEXT, title TEXT DEFAULT '', dept TEXT DEFAULT '',
  avatar TEXT, color TEXT, prefs TEXT DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, locked_until REAL DEFAULT 0,
  created REAL NOT NULL, last_login REAL, pw_changed REAL);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created REAL NOT NULL, last_seen REAL NOT NULL, ip TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS docs(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL REFERENCES users(id),
  vis TEXT NOT NULL DEFAULT 'private', data TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1,
  size INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL,
  updated REAL NOT NULL, updated_by INTEGER, deleted REAL, last_snap REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS doc_acl(
  doc TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL, PRIMARY KEY(doc, uid));
CREATE TABLE IF NOT EXISTS doc_versions(
  id INTEGER PRIMARY KEY, doc TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE, ver INTEGER NOT NULL,
  data TEXT NOT NULL, by INTEGER, at REAL NOT NULL, note TEXT DEFAULT '', kind TEXT DEFAULT 'auto', size INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_dv ON doc_versions(doc, at);
CREATE TABLE IF NOT EXISTS audit(
  seq INTEGER PRIMARY KEY, at TEXT NOT NULL, uid INTEGER, email TEXT, ev TEXT NOT NULL,
  data TEXT NOT NULL, ip TEXT, prev TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_audit_ev ON audit(ev);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""


def now() -> float:
    return time.time()


def jdump(o: Any) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


# --------------------------------------------------------------------------- senhas
def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
    return "scrypt$32768$8$1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_pw(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                              maxmem=64 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:
        return False



DUMMY_HASH = hash_pw(secrets.token_hex(8))


def temp_password() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    core = "".join(secrets.choice(alphabet) for _ in range(12))
    return core[:4] + "-" + core[4:8] + "-" + core[8:]


def pw_problem(pw: str, minlen: int) -> str | None:
    if len(pw) < minlen:
        return f"A senha precisa ter ao menos {minlen} caracteres."
    if len(pw) > 200:
        return "Senha longa demais."
    kinds = sum(bool(re.search(p, pw)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^\w]"))
    if kinds < 3:
        return "Use ao menos três tipos: minúsculas, maiúsculas, números e símbolos."
    return None


# --------------------------------------------------------------------------- configurações
def ai_key(c: sqlite3.Connection) -> tuple[str, str]:
    r = c.execute("SELECT v FROM settings WHERE k='ai_key'").fetchone()
    if r:
        try:
            k = json.loads(r["v"])
            if k:
                return k, "painel"
        except Exception:
            pass
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return (k, "servidor") if k else ("", "")


def mask_key(k: str) -> str:
    return (k[:7] + "…" + k[-4:]) if k else ""


def get_settings(c: sqlite3.Connection) -> dict:
    s = dict(DEFAULT_SETTINGS)
    for r in c.execute("SELECT k, v FROM settings WHERE k<>'ai_key'"):
        try:
            s[r["k"]] = json.loads(r["v"])
        except Exception:
            pass
    return s


# --------------------------------------------------------------------------- auditoria do servidor
def audit(c: sqlite3.Connection, ev: str, data: dict | None = None, user: dict | None = None, ip: str | None = None):
    last = c.execute("SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
    seq = (last["seq"] + 1) if last else 1
    prev = last["hash"] if last else "0" * 64
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    uid = user["id"] if user else None
    email = user["email"] if user else None
    body = jdump({"seq": seq, "at": at, "uid": uid, "email": email, "ev": ev, "data": data or {}, "ip": ip})
    h = hashlib.sha256((prev + body).encode()).hexdigest()
    c.execute("INSERT INTO audit(seq, at, uid, email, ev, data, ip, prev, hash) VALUES(?,?,?,?,?,?,?,?,?)",
              (seq, at, uid, email, ev, jdump(data or {}), ip, prev, h))


def verify_chain(c: sqlite3.Connection) -> dict:
    prev = "0" * 64
    n = 0
    for r in c.execute("SELECT * FROM audit ORDER BY seq"):
        if r["prev"] != prev:
            return {"ok": False, "at": r["seq"], "why": "elo quebrado (prev não confere)"}
        body = jdump({"seq": r["seq"], "at": r["at"], "uid": r["uid"], "email": r["email"], "ev": r["ev"],
                      "data": json.loads(r["data"]), "ip": r["ip"]})
        if hashlib.sha256((prev + body).encode()).hexdigest() != r["hash"]:
            return {"ok": False, "at": r["seq"], "why": "conteúdo alterado (hash não confere)"}
        prev = r["hash"]
        n += 1
    return {"ok": True, "n": n, "head": prev}


# --------------------------------------------------------------------------- inicialização
def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = connect()
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript(SCHEMA)
    c.commit()
    c.close()
    with tx() as c:
        m = c.execute("SELECT id FROM users WHERE role='master'").fetchone()
        if not m:
            pw = os.environ.get("FLOWS_MASTER_PASSWORD", "").strip()
            generated = False
            if not pw:
                pw = temp_password()
                generated = True
            existing = c.execute("SELECT id FROM users WHERE email=?", (MASTER_EMAIL,)).fetchone()
            if existing:
                c.execute("UPDATE users SET role='master', perms=NULL, active=1 WHERE id=?", (existing["id"],))
            else:
                c.execute("INSERT INTO users(email, name, pw, role, color, must_change, created) VALUES(?,?,?,?,?,?,?)",
                          (MASTER_EMAIL, os.environ.get("FLOWS_MASTER_NAME", "Administrador"), hash_pw(pw), "master", COLORS[0], 1, now()))
            audit(c, "sistema.master_criado", {"email": MASTER_EMAIL})
            if generated:
                log.warning("Senha inicial do master %s: %s (troca obrigatória no primeiro acesso)", MASTER_EMAIL, pw)
        if not c.execute("SELECT 1 FROM audit LIMIT 1").fetchone():
            audit(c, "sistema.iniciado", {"versao": VERSION})


# --------------------------------------------------------------------------- utilidades de usuário
def eff_perms(u: dict) -> list[str]:
    if u["role"] in ("master", "admin"):
        return list(ALL)
    if u.get("perms"):
        try:
            return [p for p in json.loads(u["perms"]) if p in PERMS]
        except Exception:
            pass
    return list(ROLES.get(u["role"], ROLES["leitor"])["p"])


def pub_user(u: dict, full: bool = False) -> dict:
    o = {"id": u["id"], "name": u["name"], "email": u["email"], "avatar": u["avatar"], "color": u["color"] or COLORS[u["id"] % len(COLORS)],
         "role": u["role"], "title": u["title"] or ""}
    if full:
        o.update({"dept": u["dept"] or "", "active": bool(u["active"]), "must_change": bool(u["must_change"]),
                  "created": u["created"], "last_login": u["last_login"], "perms": eff_perms(u),
                  "custom": bool(u["perms"]) and u["role"] not in ("master", "admin"),
                  "locked": (u["locked_until"] or 0) > now()})
    return o


def client_ip(req: Request) -> str:
    xf = req.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()[:64]
    return (req.client.host if req.client else "")[:64]


def need(u: dict, perm: str):
    if perm not in u["_perms"]:
        raise HTTPException(403, f"Sem permissão: {PERMS.get(perm, perm)}")


def current_user(req: Request, allow_must_change: bool = False) -> dict:
    tok = req.cookies.get(COOKIE)
    if not tok:
        raise HTTPException(401, "Sessão ausente")
    sid = hashlib.sha256(tok.encode()).hexdigest()
    with ro() as c:
        s = c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if not s:
            raise HTTPException(401, "Sessão expirada")
        st = get_settings(c)
        if now() - s["last_seen"] > float(st["session_hours"]) * 3600:
            raise HTTPException(401, "Sessão expirada")
        u = c.execute("SELECT * FROM users WHERE id=?", (s["uid"],)).fetchone()
    if not u or not u["active"]:
        raise HTTPException(401, "Usuário inativo")
    u = dict(u)
    if u["must_change"] and not allow_must_change:
        raise HTTPException(428, "Troque a senha para continuar")
    if now() - s["last_seen"] > 60:
        with tx() as c:
            c.execute("UPDATE sessions SET last_seen=? WHERE id=?", (now(), sid))
    u["_perms"] = eff_perms(u)
    u["_sid"] = sid
    return u


# --------------------------------------------------------------------------- acesso a documentos
LEVELS = {"none": 0, "view": 1, "edit": 2, "owner": 3}


def doc_level(c: sqlite3.Connection, u: dict, d: sqlite3.Row) -> str:
    if d["owner"] == u["id"]:
        return "owner"
    if "docs.all" in u["_perms"]:
        return "edit"
    lv = "none"
    a = c.execute("SELECT level FROM doc_acl WHERE doc=? AND uid=?", (d["id"], u["id"])).fetchone()
    if a:
        lv = a["level"]
    if d["vis"] == "org-edit" and LEVELS[lv] < 2:
        lv = "edit"
    elif d["vis"] == "org-view" and LEVELS[lv] < 1:
        lv = "view"
    if lv != "none" and "docs.view" not in u["_perms"]:
        return "none"
    return lv


def load_doc(c: sqlite3.Connection, u: dict, doc_id: str, minimum: str = "view", deleted_ok: bool = False):
    d = c.execute("SELECT * FROM docs WHERE id=?", (doc_id,)).fetchone()
    if not d or (d["deleted"] and not deleted_ok):
        raise HTTPException(404, "Documento não encontrado")
    lv = doc_level(c, u, d)
    if LEVELS[lv] < LEVELS[minimum]:
        raise HTTPException(404 if lv == "none" else 403, "Sem acesso a este documento")
    return d, lv


def model_fp(data: dict) -> str:
    pages = []
    for p in data.get("pages") or []:
        meta = dict(p.get("meta") or {})
        for k in ("version", "status", "hist"):
            meta.pop(k, None)
        pages.append({"id": p.get("id"), "name": p.get("name"), "shapes": p.get("shapes"), "conns": p.get("conns"), "meta": meta})
    return hashlib.sha256(jdump({"n": data.get("name"), "t": data.get("theme"), "r": data.get("res"), "p": pages}).encode()).hexdigest()


def status_fp(data: dict) -> str:
    return jdump([[p.get("id"), (p.get("meta") or {}).get("status")] for p in data.get("pages") or []])


def publish_fp(data: dict) -> str:
    return jdump([[p.get("id"), (p.get("meta") or {}).get("version"), len((p.get("meta") or {}).get("hist") or [])]
                  for p in data.get("pages") or []])


def exec_fp(data: dict) -> str:
    return hashlib.sha256(jdump({k: data.get(k) for k in ("inst", "work", "mail")}).encode()).hexdigest()


def validate_doc(data: Any) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("pages"), list) or not data["pages"]:
        raise HTTPException(400, "Documento inválido: precisa de ao menos uma página")
    name = str(data.get("name") or "Sem título").strip()[:160] or "Sem título"
    data["name"] = name
    return data


def snapshot(c: sqlite3.Connection, doc_id: str, ver: int, data_txt: str, uid: int | None, note: str = "", kind: str = "auto"):
    c.execute("INSERT INTO doc_versions(doc, ver, data, by, at, note, kind, size) VALUES(?,?,?,?,?,?,?,?)",
              (doc_id, ver, data_txt, uid, now(), note, kind, len(data_txt)))
    c.execute("UPDATE docs SET last_snap=? WHERE id=?", (now(), doc_id))
    # mantém as nomeadas/publicadas e as 60 automáticas mais recentes
    c.execute("""DELETE FROM doc_versions WHERE doc=? AND kind='auto' AND id NOT IN
                 (SELECT id FROM doc_versions WHERE doc=? AND kind='auto' ORDER BY at DESC LIMIT 60)""", (doc_id, doc_id))


# --------------------------------------------------------------------------- presença (memória)
PRESENCE: dict[str, dict[int, float]] = {}
_plock = threading.Lock()


def touch_presence(doc_id: str, uid: int) -> list[int]:
    t = now()
    with _plock:
        m = PRESENCE.setdefault(doc_id, {})
        m[uid] = t
        for k in [k for k, v in m.items() if t - v > 20]:
            m.pop(k, None)
        return list(m)


# --------------------------------------------------------------------------- limitador de login
_attempts: dict[str, list[float]] = {}
_alock = threading.Lock()


def throttle(ip: str) -> bool:
    t = now()
    with _alock:
        L = [x for x in _attempts.get(ip, []) if t - x < 600]
        L.append(t)
        _attempts[ip] = L
        return len(L) <= 40


# --------------------------------------------------------------------------- app
app = FastAPI(title="GPlanSiS|Flows", version=VERSION, docs_url=None, redoc_url=None, openapi_url=None)

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
       "frame-ancestors 'self' https://os.gplansis.com")


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("x-requested-with") != "flows":
            return JSONResponse({"detail": "Requisição recusada (CSRF)"}, status_code=403)
        origin = request.headers.get("origin")
        host = request.headers.get("host", "")
        if origin and origin.split("://", 1)[-1] != host:
            return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
    resp = await call_next(request)
    resp.headers.setdefault("Content-Security-Policy", CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.exception_handler(HTTPException)
async def http_err(_req: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.on_event("startup")
def _startup():
    init_db()


async def body(req: Request, limit: int = MAX_DOC + 65536) -> dict:
    raw = await req.body()
    if len(raw) > limit:
        raise HTTPException(413, "Conteúdo grande demais")
    try:
        o = json.loads(raw or b"{}")
    except Exception:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(o, dict):
        raise HTTPException(400, "JSON inválido")
    return o


def me_payload(c: sqlite3.Connection, u: dict) -> dict:
    st = get_settings(c)
    o = pub_user(u, full=True)
    try:
        o["prefs"] = json.loads(u["prefs"] or "{}")
    except Exception:
        o["prefs"] = {}
    o["perms"] = u.get("_perms") or eff_perms(u)
    ai_ok = bool(st.get("ai_enabled")) and bool(ai_key(c)[0])
    return {"user": o, "org": {"name": st["org_name"], "banner": st.get("banner") or "", "pw_min": int(st["pw_min"])},
            "ai": ai_ok, "version": VERSION, "roles": {k: {"n": v["n"], "d": v["d"]} for k, v in ROLES.items()}}


# ---------------- saúde
@app.get("/api/health")
@app.get("/health.json")
def health():
    with ro() as c:
        c.execute("SELECT 1").fetchone()
    return {"status": "ok", "app": "gplansis-flows", "version": VERSION}


# ---------------- autenticação
@app.post("/api/auth/login")
async def login(req: Request):
    b = await body(req, 8192)
    ip = client_ip(req)
    email = str(b.get("email") or "").strip().lower()[:200]
    pw = str(b.get("password") or "")
    if not throttle(ip):
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.")
    # a falha precisa ser gravada (contador, bloqueio, auditoria) antes de responder
    with tx() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        fail = None
        if not u:
            check_pw(pw, DUMMY_HASH)  # mesmo custo de uma conta existente
            audit(c, "auth.falha", {"email": email, "motivo": "desconhecido"}, ip=ip)
            fail = (401, "E-mail ou senha incorretos.")
        else:
            u = dict(u)
            if (u["locked_until"] or 0) > now():
                mins = int(((u["locked_until"] or 0) - now()) / 60) + 1
                fail = (423, f"Conta bloqueada por tentativas erradas. Tente em {mins} min.")
            elif not check_pw(pw, u["pw"]):
                fails = (u["fails"] or 0) + 1
                lock = now() + 900 if fails >= 8 else 0
                c.execute("UPDATE users SET fails=?, locked_until=? WHERE id=?", (0 if lock else fails, lock, u["id"]))
                audit(c, "auth.falha", {"email": email, "motivo": "senha", "bloqueio": bool(lock)}, user=u, ip=ip)
                fail = (401, "E-mail ou senha incorretos.")
            elif not u["active"]:
                audit(c, "auth.falha", {"email": email, "motivo": "inativo"}, user=u, ip=ip)
                fail = (403, "Usuário desativado. Fale com o administrador.")
    if fail:
        raise HTTPException(*fail)
    with tx() as c:
        tok = secrets.token_urlsafe(32)
        sid = hashlib.sha256(tok.encode()).hexdigest()
        c.execute("INSERT INTO sessions(id, uid, created, last_seen, ip, ua) VALUES(?,?,?,?,?,?)",
                  (sid, u["id"], now(), now(), ip, (req.headers.get("user-agent") or "")[:200]))
        c.execute("UPDATE users SET fails=0, locked_until=0, last_login=? WHERE id=?", (now(), u["id"]))
        c.execute("DELETE FROM sessions WHERE last_seen < ?", (now() - 30 * 86400,))
        audit(c, "auth.login", {}, user=u, ip=ip)
        st = get_settings(c)
        u["_perms"] = eff_perms(u)
        payload = me_payload(c, u)
    resp = JSONResponse(payload)
    resp.set_cookie(COOKIE, tok, httponly=True, secure=SECURE_COOKIE, samesite="strict", path="/",
                    max_age=int(float(st["session_hours"]) * 3600) + 86400 * 7)
    return resp


@app.post("/api/auth/logout")
def logout(req: Request):
    tok = req.cookies.get(COOKIE)
    if tok:
        sid = hashlib.sha256(tok.encode()).hexdigest()
        with tx() as c:
            s = c.execute("SELECT uid FROM sessions WHERE id=?", (sid,)).fetchone()
            c.execute("DELETE FROM sessions WHERE id=?", (sid,))
            if s:
                u = c.execute("SELECT id, email FROM users WHERE id=?", (s["uid"],)).fetchone()
                audit(c, "auth.logout", {}, user=dict(u) if u else None, ip=client_ip(req))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@app.get("/api/me")
def me(req: Request):
    u = current_user(req, allow_must_change=True)
    with ro() as c:
        return me_payload(c, u)


@app.patch("/api/me")
async def me_update(req: Request):
    u = current_user(req)
    b = await body(req, MAX_AVATAR + 16384)
    sets, vals = [], []
    if "name" in b:
        n = str(b["name"] or "").strip()[:80]
        if len(n) < 2:
            raise HTTPException(400, "Informe seu nome")
        sets.append("name=?"); vals.append(n)
    for k in ("title", "dept"):
        if k in b:
            sets.append(f"{k}=?"); vals.append(str(b[k] or "").strip()[:80])
    if "color" in b:
        col = str(b["color"] or "")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", col):
            raise HTTPException(400, "Cor inválida")
        sets.append("color=?"); vals.append(col)
    if "avatar" in b:
        av = b["avatar"]
        if av:
            av = str(av)
            if not re.fullmatch(r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", av) or len(av) > MAX_AVATAR:
                raise HTTPException(400, "Imagem de avatar inválida ou grande demais")
        sets.append("avatar=?"); vals.append(av or None)
    if "prefs" in b:
        if not isinstance(b["prefs"], dict):
            raise HTTPException(400, "Preferências inválidas")
        p = jdump(b["prefs"])
        if len(p) > 8000:
            raise HTTPException(400, "Preferências grandes demais")
        sets.append("prefs=?"); vals.append(p)
    if not sets:
        raise HTTPException(400, "Nada para alterar")
    with tx() as c:
        c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, u["id"]))
        changed = [k for k in b if k != "prefs"]
        if changed:
            audit(c, "perfil.atualizado", {"campos": changed}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone())
        nu["_perms"] = eff_perms(nu)
        return me_payload(c, nu)


@app.post("/api/me/password")
async def me_password(req: Request):
    u = current_user(req, allow_must_change=True)
    b = await body(req, 4096)
    cur, new = str(b.get("current") or ""), str(b.get("new") or "")
    if not check_pw(cur, u["pw"]):
        raise HTTPException(400, "A senha atual não confere.")
    with tx() as c:
        st = get_settings(c)
        prob = pw_problem(new, int(st["pw_min"]))
        if prob:
            raise HTTPException(400, prob)
        if check_pw(new, u["pw"]):
            raise HTTPException(400, "A nova senha precisa ser diferente da atual.")
        c.execute("UPDATE users SET pw=?, must_change=0, pw_changed=? WHERE id=?", (hash_pw(new), now(), u["id"]))
        c.execute("DELETE FROM sessions WHERE uid=? AND id<>?", (u["id"], u["_sid"]))
        audit(c, "perfil.senha_trocada", {}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.get("/api/me/sessions")
def me_sessions(req: Request):
    u = current_user(req)
    with ro() as c:
        rows = c.execute("SELECT id, created, last_seen, ip, ua FROM sessions WHERE uid=? ORDER BY last_seen DESC", (u["id"],)).fetchall()
    return [{"id": r["id"][:16], "created": r["created"], "last_seen": r["last_seen"], "ip": r["ip"], "ua": r["ua"],
             "current": r["id"] == u["_sid"]} for r in rows]


@app.delete("/api/me/sessions/{sid}")
def me_session_del(sid: str, req: Request):
    u = current_user(req)
    if not re.fullmatch(r"[0-9a-f]{16}", sid):
        raise HTTPException(400, "Sessão inválida")
    with tx() as c:
        c.execute("DELETE FROM sessions WHERE uid=? AND substr(id,1,16)=? AND id<>?", (u["id"], sid, u["_sid"]))
        audit(c, "perfil.sessao_encerrada", {}, user=u, ip=client_ip(req))
    return {"ok": True}


# ---------------- usuários
@app.get("/api/roles")
def roles(req: Request):
    current_user(req)
    return {"roles": ROLES, "perms": PERMS}


@app.get("/api/directory")
def directory(req: Request):
    current_user(req)
    with ro() as c:
        rows = c.execute("SELECT * FROM users WHERE active=1 ORDER BY name").fetchall()
    return [pub_user(dict(r)) for r in rows]


@app.get("/api/users")
def users_list(req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with ro() as c:
        rows = c.execute("SELECT * FROM users ORDER BY role='master' DESC, active DESC, name").fetchall()
        counts = {r["owner"]: r["n"] for r in c.execute("SELECT owner, COUNT(*) n FROM docs WHERE deleted IS NULL GROUP BY owner")}
        sess = {r["uid"]: r["n"] for r in c.execute("SELECT uid, COUNT(*) n FROM sessions WHERE last_seen>? GROUP BY uid", (now() - 3600,))}
    out = []
    for r in rows:
        o = pub_user(dict(r), full=True)
        o["docs"] = counts.get(r["id"], 0)
        o["online"] = sess.get(r["id"], 0) > 0
        out.append(o)
    return out


def can_touch(actor: dict, target: dict | None, new_role: str | None = None):
    if target and target["role"] == "master" and actor["role"] != "master":
        raise HTTPException(403, "Somente o admin master altera a própria conta.")
    if actor["role"] != "master":
        if (target and target["role"] == "admin") or new_role == "admin":
            raise HTTPException(403, "Somente o admin master gerencia administradores.")
    if new_role == "master":
        raise HTTPException(403, "Existe um único admin master.")
    if new_role and new_role not in ROLES:
        raise HTTPException(400, "Papel inválido")


def clean_perms(p: Any) -> str | None:
    if p is None:
        return None
    if not isinstance(p, list):
        raise HTTPException(400, "Permissões inválidas")
    return jdump(sorted({x for x in p if x in PERMS}))


@app.post("/api/users")
async def users_create(req: Request):
    u = current_user(req)
    need(u, "users.manage")
    b = await body(req, 16384)
    email = str(b.get("email") or "").strip().lower()
    name = str(b.get("name") or "").strip()[:80]
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 200:
        raise HTTPException(400, "E-mail inválido")
    if len(name) < 2:
        raise HTTPException(400, "Informe o nome")
    with tx() as c:
        st = get_settings(c)
        role = str(b.get("role") or st["default_role"])
        can_touch(u, None, role)
        perms = clean_perms(b.get("perms")) if b.get("custom") else None
        if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "Já existe um usuário com este e-mail")
        pw = str(b.get("password") or "") or temp_password()
        if b.get("password"):
            prob = pw_problem(pw, int(st["pw_min"]))
            if prob:
                raise HTTPException(400, prob)
        cur = c.execute("INSERT INTO users(email, name, pw, role, perms, title, dept, color, must_change, created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (email, name, hash_pw(pw), role, perms, str(b.get("title") or "")[:80], str(b.get("dept") or "")[:80],
                         secrets.choice(COLORS), 1, now()))
        nid_ = cur.lastrowid
        audit(c, "usuario.criado", {"id": nid_, "email": email, "papel": role, "personalizado": bool(perms)}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (nid_,)).fetchone())
    return {"user": pub_user(nu, full=True), "temp_password": pw}


@app.patch("/api/users/{uid}")
async def users_update(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    b = await body(req, 16384)
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        t = dict(t)
        new_role = b.get("role") if "role" in b else None
        can_touch(u, t, new_role if new_role != t["role"] else None)
        if t["role"] == "master" and (("role" in b and b["role"] != "master") or b.get("active") is False):
            raise HTTPException(403, "O admin master não pode ser rebaixado nem desativado.")
        if uid == u["id"] and b.get("active") is False:
            raise HTTPException(400, "Você não pode desativar a própria conta.")
        sets, vals, changed = [], [], {}
        if "name" in b:
            n = str(b["name"] or "").strip()[:80]
            if len(n) < 2:
                raise HTTPException(400, "Nome inválido")
            sets.append("name=?"); vals.append(n); changed["nome"] = n
        for k in ("title", "dept"):
            if k in b:
                sets.append(f"{k}=?"); vals.append(str(b[k] or "")[:80]); changed[k] = b[k]
        if "role" in b and t["role"] != "master":
            sets.append("role=?"); vals.append(b["role"]); changed["papel"] = b["role"]
        if "custom" in b and t["role"] != "master":
            p = clean_perms(b.get("perms")) if b["custom"] else None
            sets.append("perms=?"); vals.append(p); changed["permissoes"] = json.loads(p) if p else "padrão do papel"
        if "active" in b:
            sets.append("active=?"); vals.append(1 if b["active"] else 0); changed["ativo"] = bool(b["active"])
            if not b["active"]:
                c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
        if b.get("unlock"):
            sets.append("locked_until=0, fails=0"); changed["desbloqueado"] = True
        if not sets:
            raise HTTPException(400, "Nada para alterar")
        c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, uid))
        audit(c, "usuario.alterado", {"id": uid, "email": t["email"], **changed}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
    return pub_user(nu, full=True)


@app.post("/api/users/{uid}/reset")
def users_reset(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        can_touch(u, dict(t))
        if uid == u["id"]:
            raise HTTPException(400, "Use Configurações › Segurança para trocar a sua senha.")
        pw = temp_password()
        c.execute("UPDATE users SET pw=?, must_change=1, fails=0, locked_until=0 WHERE id=?", (hash_pw(pw), uid))
        c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
        audit(c, "usuario.senha_redefinida", {"id": uid, "email": t["email"]}, user=u, ip=client_ip(req))
    return {"temp_password": pw}


@app.delete("/api/users/{uid}")
def users_delete(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        can_touch(u, dict(t))
        if t["role"] == "master" or uid == u["id"]:
            raise HTTPException(400, "Esta conta não pode ser excluída.")
        n = c.execute("UPDATE docs SET owner=? WHERE owner=?", (u["id"], uid)).rowcount
        c.execute("UPDATE doc_versions SET by=NULL WHERE by=?", (uid,))
        c.execute("UPDATE docs SET updated_by=NULL WHERE updated_by=?", (uid,))
        c.execute("DELETE FROM users WHERE id=?", (uid,))
        audit(c, "usuario.excluido", {"id": uid, "email": t["email"], "docs_transferidos": n}, user=u, ip=client_ip(req))
    return {"ok": True, "transferred": n}


# ---------------- documentos
def doc_row(c: sqlite3.Connection, u: dict, d: sqlite3.Row, lv: str, names: dict) -> dict:
    return {"id": d["id"], "name": d["name"], "owner": names.get(d["owner"]), "vis": d["vis"], "ver": d["ver"],
            "size": d["size"], "pages": d["pages"], "created": d["created"], "updated": d["updated"],
            "updated_by": names.get(d["updated_by"]), "level": lv, "deleted": d["deleted"],
            "mine": d["owner"] == u["id"]}


def user_map(c: sqlite3.Connection) -> dict:
    return {r["id"]: pub_user(dict(r)) for r in c.execute("SELECT * FROM users")}


@app.get("/api/docs")
def docs_list(req: Request, trash: int = 0):
    u = current_user(req)
    with ro() as c:
        names = user_map(c)
        q = "SELECT id, name, owner, vis, ver, size, pages, created, updated, updated_by, deleted FROM docs WHERE "
        q += "deleted IS NOT NULL" if trash else "deleted IS NULL"
        out = []
        for d in c.execute(q + " ORDER BY updated DESC"):
            lv = doc_level(c, u, d)
            if lv == "none":
                continue
            if trash and not (d["owner"] == u["id"] or "docs.all" in u["_perms"]):
                continue
            out.append(doc_row(c, u, d, lv, names))
    return out


@app.post("/api/docs")
async def docs_create(req: Request):
    u = current_user(req)
    need(u, "docs.create")
    b = await body(req)
    data = validate_doc(b.get("data"))
    if b.get("name"):
        data["name"] = str(b["name"]).strip()[:160] or data["name"]
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(txt) > MAX_DOC:
        raise HTTPException(413, "Documento grande demais")
    did = "d" + secrets.token_hex(8)
    vis = b.get("vis") if b.get("vis") in ("private", "org-view", "org-edit") else "private"
    with tx() as c:
        c.execute("INSERT INTO docs(id, name, owner, vis, data, ver, size, pages, created, updated, updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (did, data["name"], u["id"], vis, txt, 1, len(txt), len(data["pages"]), now(), now(), u["id"]))
        snapshot(c, did, 1, txt, u["id"], b.get("origin") or "Criação", "named")
        audit(c, "doc.criado", {"doc": did, "nome": data["name"], "origem": b.get("origin") or "novo"}, user=u, ip=client_ip(req))
        d = c.execute("SELECT * FROM docs WHERE id=?", (did,)).fetchone()
        return doc_row(c, u, d, "owner", user_map(c))


@app.get("/api/docs/{doc_id}")
def docs_get(doc_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_doc(c, u, doc_id)
        row = doc_row(c, u, d, lv, user_map(c))
        row["data"] = json.loads(d["data"])
    touch_presence(doc_id, u["id"])
    return row


@app.get("/api/docs/{doc_id}/head")
def docs_head(doc_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_doc(c, u, doc_id)
        names = user_map(c)
    viewers = [names[i] for i in touch_presence(doc_id, u["id"]) if i in names and i != u["id"]]
    return {"ver": d["ver"], "updated": d["updated"], "updated_by": names.get(d["updated_by"]), "level": lv,
            "name": d["name"], "viewers": viewers, "deleted": bool(d["deleted"])}


@app.put("/api/docs/{doc_id}")
async def docs_save(doc_id: str, req: Request):
    u = current_user(req)
    b = await body(req)
    data = validate_doc(b.get("data"))
    base = int(b.get("base") or 0)
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(txt) > MAX_DOC:
        raise HTTPException(413, "Documento grande demais (limite de 12 MB). Limpe instâncias antigas.")
    with tx() as c:
        d, lv = load_doc(c, u, doc_id)
        names = user_map(c)
        if d["ver"] != base and not b.get("force"):
            return JSONResponse({"detail": "conflito", "ver": d["ver"], "updated": d["updated"],
                                 "updated_by": names.get(d["updated_by"])}, status_code=409)
        if b.get("force") and lv != "owner" and "docs.all" not in u["_perms"]:
            raise HTTPException(403, "Somente o dono pode sobrescrever a versão de outra pessoa.")
        old = json.loads(d["data"])
        can_model = LEVELS[lv] >= 2 and "docs.edit" in u["_perms"]
        model_changed = model_fp(old) != model_fp(data) or status_fp(old) != status_fp(data)
        pub_changed = publish_fp(old) != publish_fp(data)
        exec_changed = exec_fp(old) != exec_fp(data)
        if model_changed and not can_model:
            raise HTTPException(403, "Você pode visualizar, mas não editar este documento.")
        if pub_changed and not (LEVELS[lv] >= 2 and "docs.publish" in u["_perms"]):
            raise HTTPException(403, "Sem permissão para publicar versões.")
        if exec_changed and not (can_model or {"bpm.execute", "bpm.tasks"} & set(u["_perms"])):
            raise HTTPException(403, "Sem permissão para executar processos.")
        ver = d["ver"] + 1
        c.execute("UPDATE docs SET data=?, ver=?, size=?, pages=?, name=?, updated=?, updated_by=? WHERE id=?",
                  (txt, ver, len(txt), len(data["pages"]), data["name"], now(), u["id"], doc_id))
        if pub_changed:
            snapshot(c, doc_id, ver, txt, u["id"], "Publicação de versão de processo", "publish")
            audit(c, "doc.publicado", {"doc": doc_id, "nome": data["name"]}, user=u, ip=client_ip(req))
        elif model_changed and now() - (d["last_snap"] or 0) > 600:
            snapshot(c, doc_id, ver, txt, u["id"])
        if d["name"] != data["name"]:
            audit(c, "doc.renomeado", {"doc": doc_id, "de": d["name"], "para": data["name"]}, user=u, ip=client_ip(req))
        if b.get("force"):
            audit(c, "doc.sobrescrito", {"doc": doc_id, "base": base, "servidor": d["ver"]}, user=u, ip=client_ip(req))
    return {"ver": ver, "updated": now()}


@app.patch("/api/docs/{doc_id}/meta")
async def docs_meta(doc_id: str, req: Request):
    u = current_user(req)
    b = await body(req, 8192)
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit")
        changes = {}
        if "vis" in b:
            if b["vis"] not in ("private", "org-view", "org-edit"):
                raise HTTPException(400, "Visibilidade inválida")
            if not (lv == "owner" or "docs.all" in u["_perms"]) or "docs.share" not in u["_perms"]:
                raise HTTPException(403, "Somente o dono com permissão de compartilhar altera a visibilidade.")
            c.execute("UPDATE docs SET vis=? WHERE id=?", (b["vis"], doc_id)); changes["vis"] = b["vis"]
        if "name" in b:
            if "docs.edit" not in u["_perms"]:
                raise HTTPException(403, "Sem permissão de edição")
            n = str(b["name"] or "").strip()[:160]
            if not n:
                raise HTTPException(400, "Nome inválido")
            data = json.loads(d["data"]); data["name"] = n
            txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            c.execute("UPDATE docs SET name=?, data=?, ver=ver+1, updated=?, updated_by=? WHERE id=?", (n, txt, now(), u["id"], doc_id))
            changes["nome"] = n
        audit(c, "doc.meta", {"doc": doc_id, **changes}, user=u, ip=client_ip(req))
        d = c.execute("SELECT * FROM docs WHERE id=?", (doc_id,)).fetchone()
        return doc_row(c, u, d, lv, user_map(c))


@app.delete("/api/docs/{doc_id}")
def docs_delete(doc_id: str, req: Request, hard: int = 0):
    u = current_user(req)
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit", deleted_ok=bool(hard))
        if not ((lv == "owner" and "docs.delete" in u["_perms"]) or u["role"] in ("master", "admin")):
            raise HTTPException(403, "Somente o dono (ou um administrador) exclui o documento.")
        if hard:
            if not d["deleted"]:
                raise HTTPException(400, "Mova para a lixeira antes de excluir definitivamente.")
            c.execute("DELETE FROM docs WHERE id=?", (doc_id,))
            audit(c, "doc.excluido_definitivo", {"doc": doc_id, "nome": d["name"]}, user=u, ip=client_ip(req))
        else:
            c.execute("UPDATE docs SET deleted=? WHERE id=?", (now(), doc_id))
            audit(c, "doc.lixeira", {"doc": doc_id, "nome": d["name"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/docs/{doc_id}/restore")
def docs_restore(doc_id: str, req: Request):
    u = current_user(req)
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit", deleted_ok=True)
        if not (lv == "owner" or u["role"] in ("master", "admin")):
            raise HTTPException(403, "Sem permissão")
        c.execute("UPDATE docs SET deleted=NULL, updated=? WHERE id=?", (now(), doc_id))
        audit(c, "doc.restaurado", {"doc": doc_id, "nome": d["name"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/docs/{doc_id}/duplicate")
def docs_duplicate(doc_id: str, req: Request):
    u = current_user(req)
    need(u, "docs.create")
    with tx() as c:
        d, _ = load_doc(c, u, doc_id)
        data = json.loads(d["data"])
        data["name"] = (d["name"] + " (cópia)")[:160]
        data["inst"], data["work"], data["mail"] = [], [], {}
        txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        did = "d" + secrets.token_hex(8)
        c.execute("INSERT INTO docs(id, name, owner, vis, data, ver, size, pages, created, updated, updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (did, data["name"], u["id"], "private", txt, 1, len(txt), len(data["pages"]), now(), now(), u["id"]))
        snapshot(c, did, 1, txt, u["id"], "Cópia de " + d["name"], "named")
        audit(c, "doc.duplicado", {"doc": did, "origem": doc_id}, user=u, ip=client_ip(req))
        nd = c.execute("SELECT * FROM docs WHERE id=?", (did,)).fetchone()
        return doc_row(c, u, nd, "owner", user_map(c))


@app.get("/api/docs/{doc_id}/acl")
def acl_get(doc_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_doc(c, u, doc_id)
        names = user_map(c)
        rows = c.execute("SELECT uid, level FROM doc_acl WHERE doc=?", (doc_id,)).fetchall()
    return {"vis": d["vis"], "owner": names.get(d["owner"]), "level": lv,
            "acl": [{"user": names[r["uid"]], "level": r["level"]} for r in rows if r["uid"] in names]}


@app.put("/api/docs/{doc_id}/acl")
async def acl_put(doc_id: str, req: Request):
    u = current_user(req)
    need(u, "docs.share")
    b = await body(req, 65536)
    entries = b.get("acl")
    if not isinstance(entries, list):
        raise HTTPException(400, "Lista inválida")
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit")
        if not (lv == "owner" or "docs.all" in u["_perms"]):
            raise HTTPException(403, "Somente o dono compartilha este documento.")
        c.execute("DELETE FROM doc_acl WHERE doc=?", (doc_id,))
        out = []
        for e in entries[:500]:
            uid = int(e.get("uid") or 0)
            level = e.get("level")
            if level not in ("view", "edit") or uid == d["owner"]:
                continue
            if c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                c.execute("INSERT OR REPLACE INTO doc_acl(doc, uid, level) VALUES(?,?,?)", (doc_id, uid, level))
                out.append({"uid": uid, "level": level})
        if b.get("vis") in ("private", "org-view", "org-edit"):
            c.execute("UPDATE docs SET vis=? WHERE id=?", (b["vis"], doc_id))
        audit(c, "doc.compartilhado", {"doc": doc_id, "acl": out, "vis": b.get("vis")}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.get("/api/docs/{doc_id}/versions")
def versions_list(doc_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        load_doc(c, u, doc_id)
        names = user_map(c)
        rows = c.execute("SELECT id, ver, by, at, note, kind, size FROM doc_versions WHERE doc=? ORDER BY at DESC", (doc_id,)).fetchall()
    return [{"id": r["id"], "ver": r["ver"], "by": names.get(r["by"]), "at": r["at"], "note": r["note"], "kind": r["kind"], "size": r["size"]} for r in rows]


@app.get("/api/docs/{doc_id}/versions/{vid}")
def versions_get(doc_id: str, vid: int, req: Request):
    u = current_user(req)
    with ro() as c:
        load_doc(c, u, doc_id)
        r = c.execute("SELECT data FROM doc_versions WHERE doc=? AND id=?", (doc_id, vid)).fetchone()
    if not r:
        raise HTTPException(404, "Versão não encontrada")
    return {"data": json.loads(r["data"])}


@app.post("/api/docs/{doc_id}/versions")
async def versions_create(doc_id: str, req: Request):
    u = current_user(req)
    b = await body(req, 4096)
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit")
        note = str(b.get("note") or "").strip()[:200] or "Versão nomeada"
        snapshot(c, doc_id, d["ver"], d["data"], u["id"], note, "named")
        audit(c, "doc.versao_salva", {"doc": doc_id, "nota": note, "ver": d["ver"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/docs/{doc_id}/versions/{vid}/restore")
def versions_restore(doc_id: str, vid: int, req: Request):
    u = current_user(req)
    with tx() as c:
        d, lv = load_doc(c, u, doc_id, "edit")
        need(u, "docs.edit")
        r = c.execute("SELECT * FROM doc_versions WHERE doc=? AND id=?", (doc_id, vid)).fetchone()
        if not r:
            raise HTTPException(404, "Versão não encontrada")
        snapshot(c, doc_id, d["ver"], d["data"], u["id"], "Antes de restaurar a versão de " + time.strftime("%d/%m %H:%M", time.localtime(r["at"])), "named")
        data = json.loads(r["data"])
        ver = d["ver"] + 1
        c.execute("UPDATE docs SET data=?, ver=?, size=?, pages=?, name=?, updated=?, updated_by=? WHERE id=?",
                  (r["data"], ver, len(r["data"]), len(data.get("pages") or []), data.get("name") or d["name"], now(), u["id"], doc_id))
        audit(c, "doc.versao_restaurada", {"doc": doc_id, "versao": vid}, user=u, ip=client_ip(req))
    return {"ver": ver}


# ---------------- auditoria e painel
@app.get("/api/audit")
def audit_list(req: Request, limit: int = 200, before: int = 0, q: str = ""):
    u = current_user(req)
    need(u, "audit.view")
    limit = max(1, min(limit, 1000))
    sql, args = "SELECT * FROM audit WHERE 1=1", []
    if before:
        sql += " AND seq<?"; args.append(before)
    if q:
        sql += " AND (ev LIKE ? OR email LIKE ? OR data LIKE ?)"; args += [f"%{q}%"] * 3
    sql += " ORDER BY seq DESC LIMIT ?"; args.append(limit)
    with ro() as c:
        rows = c.execute(sql, args).fetchall()
        total = c.execute("SELECT COUNT(*) n FROM audit").fetchone()["n"]
    return {"total": total, "items": [{"seq": r["seq"], "at": r["at"], "email": r["email"], "ev": r["ev"],
                                       "data": json.loads(r["data"]), "ip": r["ip"], "hash": r["hash"]} for r in rows]}


@app.get("/api/audit/verify")
def audit_verify(req: Request):
    u = current_user(req)
    need(u, "audit.view")
    with ro() as c:
        return verify_chain(c)


@app.get("/api/audit.csv")
def audit_csv(req: Request):
    u = current_user(req)
    need(u, "audit.view")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["seq", "quando_utc", "usuario", "evento", "dados", "ip", "prev", "hash"])
    with ro() as c:
        for r in c.execute("SELECT * FROM audit ORDER BY seq"):
            w.writerow([r["seq"], r["at"], r["email"] or "", r["ev"], r["data"], r["ip"] or "", r["prev"], r["hash"]])
    with tx() as c:
        audit(c, "auditoria.exportada", {}, user=u, ip=client_ip(req))
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="flows_auditoria.csv"'})


@app.get("/api/stats")
def stats(req: Request):
    u = current_user(req)
    if not ({"users.manage", "system.settings", "audit.view"} & set(u["_perms"])):
        raise HTTPException(403, "Sem permissão")
    with ro() as c:
        one = lambda q, *a: c.execute(q, a).fetchone()[0]
        out = {
            "users": one("SELECT COUNT(*) FROM users WHERE active=1"),
            "users_inactive": one("SELECT COUNT(*) FROM users WHERE active=0"),
            "online": one("SELECT COUNT(DISTINCT uid) FROM sessions WHERE last_seen>?", now() - 900),
            "docs": one("SELECT COUNT(*) FROM docs WHERE deleted IS NULL"),
            "trash": one("SELECT COUNT(*) FROM docs WHERE deleted IS NOT NULL"),
            "versions": one("SELECT COUNT(*) FROM doc_versions"),
            "bytes": one("SELECT COALESCE(SUM(size),0) FROM docs") + one("SELECT COALESCE(SUM(size),0) FROM doc_versions"),
            "audit": one("SELECT COUNT(*) FROM audit"),
            "logins_24h": one("SELECT COUNT(*) FROM audit WHERE ev='auth.login' AND at>?", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now() - 86400))),
            "fails_24h": one("SELECT COUNT(*) FROM audit WHERE ev='auth.falha' AND at>?", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now() - 86400))),
            "roles": {r["role"]: r["n"] for r in c.execute("SELECT role, COUNT(*) n FROM users WHERE active=1 GROUP BY role")},
            "ai_key": bool(ai_key(c)[0]),
            "ai_key_source": ai_key(c)[1],
            "ai_model": AI_MODEL,
            "version": VERSION,
            "db_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        }
        days = []
        for i in range(13, -1, -1):
            t0 = time.strftime("%Y-%m-%d", time.gmtime(now() - i * 86400))
            days.append({"d": t0, "n": one("SELECT COUNT(*) FROM audit WHERE substr(at,1,10)=?", t0)})
        out["activity"] = days
        top = c.execute("SELECT ev, COUNT(*) n FROM audit GROUP BY ev ORDER BY n DESC LIMIT 8").fetchall()
        out["top_events"] = [{"ev": r["ev"], "n": r["n"]} for r in top]
    return out


@app.get("/api/settings")
def settings_get(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    with ro() as c:
        s = get_settings(c)
        k, src = ai_key(c)
    s["ai_key_masked"], s["ai_key_source"] = mask_key(k), src
    return s


@app.put("/api/settings/ai-key")
async def ai_key_put(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    b = await body(req, 4096)
    k = str(b.get("key") or "").strip()
    if not re.fullmatch(r"sk-ant-[A-Za-z0-9_\-]{20,200}", k):
        raise HTTPException(400, "Chave inválida: deve começar com sk-ant- (copie do console da Anthropic).")
    with tx() as c:
        c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES('ai_key', ?)", (json.dumps(k),))
        audit(c, "sistema.ia_chave_definida", {"chave": mask_key(k)}, user=u, ip=client_ip(req))
    return {"ok": True, "masked": mask_key(k), "source": "painel"}


@app.delete("/api/settings/ai-key")
def ai_key_delete(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    with tx() as c:
        c.execute("DELETE FROM settings WHERE k='ai_key'")
        audit(c, "sistema.ia_chave_removida", {}, user=u, ip=client_ip(req))
        k, src = ai_key(c)
    return {"ok": True, "masked": mask_key(k), "source": src}


@app.post("/api/settings/ai-key/test")
def ai_key_test(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    import anthropic
    with ro() as c:
        k, _ = ai_key(c)
    if not k:
        raise HTTPException(400, "Nenhuma chave configurada.")
    try:
        m = ai_client(k).models.retrieve(AI_MODEL)
        return {"ok": True, "model": m.id, "name": getattr(m, "display_name", m.id)}
    except anthropic.AuthenticationError:
        raise HTTPException(400, "A Anthropic recusou a chave (inválida ou revogada).")
    except anthropic.PermissionDeniedError:
        raise HTTPException(400, f"A chave não tem acesso ao modelo {AI_MODEL}.")
    except anthropic.NotFoundError:
        raise HTTPException(400, f"Modelo {AI_MODEL} não encontrado para esta conta.")
    except anthropic.APIConnectionError:
        raise HTTPException(502, "Sem conexão com a API da Anthropic a partir do servidor.")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"A Anthropic respondeu {e.status_code}.")


@app.put("/api/settings")
async def settings_put(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    b = await body(req, 16384)
    clean = {}
    if "org_name" in b:
        clean["org_name"] = str(b["org_name"] or "").strip()[:80] or DEFAULT_SETTINGS["org_name"]
    if "banner" in b:
        clean["banner"] = str(b["banner"] or "").strip()[:240]
    if "session_hours" in b:
        clean["session_hours"] = max(1, min(int(b["session_hours"] or 12), 24 * 30))
    if "pw_min" in b:
        clean["pw_min"] = max(8, min(int(b["pw_min"] or 10), 64))
    if "ai_enabled" in b:
        clean["ai_enabled"] = bool(b["ai_enabled"])
    if "default_role" in b:
        if b["default_role"] not in ROLES or b["default_role"] in ("master", "admin"):
            raise HTTPException(400, "Papel padrão inválido")
        clean["default_role"] = b["default_role"]
    with tx() as c:
        for k, v in clean.items():
            c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)", (k, json.dumps(v)))
        audit(c, "sistema.configuracoes", clean, user=u, ip=client_ip(req))
        return get_settings(c)


# ---------------- IA (Claude)
_ai_clients: dict[str, Any] = {}


def ai_client(key: str):
    if key not in _ai_clients:
        import anthropic
        _ai_clients.clear()
        _ai_clients[key] = anthropic.Anthropic(api_key=key, timeout=180.0)
    return _ai_clients[key]


@app.post("/api/ai/sample")
async def ai_sample(req: Request):
    u = current_user(req)
    need(u, "ai.use")
    b = await body(req, 200_000)
    prompt = str(b.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(400, "Prompt vazio")
    with ro() as c:
        st = get_settings(c)
        key, _ = ai_key(c)
    if not st.get("ai_enabled") or not key:
        raise HTTPException(503, "IA desativada neste servidor")
    effort = "low" if b.get("tier") == "quick" else "medium"
    with tx() as c:
        audit(c, "ia.chamada", {"tier": b.get("tier") or "default", "chars": len(prompt)}, user=u, ip=client_ip(req))
    client = ai_client(key)

    def gen():
        try:
            with client.beta.messages.stream(
                model=AI_MODEL,
                max_tokens=16000,
                output_config={"effort": effort},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system="Você é o assistente de processos do GPlanSiS|Flows (BPM industrial). Responda em português do Brasil.",
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    yield text
                final = stream.get_final_message()
                if final.stop_reason == "refusal":
                    yield "\n[A IA recusou esta solicitação.]"
        except Exception as e:  # o cliente mostra a mensagem
            log.exception("falha na IA")
            yield f"\n\u0000ERRO:{type(e).__name__}"

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8", headers={"X-Accel-Buffering": "no"})


# ---------------- estáticos
STATIC_FILES = {"index.html", "plataforma.js", "plataforma.css", "favicon.svg",
                "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "icon-512-maskable.png",
                "apple-touch-icon.png"}
STATIC_TYPES = {"manifest.webmanifest": "application/manifest+json", "sw.js": "application/javascript; charset=utf-8"}
_sw_cache: dict = {}


def build_id() -> str:
    """Hash dos arquivos do app: muda a cada publicação e versiona o cache do service worker."""
    h = hashlib.sha256()
    for f in sorted(STATIC_DIR.rglob("*")):
        if f.is_file() and f.name != "sw.js":
            h.update(f.relative_to(STATIC_DIR).as_posix().encode())
            h.update(f.read_bytes())
    return h.hexdigest()[:12]


def sw_resp() -> Response:
    p = STATIC_DIR / "sw.js"
    key = max(f.stat().st_mtime_ns for f in STATIC_DIR.rglob("*") if f.is_file())
    if _sw_cache.get("k") != key:
        _sw_cache.update(k=key, body=p.read_text(encoding="utf-8").replace("__BUILD__", f"{VERSION}-{build_id()}"))
    return Response(_sw_cache["body"], media_type=STATIC_TYPES["sw.js"],
                    headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})


def static_resp(p: Path, cache: str) -> FileResponse:
    r = FileResponse(p, media_type=STATIC_TYPES.get(p.name))
    r.headers["Cache-Control"] = cache
    return r


@app.get("/fonts/{name}")
def fonts(name: str):
    if not re.fullmatch(r"[\w.-]+", name):
        raise HTTPException(404)
    p = STATIC_DIR / "fonts" / name
    if not p.is_file():
        raise HTTPException(404)
    return static_resp(p, "public, max-age=31536000, immutable")


@app.get("/{name:path}")
def static(name: str):
    if name.startswith("api/"):
        raise HTTPException(404, "Rota inexistente")
    if name == "sw.js" and (STATIC_DIR / name).is_file():
        return sw_resp()
    if name in STATIC_FILES and (STATIC_DIR / name).is_file():
        cache = "no-cache" if name in ("index.html", "plataforma.js", "plataforma.css", "manifest.webmanifest") else "public, max-age=86400"
        return static_resp(STATIC_DIR / name, cache)
    return static_resp(STATIC_DIR / "index.html", "no-cache")

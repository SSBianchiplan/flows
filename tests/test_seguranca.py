"""Correções de segurança (auditoria 2026-10: A2, A10, M1 e achados baixos do Flows).

Rodar na raiz do repositório:  python -m pytest -q tests
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path

import pytest

import app as flows  # noqa: E402  (conftest prepara o ambiente)
from fastapi.testclient import TestClient  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
H = {"X-Requested-With": "flows"}
PW = "Senha-Seg-12345"
XSS = '"><img src=x onerror=alert(1)>'


def db():
    c = sqlite3.connect(flows.DB_PATH)
    c.row_factory = sqlite3.Row
    return c


@pytest.fixture(scope="module")
def srv():
    with TestClient(flows.app) as c:
        with db() as d:
            d.execute("UPDATE users SET must_change=0 WHERE role='master'")
            for email, role in (("sec-editor@example.com", "editor"), ("sec-leitor@example.com", "leitor"),
                                ("sec-operador@example.com", "operador"), ("sec-alvo@example.com", "editor")):
                d.execute("INSERT OR IGNORE INTO users(email,name,pw,role,created) VALUES(?,?,?,?,?)",
                          (email, role.capitalize(), flows.hash_pw(PW), role, time.time()))
        yield c


def login(email: str, pw: str = PW, ip: str = "10.0.0.1") -> TestClient:
    c = TestClient(flows.app, client=(ip, 5000))
    r = c.post("/api/auth/login", json={"email": email, "password": pw}, headers=H)
    assert r.status_code == 200, r.text
    return c


def mal_doc() -> dict:
    return {"name": "Doc <b>", "theme": 'x" onload="y', "pages": [{
        "id": 'p1"><svg onload=alert(1)>', "name": XSS,
        "shapes": [{"id": 's1" onmouseover="alert(1)', "t": "task", "x": "10", "y": 'y"', "w": 120, "h": 60, "rot": "1;",
                    "txt": XSS, "st": {"f": 'red" onload="alert(1)', "s": "#1f6fd1", "t": "url(javascript:1)",
                                       "dash": '1" x="', "sw": "2", "fs": "x", "b": "sim", "al": "<x>", "zz": 'a"b'},
                    "d": {"lanes": [{"id": "l<1>", "n": XSS, "h": '1"'}], "conn": '"><x', "cost": '5"',
                          "page": "p<", "dur": {"dist": '"x', "a": "1", "b": "<"}, "fields": "a:" + XSS}}],
        "conns": [{"id": "c1<", "a": {"s": 's1" onmouseover="alert(1)'}, "b": {"x": "1e3", "y": '"'},
                   "rt": "<x>", "ft": '"', "txt": XSS, "st": {"s": "blue;x:1", "arrow": "<"}, "d": {"prob": '9"'}}],
        "meta": {"status": "Rascunho", "version": '1"', "hist": [{"v": "<1>", "at": 1, "hash": XSS}]}}],
        "res": {XSS: {"cap": '2"', "cost": "x"}},
        "inst": [{"id": "i<1>", "no": '1"', "tokens": [{"node": 's1"', "wait": XSS}], "hist": [], "created": "x"}],
        "work": [{"id": 'w"1', "kind": "<x>", "no": "<", "fields": [{"n": "a", "t": XSS}], "opts": [{"to": '"x', "lbl": "y"}]}],
        "audit": [{"seq": "<1>", "at": "2026", "ev": "x", "data": {}, "prev": XSS, "hash": XSS}]}


def walk(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)
    else:
        yield o


# ------------------------------------------------------------------ A2: XSS armazenado (servidor)
def test_servidor_saneia_documento(srv):
    ed = login("sec-editor@example.com")
    r = ed.post("/api/docs", json={"data": mal_doc(), "vis": "org-view"}, headers=H)
    assert r.status_code == 200, r.text
    d = ed.get(f"/api/docs/{r.json()['id']}").json()["data"]
    pg, s, c = d["pages"][0], d["pages"][0]["shapes"][0], d["pages"][0]["conns"][0]
    ids = [pg["id"], s["id"], c["id"], c["a"]["s"], s["d"]["lanes"][0]["id"], d["inst"][0]["id"],
           d["inst"][0]["tokens"][0]["node"], d["work"][0]["id"], d["work"][0]["opts"][0]["to"]]
    assert all(re.fullmatch(r"[\w.:-]+", i) for i in ids), ids
    assert s["st"] == {"s": "#1f6fd1", "sw": 2, "b": 1}           # cor/traço/enum inválidos caem fora
    assert (s["x"], s["y"], s["rot"]) == (10, 0, 0) and "theme" not in d
    assert s["d"]["lanes"][0]["h"] == 150 and s["d"]["cost"] == 0 and "conn" not in s["d"]
    assert s["d"]["dur"] == {"a": 1, "b": 0, "dist": "fixed"}
    assert c["st"] == {} and c["rt"] == "ortho" and "ft" not in c and c["b"] == {"x": 1000, "y": 0}
    assert pg["meta"]["version"] == 0 and pg["meta"]["hist"][0]["hash"] == ""
    assert d["work"][0]["fields"][0]["t"] == "text" and d["work"][0]["kind"] == "msg"
    assert d["res"][XSS[:80]] == {"cap": 1, "cost": 0}
    assert s["txt"] == XSS                                          # texto continua texto (o cliente escapa)
    # nenhum valor que vai para atributo SVG/HTML sem escape carrega aspas ou <>
    attr_vals = [pg["id"], s["id"], c["id"], *s["st"].values(), s["x"], s["y"], s["w"], s["h"], s["rot"]]
    assert not any(isinstance(v, str) and re.search(r"[\"'<>]", v) for v in attr_vals)


def test_saneamento_idempotente_e_preserva_exemplos():
    for f in (ROOT / "exemplos").glob("*.json"):
        raw = json.loads(f.read_text(encoding="utf-8"))
        docs = raw if isinstance(raw, list) else [raw]
        for d in docs:
            if isinstance(d, dict) and isinstance(d.get("pages"), list):
                once = flows.sanitize_doc(json.loads(json.dumps(d)))
                assert flows.sanitize_doc(json.loads(json.dumps(once))) == once
                assert once["pages"] == d["pages"], f"exemplo {f.name} alterado pelo saneamento"


@pytest.mark.skipif(not shutil.which("node"), reason="node ausente")
def test_paridade_saneador_cliente_servidor():
    html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    m = re.search(r"(const SAN=\(\(\)=>\{.*?\}\)\(\);)", html, re.S)
    assert m, "SAN não encontrado no index.html"
    js = ("const newPage=n=>({id:'p0',name:n||'P',shapes:[],conns:[],meta:{}});" + m.group(1) +
          "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.stringify(SAN.doc(JSON.parse(s)))))")
    for d in [mal_doc(), *[x for f in (ROOT / "exemplos").glob("*.json") for x in [json.loads(f.read_text(encoding="utf-8"))]
                           if isinstance(x, dict) and "pages" in x]]:
        out = subprocess.run(["node", "-e", js], input=json.dumps(d), capture_output=True, text=True, check=True).stdout
        assert json.loads(out) == flows.sanitize_doc(json.loads(json.dumps(d)))


# ------------------------------------------------------------------ A2: leitura não grava; trilha gerada no servidor
def chain_ok(A: list) -> bool:
    """Mesmo algoritmo do verifyAudit() do cliente."""
    for i, e in enumerate(A):
        if i and e["prev"] != A[i - 1]["hash"]:
            return False
        body = json.dumps({"seq": e["seq"], "at": e["at"], "ev": e["ev"], "data": e["data"]}, ensure_ascii=False, separators=(",", ":"))
        if hashlib.sha256((e["prev"] + body).encode()).hexdigest() != e["hash"]:
            return False
    return True


@pytest.fixture()
def shared_doc(srv):
    ed = login("sec-editor@example.com")
    d = {"name": "Proc", "pages": [{"id": "p1", "name": "P", "shapes": [], "conns": [], "meta": {}}],
         "inst": [], "work": [], "mail": {}, "audit": []}
    r = ed.post("/api/docs", json={"data": d, "vis": "org-view"}, headers=H).json()
    did = r["id"]
    cur = ed.get(f"/api/docs/{did}").json()
    cur["data"]["audit"].append({"seq": 1, "at": "x", "ev": "modelo.revisao", "data": {"page": "P"}, "prev": "0" * 64, "hash": "a" * 64})
    r = ed.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": cur["data"]}, headers=H)
    assert r.status_code == 200, r.text
    return ed, did


def test_leitor_nao_grava_na_trilha(srv, shared_doc):
    _, did = shared_doc
    rd = login("sec-leitor@example.com")
    cur = rd.get(f"/api/docs/{did}").json()
    assert cur["level"] == "view"
    before = json.loads(json.dumps(cur["data"]["audit"]))
    # 1) acrescentar registro
    d = json.loads(json.dumps(cur["data"]))
    d["audit"].append({"seq": 2, "at": "x", "ev": "forjado", "data": {}, "prev": before[-1]["hash"], "hash": "b" * 64})
    r = rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H)
    assert r.status_code == 403
    # 2) adulterar/apagar registro existente: ignorado (append-only), nada gravado
    d = json.loads(json.dumps(cur["data"]))
    d["audit"][0]["data"] = {"page": "adulterado"}
    r = rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H)
    assert r.status_code == 200 and r.json()["ver"] == cur["ver"] and r.json()["audit"] == before
    d["audit"][0]["hash"] = "c" * 64                                # registro "novo" disfarçado: recusado
    assert rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H).status_code == 403
    d = json.loads(json.dumps(cur["data"])); d["audit"] = []
    assert rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H).status_code == 200
    # 3) qualquer outra parte do documento (inclusive chave desconhecida) exige edição
    d = json.loads(json.dumps(cur["data"])); d["extra"] = XSS
    assert rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H).status_code == 403
    d = json.loads(json.dumps(cur["data"])); d["pages"][0]["meta"]["hist"] = [{"v": 1, "at": 1, "hash": "d" * 64}]
    assert rd.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H).status_code == 403
    after = rd.get(f"/api/docs/{did}").json()
    assert after["data"]["audit"] == before and after["ver"] == cur["ver"]


def test_trilha_carimbada_pelo_servidor(srv, shared_doc):
    ed, did = shared_doc
    cur = ed.get(f"/api/docs/{did}").json()
    A = cur["data"]["audit"]
    assert len(A) == 1 and chain_ok(A)
    assert A[0]["data"]["_por"] == "Editor" and A[0]["cli"] == "a" * 64 and A[0]["at"] != "x"
    # editor tenta reescrever o passado e forjar autor/horário
    d = json.loads(json.dumps(cur["data"]))
    d["audit"][0]["data"]["page"] = "outra"
    d["audit"].append({"seq": 99, "at": "1999-01-01T00:00:00.000Z", "ev": "<script>", "data": {"_por": "Admin master", "x": 1.0},
                       "prev": "0" * 64, "hash": "e" * 64})
    r = ed.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H)
    assert r.status_code == 200
    A2 = r.json()["audit"]
    assert A2[0] == A[0] and len(A2) == 2 and chain_ok(A2)
    assert A2[1]["seq"] == 2 and A2[1]["ev"] == "evento" and A2[1]["at"] != "1999-01-01T00:00:00.000Z"
    assert A2[1]["data"] == {"x": 1, "_por": "Editor", "_uid": A2[1]["data"]["_uid"]}
    # reenviar a trilha antiga do cliente (hashes do navegador) não duplica registros
    r = ed.put(f"/api/docs/{did}", json={"base": r.json()["ver"], "data": d}, headers=H)
    assert len(r.json()["audit"]) == 2
    assert ed.get(f"/api/docs/{did}").json()["data"]["audit"] == A2


def test_operador_executa_com_nivel_ver_e_e_identificado(srv, shared_doc):
    _, did = shared_doc
    op = login("sec-operador@example.com")
    cur = op.get(f"/api/docs/{did}").json()
    d = json.loads(json.dumps(cur["data"]))
    d["work"] = [{"id": "w1", "kind": "user", "title": "T", "done": True}]
    d["audit"].append({"seq": 5, "at": "x", "ev": "exec.concluida", "data": {}, "prev": "0" * 64, "hash": "f" * 64})
    r = op.put(f"/api/docs/{did}", json={"base": cur["ver"], "data": d}, headers=H)
    assert r.status_code == 200, r.text
    A = r.json()["audit"]
    assert A[-1]["data"]["_por"] == "Operador" and chain_ok(A)


def test_restaurar_versao_mantem_a_trilha(srv, shared_doc):
    ed, did = shared_doc
    vs = ed.get(f"/api/docs/{did}/versions").json()
    vid = (vs["items"] if isinstance(vs, dict) else vs)[-1]["id"]
    before = ed.get(f"/api/docs/{did}").json()["data"]["audit"]
    assert ed.post(f"/api/docs/{did}/versions/{vid}/restore", headers=H).status_code == 200
    A = ed.get(f"/api/docs/{did}").json()["data"]["audit"]
    assert A[:len(before)] == before and A[-1]["ev"] == "doc.versao_restaurada" and chain_ok(A)


# ------------------------------------------------------------------ A2: CSP sem 'unsafe-inline' (nonce)
def test_csp_com_nonce_no_index(srv):
    r1, r2 = srv.get("/"), srv.get("/d/qualquer")
    for r in (r1, r2):
        csp = r.headers["content-security-policy"]
        script_src = re.search(r"script-src ([^;]+)", csp).group(1)
        assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src
        nonce = re.search(r"'nonce-([^']+)'", script_src).group(1)
        tags = re.findall(r"<script\b[^>]*>", r.text, re.I)
        assert tags and all(f'nonce="{nonce}"' in t for t in tags)
        assert "script-src-attr 'none'" in csp
    assert re.search(r"nonce-([^']+)", r1.headers["content-security-policy"]).group(1) != \
        re.search(r"nonce-([^']+)", r2.headers["content-security-policy"]).group(1)
    js = srv.get("/plataforma.js")
    assert "'unsafe-inline'" not in re.search(r"script-src ([^;]+)", js.headers["content-security-policy"]).group(1)
    assert "nonce-" not in js.headers["content-security-policy"]


def test_sem_handlers_inline_no_front():
    for f in ("index.html", "plataforma.js"):
        t = (ROOT / "app" / f).read_text(encoding="utf-8")
        assert not re.search(r"""\son[a-z]+\s*=\s*["'\\]""", t), f


# ------------------------------------------------------------------ baixos: bloqueio e enumeração
def test_bloqueio_por_conta_e_ip_sem_enumeracao(srv):
    atk = TestClient(flows.app, client=("203.0.113.9", 4000))
    msgs = set()
    for _ in range(flows.LOCK_FAILS):
        r = atk.post("/api/auth/login", json={"email": "sec-alvo@example.com", "password": "errada"}, headers=H)
        assert r.status_code == 401
        msgs.add(r.json()["detail"])
    r = atk.post("/api/auth/login", json={"email": "sec-alvo@example.com", "password": PW}, headers=H)
    assert r.status_code == 401                                     # bloqueado neste IP, mesmo com a senha certa
    msgs.add(r.json()["detail"])
    r = atk.post("/api/auth/login", json={"email": "ninguem@example.com", "password": "x"}, headers=H)
    msgs.add(r.json()["detail"])
    assert r.status_code == 401 and len(msgs) == 1                  # mesma resposta: não revela quais contas existem
    login("sec-alvo@example.com", ip="198.51.100.7")                # o dono, de outro IP, entra normalmente
    assert flows.account_locked("sec-alvo@example.com")
    flows.unlock_account("sec-alvo@example.com")
    login("sec-alvo@example.com", ip="203.0.113.9")


def test_ip_do_cliente_nao_vem_do_cabecalho(srv):
    c = TestClient(flows.app, client=("192.0.2.5", 1))
    r = c.post("/api/auth/login", json={"email": "x@example.com", "password": "x"},
               headers={**H, "X-Forwarded-For": "1.1.1.1"})
    assert r.status_code == 401
    with db() as d:
        ip = d.execute("SELECT ip FROM audit WHERE ev='auth.falha' ORDER BY seq DESC LIMIT 1").fetchone()["ip"]
    assert ip == "192.0.2.5"


def test_csv_da_auditoria_neutraliza_formulas(srv):
    with db() as d:
        pass
    with flows.tx() as c:
        flows.audit(c, "=HYPERLINK(\"http://x\")", {"a": 1}, ip="@SUM(1)")
    m = login("master@example.com", "Senha-Master-123")
    rows = list(csv.reader(io.StringIO(m.get("/api/audit.csv").text.lstrip("﻿")), delimiter=";"))
    row = [r for r in rows if "HYPERLINK" in r[3]][0]
    assert row[3].startswith("'=") and row[5].startswith("'@")


# ------------------------------------------------------------------ A10 / M1: dependências
def test_versoes_das_dependencias():
    import certifi
    import starlette
    v = tuple(int(x) for x in starlette.__version__.split(".")[:3])
    assert v >= (1, 3, 1), starlette.__version__
    assert certifi.__version__ >= "2026.10.19"
    req = (ROOT / "server" / "requirements.txt").read_text()
    assert "starlette==1.9.0" in req and "fastapi==0.149.0" in req and "certifi==2026.10.19" in req


def test_range_multiplo_nao_trava(srv):
    rng = "bytes=" + ",".join(f"{i}-{i}" for i in range(0, 4000, 2))
    t = time.time()
    r = srv.get("/fonts/fonts.css", headers={"Range": rng})
    assert r.status_code in (200, 206, 416) and time.time() - t < 2

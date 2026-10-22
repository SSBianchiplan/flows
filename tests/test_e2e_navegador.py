"""Navegador real (Chromium/Playwright): o documento malicioso gravado *antes* da correção não executa nada,
o editor funciona sob a CSP nova e nenhuma violação de CSP vem do próprio app.

Precisa de:  pip install playwright && playwright install chromium   (pulado se ausente)
"""
from __future__ import annotations

import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

pw = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parent.parent
PAY = '"><img src=x onerror="window.__pwned=1"><svg onload="window.__pwned=2">'


def free_port() -> int:
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


@pytest.fixture(scope="module")
def server():
    data = tempfile.mkdtemp(prefix="flows-e2e-")
    port = free_port()
    env = {**os.environ, "FLOWS_DATA": data, "FLOWS_SECURE_COOKIE": "0", "FLOWS_MASTER_EMAIL": "master@example.com",
           "FLOWS_MASTER_PASSWORD": "Senha-Master-123", "FLOWS_STATIC": str(ROOT / "app")}
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--app-dir", str(ROOT / "server"),
                             "--host", "127.0.0.1", "--port", str(port)], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/api/health"); break
        except Exception:
            time.sleep(0.1)
    db = sqlite3.connect(Path(data) / "flows.db")
    db.execute("UPDATE users SET must_change=0 WHERE role='master'")
    uid = db.execute("SELECT id FROM users WHERE role='master'").fetchone()[0]
    # documento como estaria gravado por um atacante ANTES da correção (sem passar pelo saneamento do servidor)
    doc = {"v": 1, "name": "XSS", "theme": "gplansis", "cur": 0, "res": {PAY: {"cap": PAY, "cost": 1}},
           "pages": [{"id": "p1", "name": PAY, "meta": {"status": "Publicado", "version": 1, "owner": PAY, "desc": PAY,
                                                         "hist": [{"v": PAY, "at": 1, "by": PAY, "hash": PAY}]},
                      "shapes": [{"id": 's1"' + PAY, "t": "task-user", "x": 100, "y": 100, "w": 140, "h": 70, "txt": PAY,
                                  "st": {"f": 'red"' + PAY, "s": PAY, "dash": PAY, "sw": PAY}, "d": {"fields": "a:" + PAY, "conn": PAY}},
                                 {"id": "s2", "t": "pool", "x": 0, "y": 300, "w": 600, "h": 150, "txt": PAY, "st": {},
                                  "d": {"lanes": [{"id": PAY, "n": PAY, "h": PAY}]}}],
                      "conns": [{"id": "c1" + PAY, "a": {"s": 's1"' + PAY}, "b": {"x": 400, "y": 120}, "rt": "ortho",
                                 "txt": PAY, "st": {"s": PAY, "dash": PAY}, "d": {}}]}],
           "inst": [{"id": "i1" + PAY, "no": PAY, "page": "p1", "pname": PAY, "status": "ativa", "vars": {"x": PAY},
                     "tokens": [{"node": "s1", "page": "p1", "wait": PAY}], "hist": [], "created": 1}],
           "work": [{"id": "w1" + PAY, "inst": "i1", "no": PAY, "kind": "user", "title": PAY, "proc": PAY, "page": PAY,
                     "node": PAY, "fields": [{"n": PAY, "t": PAY}], "done": False}],
           "audit": [{"seq": PAY, "at": "2026-01-01T00:00:00.000Z", "ev": PAY, "data": {"x": PAY}, "prev": PAY, "hash": PAY}],
           "mail": {}}
    txt = json.dumps(doc)
    db.execute("INSERT INTO docs(id,name,owner,vis,data,ver,size,pages,created,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
               ("dxss", "XSS", uid, "private", txt, 1, len(txt), 1, time.time(), time.time(), uid))
    db.commit(); db.close()
    yield base
    proc.terminate(); proc.wait(10)


def test_documento_malicioso_nao_executa_e_app_funciona(server):
    with pw.sync_playwright() as p:
        try:
            br = p.chromium.launch()
        except Exception as e:  # navegador não instalado
            pytest.skip(f"chromium indisponível: {e}")
        ctx = br.new_context()
        page = ctx.new_page()
        csp_errors, js_errors = [], []
        page.on("console", lambda m: csp_errors.append(m.text) if "Content Security Policy" in m.text else None)
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        r = page.request.post(server + "/api/auth/login", data={"email": "master@example.com", "password": "Senha-Master-123"},
                              headers={"X-Requested-With": "flows"})
        assert r.ok, r.text()
        page.goto(server + "/#/d/dxss")
        page.wait_for_selector("#svg g.sh", timeout=15000)
        for tab in ("val", "sim", "exec", "inbox", "audit", "map"):
            page.evaluate("t=>{openConsole(t)}", tab)
            page.wait_for_timeout(150)
        page.evaluate("()=>{const s=document.querySelector('#svg g.sh');SEL.clear();SEL.add(s.dataset.id);render();refreshProps()}")
        page.wait_for_timeout(300)
        assert page.evaluate("()=>window.__pwned") is None
        injected = page.evaluate("""()=>[...document.querySelectorAll('*')].filter(el=>[...el.attributes].some(a=>/^on/i.test(a.name))).map(el=>el.outerHTML.slice(0,120))""")
        assert injected == [], injected
        assert page.evaluate("()=>document.querySelectorAll('img[src=x]').length") == 0
        # o texto malicioso aparece como texto
        assert PAY[:20] in page.inner_text("#cbody") or PAY[:20] in page.inner_text("#pbody")
        # app íntegro sob a CSP: o editor desenha e responde; nenhum bloqueio de CSP vindo do próprio app
        assert page.evaluate("()=>document.querySelectorAll('#svg g.sh').length") >= 2
        assert csp_errors == [], csp_errors
        assert js_errors == [], js_errors
        # e a CSP bloqueia handler inline mesmo que algo escape no futuro
        page.evaluate("""()=>{const d=document.createElement('div');d.innerHTML='<img src=x onerror="window.__p2=1">';document.body.appendChild(d)}""")
        page.wait_for_timeout(300)
        assert page.evaluate("()=>window.__p2") is None
        br.close()


def test_edicao_e_trilha_canonica_no_navegador(server):
    with pw.sync_playwright() as p:
        try:
            br = p.chromium.launch()
        except Exception as e:
            pytest.skip(f"chromium indisponível: {e}")
        page = br.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if "Content Security Policy" in m.text else None)
        assert page.request.post(server + "/api/auth/login", data={"email": "master@example.com", "password": "Senha-Master-123"},
                                 headers={"X-Requested-With": "flows"}).ok
        r = page.request.post(server + "/api/docs", headers={"X-Requested-With": "flows"},
                              data={"data": {"name": "Limpo", "pages": [{"id": "p1", "name": "P", "shapes": [], "conns": [], "meta": {}}]}})
        did = r.json()["id"]
        page.goto(server + f"/#/d/{did}")
        page.wait_for_function("()=>typeof doc!=='undefined'&&doc&&doc.name==='Limpo'", timeout=15000)
        # edita (forma nova) e registra na trilha; a gravação automática leva ao servidor
        page.evaluate("()=>{rec();page().shapes.push(mkShape('task',50,50));auditLog('teste.e2e',{a:1});changed()}")
        page.wait_for_function("()=>doc.audit.length===1&&doc.audit[0].data._por", timeout=10000)
        assert page.evaluate("()=>verifyAudit().ok")
        srv = page.request.get(server + f"/api/docs/{did}").json()
        assert len(srv["data"]["pages"][0]["shapes"]) == 1
        assert page.evaluate("()=>JSON.stringify(doc.audit)") == json.dumps(srv["data"]["audit"], ensure_ascii=False, separators=(",", ":"))
        page.wait_for_timeout(1500)
        assert page.evaluate("()=>document.querySelector('#plSync')?.className||''").find("conflict") < 0
        assert srv["ver"] == page.request.get(server + f"/api/docs/{did}").json()["ver"]   # sem regravação em laço
        assert errs == [], errs
        br.close()

"""Ambiente comum dos testes: banco temporário e app importado uma única vez.

Rodar na raiz do repositório:  python -m pytest -q tests
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if "FLOWS_DATA" not in os.environ:
    os.environ.update(FLOWS_DATA=tempfile.mkdtemp(prefix="flows-test-"), FLOWS_SECURE_COOKIE="0",
                      FLOWS_MASTER_EMAIL="master@example.com", FLOWS_MASTER_PASSWORD="Senha-Master-123",
                      FLOWS_STATIC=str(ROOT / "app"))
    os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, str(ROOT / "server"))

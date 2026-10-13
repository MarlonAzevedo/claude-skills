"""Testes do hook ~/.claude/hooks/captura-sessao.py. Rodar: python3 -I ~/.claude/skills/testes/test_captura_sessao.py"""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / "_harness" / "hooks" / "captura-sessao.py"
SESSAO = "abcdef12-3456-7890-abcd-ef1234567890"


def usuario(texto, meta=None):
    return {"type": "user", "isMeta": meta, "cwd": "/home/x/projetos/qrtoken", "gitBranch": "feature/1",
            "message": {"content": [{"type": "text", "text": texto}]}}


def ferramenta(nome, entrada):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": nome, "input": entrada}]}}


def resposta(texto):
    return {"type": "assistant", "message": {"content": [{"type": "text", "text": texto}]}}


class CapturaSessao(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "vault"
        self.vault.mkdir()
        self.transcript = Path(self.tmp.name) / "t.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def rodar(self, eventos, evento="SessionEnd"):
        self.transcript.write_text("\n".join(json.dumps(e) for e in eventos) + "\n", encoding="utf-8")
        entrada = json.dumps({"session_id": SESSAO, "transcript_path": str(self.transcript),
                              "cwd": "/home/x", "hook_event_name": evento})
        r = subprocess.run(["python3", "-I", str(HOOK)], input=entrada, text=True, capture_output=True,
                           env={**os.environ, "CAPTURA_VAULT": str(self.vault)})
        self.assertEqual(r.returncode, 0, r.stderr)
        return sorted((self.vault / "_inbox").glob("*.md")) if (self.vault / "_inbox").exists() else []

    def test_sessao_com_edicao_gera_rascunho(self):
        notas = self.rodar([
            {"type": "ai-title", "aiTitle": "Corrigir login"},
            usuario("corrige o login do qrtoken"),
            usuario("<command-name>/clear</command-name>"),
            usuario("[Image: source: /tmp/x.png]", meta=True),
            ferramenta("Edit", {"file_path": "/home/x/projetos/qrtoken/login.php"}),
            ferramenta("Bash", {"command": "git commit -m \"Corrige login\""}),
            resposta("Pronto, login corrigido."),
        ])
        self.assertEqual(len(notas), 1)
        self.assertEqual(notas[0].name[-15:], "qrtoken-abcdef12.md"[-15:])
        texto = notas[0].read_text(encoding="utf-8")
        self.assertIn("# Corrigir login (qrtoken)", texto)
        self.assertIn("- corrige o login do qrtoken", texto)
        self.assertIn("`/home/x/projetos/qrtoken/login.php`", texto)
        self.assertIn("- Corrige login", texto)
        self.assertIn("login corrigido", texto)
        self.assertNotIn("command-name", texto)
        self.assertNotIn("[Image", texto)

    def test_sessao_trivial_nao_gera_rascunho(self):
        self.assertEqual(self.rodar([usuario("que horas são?"), resposta("10h")]), [])

    def test_mesma_sessao_sobrescreve_o_mesmo_arquivo(self):
        base = [usuario("a"), ferramenta("Write", {"file_path": "/x/a.md"})]
        self.rodar(base, "PreCompact")
        notas = self.rodar(base + [usuario("segundo pedido")], "SessionEnd")
        self.assertEqual(len(notas), 1)
        self.assertIn("segundo pedido", notas[0].read_text(encoding="utf-8"))

    def test_segredos_sao_mascarados(self):
        notas = self.rodar([usuario("usa a chave ctx7sk-aa036575-152e-473a e senha: hunter2"),
                            ferramenta("Edit", {"file_path": "/x/b.php"})])
        texto = notas[0].read_text(encoding="utf-8")
        self.assertNotIn("ctx7sk-aa036575", texto)
        self.assertNotIn("hunter2", texto)
        self.assertIn("[REDACTED]", texto)

    def test_subagente_e_ignorado(self):
        sub = usuario("pedido do subagente")
        sub["isSidechain"] = True
        notas = self.rodar([usuario("principal"), sub, ferramenta("Edit", {"file_path": "/x/c.php"})])
        self.assertNotIn("pedido do subagente", notas[0].read_text(encoding="utf-8"))

    def test_vault_inexistente_nao_quebra(self):
        self.vault.rmdir()
        self.assertEqual(self.rodar([usuario("a"), ferramenta("Edit", {"file_path": "/x"})]), [])


if __name__ == "__main__":
    unittest.main()

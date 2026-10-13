"""Testes de limpar/scripts/candidatos.sh. Rodar: python3 -I ~/.claude/skills/testes/test_limpar_candidatos.py"""
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "limpar" / "scripts" / "candidatos.sh"


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t", "HOME": str(repo), "PATH": "/usr/bin:/bin"})


class Candidatos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        r = cls.repo = Path(cls.tmp.name)
        git(r, "init", "-q")
        arquivos = {
            "src/index.ts": "import { soma } from './usado'\n",
            "src/usado.ts": "export const soma = 1\n",
            "src/esquecido.ts": "export const x = 2\n",
            "src/usado.ts.bak": "old\n",
            "docs/guia (1).md": "copia\n",
            "dist/bundle.js": "built\n",
            "a/igual.txt": "mesmo conteudo\n",
            "b/igual.txt": "mesmo conteudo\n",
            "vazio.txt": "",
            "pkg/__init__.py": "",
            "tests/caso.test.ts": "teste\n",
            "testes/test_regra.py": "teste\n",
            "scripts/test_solto.py": "teste\n",
            "segredo.env": "X=1\n",
            "libs/chart/dist/chart.js": "lib\n",
            "vendor/x/doc/deep-copy.png": "png\n",
            "src/Video copy.jsx": "copia\n",
        }
        for nome, texto in arquivos.items():
            p = r / nome
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(texto)
        git(r, "add", "-A")
        git(r, "commit", "-qm", "base")
        (r / ".gitignore").write_text("*.env\n")
        git(r, "add", ".gitignore")
        git(r, "commit", "-qm", "ignore")
        (r / "screenshot.png").write_bytes(b"\x89PNG")
        (r / "notas.tmp").write_text("tmp\n")
        cls.saida = subprocess.run(["bash", str(SCRIPT), str(r)], capture_output=True, text=True, check=True).stdout

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def secao(self, titulo):
        partes = self.saida.split("\n## ")
        for p in partes:
            if p.startswith(titulo):
                return p
        return ""

    def test_rastreado_ignorado(self):
        self.assertIn("segredo.env", self.secao("Rastreado mas coberto"))

    def test_artefato(self):
        s = self.secao("Artefato")
        self.assertIn("dist/bundle.js", s)
        self.assertNotIn("libs/chart/dist", s)

    def test_lixo_por_nome(self):
        s = self.secao("Lixo por nome")
        for f in ("src/usado.ts.bak", "docs/guia (1).md", "notas.tmp", "src/Video copy.jsx"):
            self.assertIn(f, s)
        self.assertNotIn("deep-copy.png", s)

    def test_nao_rastreado_sem_repetir_lixo(self):
        s = self.secao("Não rastreado")
        self.assertIn("screenshot.png", s)
        self.assertNotIn("notas.tmp", s)

    def test_vazio_ignora_init(self):
        s = self.secao("Vazio")
        self.assertIn("vazio.txt", s)
        self.assertNotIn("__init__.py", s)

    def test_duplicado(self):
        s = self.secao("Duplicado")
        self.assertIn("a/igual.txt", s)
        self.assertIn("b/igual.txt", s)

    def test_orfao(self):
        s = self.secao("Possível órfão")
        self.assertIn("src/esquecido.ts", s)
        self.assertNotIn("src/usado.ts\n", s)
        self.assertNotIn("index.ts", s)
        self.assertNotIn("caso.test.ts", s)
        self.assertNotIn("test_regra.py", s)
        self.assertNotIn("test_solto.py", s)

    def test_nao_apaga_nada(self):
        self.assertTrue((self.repo / "src/esquecido.ts").exists())
        self.assertTrue((self.repo / "screenshot.png").exists())
        self.assertIn("Nada foi apagado", self.saida)


if __name__ == "__main__":
    unittest.main()

"""Testes de revisao/scripts/arquivos.sh. Rodar: python3 -I ~/.claude/skills/testes/test_revisao_arquivos.py"""
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "revisao" / "scripts" / "arquivos.sh"
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
       "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin"}


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   env={**ENV, "HOME": str(repo)})


def escrever(repo, nome, texto):
    p = repo / nome
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(texto)


class Arquivos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        r = cls.repo = Path(cls.tmp.name) / "repo com espaco"
        r.mkdir()
        git(r, "init", "-q", "-b", "develop")
        escrever(r, "src/app.php", "linha1\nlinha2\nlinha3\n")
        escrever(r, "src/remover.js", "x\n")
        git(r, "add", ".")
        git(r, "commit", "-qm", "base")
        git(r, "switch", "-qc", "feature/develop/tarefa-1")
        escrever(r, "src/app.php", "linha1\nlinha2\nmudou\n")
        (r / "src/remover.js").unlink()
        escrever(r, "src/novo.ts", "a\n")
        escrever(r, "testes/test_app.py", "from src import app\n")
        escrever(r, "src/app.spec.ts", "t\n")
        escrever(r, "docs/guia.md", "d\n")
        escrever(r, "AGENTS.md", "a\n")
        escrever(r, ".specs/plano.md", "p\n")
        escrever(r, ".claude/skills/x/SKILL.md", "s\n")
        git(r, "add", ".")
        git(r, "commit", "-qm", "tarefa")
        escrever(r, "src/naocommitado.py", "n\n")  # não rastreado
        cls.saida = cls.rodar()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @classmethod
    def rodar(cls, *extra):
        p = subprocess.run(["bash", str(SCRIPT), str(cls.repo), *extra], capture_output=True, text=True,
                           env={**ENV, "HOME": str(cls.repo)})
        assert p.returncode == 0, p.stderr
        return p.stdout

    def secao(self, nome, saida=None):
        texto = (saida or self.saida).split(f"## {nome}\n", 1)[1]
        return texto.split("\n## ", 1)[0]

    def test_base_pelo_nome_da_branch(self):
        self.assertIn("base: develop", self.saida)

    def test_codigo_lista_alterados_novos_removidos_e_nao_commitados(self):
        codigo = self.secao("CODIGO")
        for nome in ("src/app.php", "src/novo.ts", "src/remover.js", "src/naocommitado.py"):
            self.assertIn(nome, codigo)
        self.assertIn("M\tsrc/app.php", codigo)
        self.assertIn("D\tsrc/remover.js", codigo)
        self.assertIn("?\tsrc/naocommitado.py", codigo)

    def test_testes_e_docs_de_ia_ficam_fora_do_codigo(self):
        codigo = self.secao("CODIGO")
        for nome in ("testes/test_app.py", "src/app.spec.ts", "docs/guia.md", "AGENTS.md", ".specs/plano.md", ".claude/"):
            self.assertNotIn(nome, codigo)
        testes = self.secao("TESTES")
        self.assertIn("testes/test_app.py", testes)
        self.assertIn("src/app.spec.ts", testes)
        ignorados = self.secao("IGNORADOS")
        for nome in ("docs/guia.md", "AGENTS.md", ".specs/plano.md", ".claude/skills/x/SKILL.md"):
            self.assertIn(nome, ignorados)

    def test_link_antigravity_na_primeira_linha_alterada_com_espaco_codificado(self):
        linha = next(l for l in self.secao("CODIGO").splitlines() if "src/app.php" in l)
        self.assertIn("antigravity-ide://file/", linha)
        self.assertIn("repo%20com%20espaco/src/app.php:3", linha)

    def test_removido_nao_tem_link(self):
        linha = next(l for l in self.secao("CODIGO").splitlines() if "src/remover.js" in l)
        self.assertNotIn("antigravity-ide://", linha)

    def test_comando_diff_no_antigravity_com_merge_base(self):
        mb = subprocess.run(["git", "-C", str(self.repo), "merge-base", "develop", "HEAD"],
                            capture_output=True, text=True).stdout.strip()
        linha = next(l for l in self.saida.splitlines() if l.startswith("diff: "))
        self.assertIn("antigravity-ide --wait --diff", linha)
        self.assertIn(f"difftool -y -t ag {mb[:12]}", linha)
        self.assertNotIn("nvim", self.saida)

    def test_sem_teste_lista_codigo_que_nenhum_teste_cita(self):
        sem = self.secao("SEM_TESTE")
        self.assertIn("src/novo.ts", sem)
        self.assertIn("src/naocommitado.py", sem)
        self.assertNotIn("src/app.php", sem)  # citado em testes/test_app.py
        self.assertNotIn("src/remover.js", sem)  # removido

    def test_base_por_argumento(self):
        saida = self.rodar("HEAD~1")
        self.assertIn("base: HEAD~1", saida)
        self.assertIn("src/novo.ts", self.secao("CODIGO", saida))


if __name__ == "__main__":
    unittest.main()

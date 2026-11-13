"""Testes de auditar/scripts/superficie.sh. Rodar: python3 -I ~/.claude/skills/testes/test_auditar_superficie.py"""
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "auditar" / "scripts" / "superficie.sh"


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t", "HOME": str(repo), "PATH": "/usr/bin:/bin"})


class Superficie(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        r = cls.repo = Path(cls.tmp.name)
        git(r, "init", "-q")
        arquivos = {
            # PHP legado sem composer.json, com SQL concatenado em helpers do projeto
            "adm/lista.php": '<?php\n$rs = sqlsrv_query($con, "SELECT * FROM t WHERE id = " . $_GET["id"]);\n'
                             '$r = consulta("SELECT nome FROM p WHERE id = $id");\n'
                             'executa("DELETE FROM p WHERE id = " . $id);\n'
                             'consulta("SELECT 1 FROM t WHERE id = ?", false, array($id));\n',
            "adm/index.php": '<?php\ninclude($_GET["pag"]);\n',
            "azure-pipelines.yml": "trigger:\n- master\nsteps:\n- script: echo $(SENHA)\n",
            ".gitlab-ci.yml": "build:\n  script: make\n",
            "pacote.zip": "PK",
            "login.bak.html": "<html></html>\n",
        }
        for nome, texto in arquivos.items():
            p = r / nome
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(texto)
        git(r, "add", "-A")
        git(r, "commit", "-qm", "base")
        cls.saida = subprocess.run(["bash", str(SCRIPT), str(r)], capture_output=True, text=True, check=True).stdout

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def secao(self, titulo):
        for p in self.saida.split("\n## "):
            if p.startswith(titulo):
                return p
        self.fail(f"seção ausente: {titulo}\n{self.saida}")

    def test_php_detectado_sem_composer(self):
        self.assertIn("PHP", self.secao("Ecossistemas detectados"))

    def test_sql_concatenado_em_helpers(self):
        s = self.secao("SQL raw")
        self.assertIn("adm/lista.php:2:", s)
        self.assertIn("adm/lista.php:3:", s)
        self.assertIn("adm/lista.php:4:", s)
        self.assertNotIn("adm/lista.php:5:", s)  # parametrizado

    def test_include_dinamico(self):
        self.assertIn("adm/index.php:2:", self.secao("Execução dinâmica"))

    def test_ci_fora_do_github(self):
        s = self.secao("CI fora do GitHub")
        self.assertIn("azure-pipelines.yml", s)
        self.assertIn(".gitlab-ci.yml", s)

    def test_binarios_e_copias_rastreados(self):
        s = self.secao("Pacotes, binários e cópias rastreados")
        self.assertIn("pacote.zip", s)
        self.assertIn("login.bak.html", s)


if __name__ == "__main__":
    unittest.main()

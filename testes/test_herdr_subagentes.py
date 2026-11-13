"""Testes de _herdr/subagentes/coletar.py. Rodar: python3 -I ~/.claude/skills/testes/test_herdr_subagentes.py"""
import importlib.util
import json
import os
import tempfile
import time
import unittest
from pathlib import Path

MOD = Path(__file__).resolve().parent.parent / "_herdr" / "subagentes"
spec = importlib.util.spec_from_file_location("coletar", MOD / "coletar.py")
coletar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coletar)


def escrever(p, linhas):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("".join(json.dumps(l) + "\n" for l in linhas))


def envelhecer(p, segundos):
    t = time.time() - segundos
    os.utime(p, (t, t))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()


class Claude(Base):
    def montar(self):
        h = self.home
        (h / ".claude/sessions").mkdir(parents=True)
        (h / ".claude/sessions/100.json").write_text(json.dumps({"pid": 100, "sessionId": "s1"}))
        sub = h / ".claude/projects/-proj/s1/subagents"
        uso = {"input_tokens": 10, "cache_creation_input_tokens": 5, "cache_read_input_tokens": 100, "output_tokens": 7}
        escrever(sub / "agent-a1.jsonl", [
            {"type": "user", "timestamp": "2026-11-13T10:00:00Z", "message": {"content": "tarefa"}},
            {"type": "assistant", "timestamp": "2026-11-13T10:00:05Z", "message": {"id": "m1", "model": "claude-haiku-5-5", "usage": uso,
             "content": [{"type": "text", "text": "ok"}]}},
            {"type": "assistant", "timestamp": "2026-11-13T10:00:06Z", "message": {"id": "m1", "model": "claude-haiku-5-5", "usage": uso,
             "content": [{"type": "tool_use", "name": "Bash", "input": {"description": "Roda os testes"}}]}},
            {"type": "assistant", "timestamp": "2026-11-13T10:01:30Z", "message": {"id": "m2", "model": "claude-haiku-5-5", "usage": uso,
             "content": [{"type": "tool_use", "name": "Read", "input": {"file_path": "/x.php"}}]}},
        ])
        escrever(h / ".claude/projects/-proj/s1.jsonl", [
            {"type": "assistant", "message": {"id": "p1", "content": [{"type": "tool_use", "name": "TodoWrite", "input": {"todos": [
                {"content": "Ler", "status": "completed"}, {"content": "Corrigir", "status": "in_progress"},
                {"content": "Testar", "status": "pending"}]}}]}},
        ])
        (sub / "agent-a1.meta.json").write_text(json.dumps({"agentType": "verificador", "description": "Refutar achado"}))
        escrever(sub / "agent-a2.jsonl", [{"type": "user", "message": {"content": "x"}}])
        (sub / "agent-a2.meta.json").write_text(json.dumps({"agentType": "Explore", "description": "Antigo", "finished": True}))
        envelhecer(sub / "agent-a2.jsonl", 3 * 3600)
        escrever(sub / "agent-a3.jsonl", [{"type": "user", "message": {"content": "x"}}])
        (sub / "agent-a3.meta.json").write_text(json.dumps({"agentType": "general-purpose", "description": "Pronto", "finished": True}))
        return {"address": "t1", "pid": 100, "app": "claude-code", "cwd": "/proj", "inicio": 0}

    def test_lista_rodando_e_recentes(self):
        subs = coletar.claude(self.montar(), self.home, time.time(), {})
        por_id = {s["id"]: s for s in subs}
        self.assertEqual(set(por_id), {"a1", "a3"})  # a2 terminou há 3 h
        self.assertEqual(por_id["a1"]["estado"], "working")
        self.assertEqual(por_id["a1"]["nome"], "verificador")
        self.assertEqual(por_id["a1"]["descricao"], "Refutar achado")
        self.assertEqual(por_id["a1"]["passo"], "Read: /x.php")
        self.assertEqual(por_id["a1"]["modelo"], "haiku-5-5")
        self.assertEqual(por_id["a1"]["passos"], 2)  # m1 aparece em duas linhas
        self.assertEqual(por_id["a1"]["entrada"], 230)
        self.assertEqual(por_id["a1"]["saida"], 14)
        self.assertEqual(por_id["a1"]["cache"], 200)
        self.assertEqual(por_id["a1"]["duracao"], 90)
        self.assertEqual(por_id["a3"]["estado"], "done")

    def test_tarefas_do_agente_principal(self):
        t = self.montar()
        self.assertEqual(coletar.tarefas_claude(t, self.home, {}), [
            {"titulo": "Ler", "status": "completed"}, {"titulo": "Corrigir", "status": "in_progress"},
            {"titulo": "Testar", "status": "pending"}])

    def test_sem_sessao_do_pid(self):
        t = self.montar()
        t["pid"] = 999
        self.assertEqual(coletar.claude(t, self.home, time.time(), {}), [])

    def test_parado_vira_idle(self):
        t = self.montar()
        envelhecer(self.home / ".claude/projects/-proj/s1/subagents/agent-a1.jsonl", 20 * 60)
        subs = {s["id"]: s for s in coletar.claude(t, self.home, time.time(), {})}
        self.assertEqual(subs["a1"]["estado"], "idle")


class Codex(Base):
    def rollout(self, nome, meta, eventos=()):
        d = self.home / ".codex/sessions" / time.strftime("%Y/%m/%d")
        escrever(d / nome, [{"type": "session_meta", "payload": meta}, *eventos])
        return d / nome

    def test_filhos_da_thread_do_terminal(self):
        self.rollout("rollout-raiz.jsonl", {"id": "R", "cwd": "/proj"})
        velha = self.rollout("rollout-outra.jsonl", {"id": "V", "cwd": "/proj"})
        envelhecer(velha, 600)
        self.rollout("rollout-f1.jsonl", {"id": "F1", "cwd": "/proj", "parent_thread_id": "R", "agent_nickname": "Banach",
                                          "agent_role": "explorer", "agent_path": "/root/fr300_code"},
                     [{"type": "turn_context", "timestamp": "2026-11-13T10:00:00Z", "payload": {"model": "gpt-6-sol"}},
                      {"type": "response_item", "timestamp": "2026-11-13T10:00:10Z", "payload": {"type": "function_call", "name": "exec_command",
                                                            "arguments": json.dumps({"cmd": "rg fr300"})}},
                      {"type": "event_msg", "timestamp": "2026-11-13T10:00:40Z", "payload": {"type": "token_count", "info": {"total_token_usage": {
                          "input_tokens": 400, "cached_input_tokens": 300, "output_tokens": 9}}}}])
        self.rollout("rollout-f2.jsonl", {"id": "F2", "cwd": "/proj", "parent_thread_id": "R", "agent_nickname": "Hume",
                                          "agent_role": "worker"},
                     [{"type": "event_msg", "payload": {"type": "task_complete"}}])
        self.rollout("rollout-neto.jsonl", {"id": "N", "cwd": "/proj", "parent_thread_id": "F1", "agent_nickname": "Kant"})
        self.rollout("rollout-alheio.jsonl", {"id": "A", "cwd": "/proj", "parent_thread_id": "V", "agent_nickname": "Outro"})
        t = {"address": "t2", "pid": 1, "app": "codex", "cwd": "/proj", "inicio": time.time() - 300}
        subs = {s["id"]: s for s in coletar.codex(t, self.home, time.time(), {})}
        self.assertEqual(set(subs), {"F1", "F2", "N"})
        self.assertEqual(subs["F1"]["nome"], "Banach (explorer)")
        self.assertEqual(subs["F1"]["descricao"], "fr300_code")
        self.assertEqual(subs["F1"]["passo"], "exec_command: rg fr300")
        self.assertEqual(subs["F1"]["estado"], "working")
        self.assertEqual(subs["F1"]["modelo"], "gpt-6-sol")
        self.assertEqual(subs["F1"]["passos"], 1)
        self.assertEqual(subs["F1"]["entrada"], 400)
        self.assertEqual(subs["F1"]["saida"], 9)
        self.assertEqual(subs["F1"]["cache"], 300)
        self.assertEqual(subs["F1"]["duracao"], 40)
        self.assertEqual(subs["F2"]["estado"], "done")
        self.assertEqual(subs["N"]["nivel"], 2)

    def test_plano_da_thread_raiz(self):
        plano = {"plan": [{"step": "Ler", "status": "completed"}, {"step": "Mudar", "status": "in_progress"}]}
        self.rollout("rollout-raiz.jsonl", {"id": "R", "cwd": "/proj"},
                     [{"type": "response_item", "payload": {"type": "function_call", "name": "update_plan",
                                                            "arguments": json.dumps(plano)}}])
        t = {"address": "t2", "pid": 1, "app": "codex", "cwd": "/proj", "inicio": time.time() - 300}
        self.assertEqual(coletar.tarefas_codex(t, self.home, {}), [
            {"titulo": "Ler", "status": "completed"}, {"titulo": "Mudar", "status": "in_progress"}])

    def test_outra_pasta_nao_entra(self):
        self.rollout("rollout-raiz.jsonl", {"id": "R", "cwd": "/outra"})
        self.rollout("rollout-f1.jsonl", {"id": "F1", "cwd": "/outra", "parent_thread_id": "R"})
        t = {"address": "t2", "pid": 1, "app": "codex", "cwd": "/proj", "inicio": time.time() - 300}
        self.assertEqual(coletar.codex(t, self.home, time.time(), {}), [])


class Incremental(Base):
    def test_continua_de_onde_parou(self):
        p = self.home / "x.jsonl"
        escrever(p, [{"n": 1}, {"n": 2}])
        cache = {}
        soma = lambda e, d: dict(e, total=e["total"] + d["n"])
        self.assertEqual(coletar.acumular(p, cache, {"total": 0}, soma)["total"], 3)
        with open(p, "a") as f:
            f.write(json.dumps({"n": 4}) + "\n" + '{"n": 8')  # linha incompleta fica para depois
        self.assertEqual(coletar.acumular(p, cache, {"total": 0}, soma)["total"], 7)
        with open(p, "a") as f:
            f.write("}\n")
        self.assertEqual(coletar.acumular(p, cache, {"total": 0}, soma)["total"], 15)


class Herdr(Base):
    def test_terminais_filhos_de_qualquer_ia(self):
        pai = {"address": "t3", "app": "pi"}
        todos = [pai,
                 {"address": "t4", "parent": "t3", "name": "review", "app": "gemini", "estado": "working", "msg": "lendo x.rs"},
                 {"address": "t5", "parent": "t9", "name": "outro", "app": "claude-code", "estado": "idle"}]
        subs = coletar.herdr(pai, todos)
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["terminal"], "t4")
        self.assertEqual(subs[0]["nome"], "review (gemini)")
        self.assertEqual(subs[0]["passo"], "lendo x.rs")


class Grupos(Base):
    def test_so_agentes_raiz_e_com_subagentes(self):
        todos = [{"address": "t3", "app": "pi", "where": "w / 1"},
                 {"address": "t4", "parent": "t3", "name": "r", "app": "pi", "estado": "working"},
                 {"address": "t6", "app": "zsh"}]
        g = coletar.grupos(todos, self.home, time.time(), {})
        self.assertEqual([x["terminal"] for x in g], ["t3"])
        self.assertEqual(g[0]["subagentes"][0]["fonte"], "herdr")


if __name__ == "__main__":
    unittest.main()

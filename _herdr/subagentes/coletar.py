#!/usr/bin/env python3
"""Lista os subagentes e as tarefas de cada IA aberta no herdr e imprime JSON para o mod.

Fontes: terminais abertos por um agente com `hc run` (qualquer IA) e o que a IA
grava em disco (Claude Code e Codex). Para outra IA, acrescente uma entrada em
FONTES. Só leitura; o cache da leitura incremental fica em ~/.cache.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RECENTE = 30 * 60  # subagente terminado continua visível por 30 min
PARADO = 10 * 60   # sem escrever há 10 min e sem fim registrado: idle
CACHE = Path.home() / ".cache/herdr-subagentes/cache.json"


def curto(texto, n=90):
    texto = " ".join(str(texto or "").split())
    return texto if len(texto) <= n else texto[: n - 1] + "…"


def ts(texto):
    try:
        return datetime.fromisoformat(str(texto).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def acumular(path, cache, inicial, passo):
    """Aplica `passo` às linhas JSON novas do arquivo, continuando de onde parou."""
    path = str(path)
    item = cache.get(path)
    try:
        tamanho = os.path.getsize(path)
    except OSError:
        return dict(inicial)
    if not item or tamanho < item["pos"]:
        item = {"pos": 0, "est": dict(inicial)}
    with open(path, "rb") as f:
        f.seek(item["pos"])
        bloco = f.read()
    fim = bloco.rfind(b"\n") + 1  # linha incompleta fica para a próxima leitura
    est = item["est"]
    for linha in bloco[:fim].splitlines():
        try:
            est = passo(est, json.loads(linha))
        except (ValueError, AttributeError, TypeError):
            pass
    cache[path] = {"pos": item["pos"] + fim, "est": est}
    return est


def primeira(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return json.loads(f.readline())
    except (OSError, ValueError):
        return {}


def estado_por_tempo(terminou, mtime, agora):
    if terminou:
        return "done"
    return "idle" if agora - mtime > PARADO else "working"


def tempo(est, d):
    t = ts(d.get("timestamp"))
    if t:
        est["inicio"] = est.get("inicio") or t
        est["fim"] = t
    return est


def metricas(est):
    ini, fim = est.get("inicio"), est.get("fim")
    return {k: est.get(k, 0) for k in ("passos", "entrada", "saida", "cache")} | {
        "modelo": est.get("modelo") or "",
        "passo": est.get("passo") or "",
        "duracao": round(fim - ini) if ini and fim else 0,
    }


def tarefas_de(lista, chave):
    return [{"titulo": curto(t.get(chave), 70), "status": t.get("status") or "pending"}
            for t in lista or [] if isinstance(t, dict)]


# --- Claude Code: ~/.claude/sessions/<pid>.json → <sessão>.jsonl e <sessão>/subagents/

INICIAL_CLAUDE = {"passos": 0, "entrada": 0, "saida": 0, "cache": 0, "modelo": "", "passo": "", "ultimo": None, "tarefas": None}


def passo_claude(est, d):
    est = tempo(dict(est), d)
    if d.get("type") != "assistant":
        return est
    m = d.get("message") or {}
    if m.get("id") and m["id"] != est["ultimo"]:  # o Claude grava uma linha por bloco da mesma mensagem
        u = m.get("usage") or {}
        est["ultimo"] = m["id"]
        est["passos"] += 1
        est["entrada"] += sum(u.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        est["saida"] += u.get("output_tokens") or 0
        est["cache"] += u.get("cache_read_input_tokens") or 0
        est["modelo"] = (m.get("model") or est["modelo"]).removeprefix("claude-")
    for c in m.get("content") or []:
        if isinstance(c, dict) and c.get("type") == "tool_use":
            i = c.get("input") or {}
            if c.get("name") == "TodoWrite":
                est["tarefas"] = tarefas_de(i.get("todos"), "content")
            det = i.get("description") or i.get("command") or i.get("file_path") or i.get("pattern") or ""
            est["passo"] = curto(f"{c.get('name')}: {det}" if det else c.get("name"))
    return est


def sessao_claude(t, home):
    try:
        return json.loads((home / ".claude/sessions" / f"{t.get('pid')}.json").read_text())["sessionId"]
    except (OSError, ValueError, KeyError):
        return None


def claude(t, home, agora, cache):
    sid = sessao_claude(t, home)
    if not sid:
        return []
    subs = []
    for meta in sorted((home / ".claude/projects").glob(f"*/{sid}/subagents/*.meta.json")):
        jsonl = meta.with_name(meta.name[: -len(".meta.json")] + ".jsonl")
        try:
            m = json.loads(meta.read_text())
            mtime = (jsonl if jsonl.exists() else meta).stat().st_mtime
        except (OSError, ValueError):
            continue
        if m.get("finished") and agora - mtime > RECENTE:
            continue
        est = acumular(jsonl, cache, INICIAL_CLAUDE, passo_claude)
        subs.append({
            "id": meta.name[len("agent-"): -len(".meta.json")],
            "nome": m.get("agentType") or "subagente",
            "descricao": curto(m.get("description")),
            "estado": estado_por_tempo(m.get("finished"), mtime, agora),
            "atualizado": mtime,
            "nivel": m.get("spawnDepth") or 1,
        } | metricas(est))
    return subs


def tarefas_claude(t, home, cache):
    sid = sessao_claude(t, home)
    for p in (home / ".claude/projects").glob(f"*/{sid}.jsonl") if sid else ():
        return acumular(p, cache, INICIAL_CLAUDE, passo_claude).get("tarefas") or []
    return []


# --- Codex: rollouts em ~/.codex/sessions; filhos têm parent_thread_id

INICIAL_CODEX = {"passos": 0, "entrada": 0, "saida": 0, "cache": 0, "modelo": "", "passo": "", "terminou": False, "tarefas": None}


def passo_codex(est, d):
    est = tempo(dict(est), d)
    p = d.get("payload") or {}
    if d.get("type") == "turn_context":
        est["modelo"] = p.get("model") or est["modelo"]
    tipo = p.get("type")
    if tipo == "task_complete":
        est["terminou"] = True
    elif tipo == "token_count":
        u = (p.get("info") or {}).get("total_token_usage") or {}
        est["entrada"], est["saida"], est["cache"] = u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cached_input_tokens", 0)
    elif tipo == "function_call":
        est["terminou"] = False
        est["passos"] += 1
        try:
            a = json.loads(p.get("arguments") or "{}")
        except ValueError:
            a = {}
        a = a if isinstance(a, dict) else {}
        if p.get("name") == "update_plan":
            est["tarefas"] = tarefas_de(a.get("plan"), "step")
        det = a.get("cmd") or a.get("command") or a.get("path") or ""
        det = " ".join(det) if isinstance(det, list) else det
        est["passo"] = curto(f"{p.get('name')}: {det}" if det else p.get("name"))
    return est


def rollouts_codex(home, desde):
    base = home / ".codex/sessions"
    dias = {time.strftime("%Y/%m/%d", time.localtime(x)) for x in (desde, time.time())}
    for dia in dias:
        for p in (base / dia).glob("rollout-*.jsonl"):
            try:
                mtime = p.stat().st_mtime
            except OSError:
                continue
            yield p, mtime, primeira(p).get("payload") or {}


def threads_codex(t, home, agora):
    """(rollout da thread do terminal, todos os rollouts recentes) ou (None, [])."""
    pastas = {t.get("cwd"), t.get("cwd_vivo")} - {None}
    inicio = t.get("inicio") or 0
    todos = list(rollouts_codex(home, inicio or agora))
    raizes = [(m, path, p) for path, m, p in todos
              if not p.get("parent_thread_id") and p.get("cwd") in pastas and m >= inicio - 60]
    if not raizes:
        return None, []
    return max(raizes, key=lambda x: x[0]), todos


def codex(t, home, agora, cache):
    raiz, todos = threads_codex(t, home, agora)
    if not raiz:
        return []
    filhos = {}
    for path, mtime, p in todos:
        if p.get("parent_thread_id"):
            filhos.setdefault(p["parent_thread_id"], []).append((path, mtime, p))
    subs, fila = [], [(raiz[2].get("id"), 1)]
    while fila:
        pai, nivel = fila.pop(0)
        for path, mtime, p in sorted(filhos.get(pai, []), key=lambda x: x[1]):
            fila.append((p.get("id"), nivel + 1))
            est = acumular(path, cache, INICIAL_CODEX, passo_codex)
            if est["terminou"] and agora - mtime > RECENTE:
                continue
            nome = p.get("agent_nickname") or "subagente"
            if p.get("agent_role"):
                nome += f" ({p['agent_role']})"
            subs.append({
                "id": p.get("id"),
                "nome": nome,
                "descricao": curto(os.path.basename(p.get("agent_path") or "")),
                "estado": estado_por_tempo(est["terminou"], mtime, agora),
                "atualizado": mtime,
                "nivel": nivel,
            } | metricas(est))
    return subs


def tarefas_codex(t, home, cache):
    raiz, _ = threads_codex(t, home, time.time())
    return (acumular(raiz[1], cache, INICIAL_CODEX, passo_codex).get("tarefas") or []) if raiz else []


# --- Qualquer IA: terminais que ela abriu com `hc run` (parent no herdr-core)

def herdr(t, todos):
    subs = []
    for f in todos:
        if f.get("parent") != t["address"]:
            continue
        nome = f.get("name") or f.get("app") or f["address"]
        if f.get("app") and f.get("app") != nome:
            nome += f" ({f['app']})"
        subs.append({
            "id": f["address"],
            "terminal": f["address"],
            "nome": nome,
            "descricao": curto(f.get("where") or f.get("cwd")),
            "estado": f.get("estado") or "idle",
            "passo": curto(f.get("msg")),
            "atualizado": 0,
            "nivel": 1,
        })
    return subs


FONTES = {"claude": (claude, tarefas_claude), "codex": (codex, tarefas_codex)}


def fonte_da_ia(t):
    texto = f"{t.get('app') or ''} {t.get('programa') or ''}".lower()
    return next((nome for nome in FONTES if nome in texto), None)


ORDEM = {"working": 0, "blocked": 0, "idle": 1, "done": 2}


def grupos(todos, home, agora, cache):
    out = []
    for t in todos:
        if t.get("parent"):
            continue  # subagente aparece dentro do pai
        subs = [dict(s, fonte="herdr") for s in herdr(t, todos)]
        tarefas = []
        nome = fonte_da_ia(t)
        if nome:
            de_subs, de_tarefas = FONTES[nome]
            subs += [dict(s, fonte=nome) for s in de_subs(t, home, agora, cache)]
            tarefas = de_tarefas(t, home, cache)
        if subs or any(x["status"] != "completed" for x in tarefas):
            subs.sort(key=lambda s: (ORDEM.get(s["estado"], 1), -s["atualizado"]))
            out.append({"terminal": t["address"], "app": t.get("app"), "where": t.get("where"),
                        "tarefas": tarefas, "subagentes": subs})
    return out


# --- Leitura do herdr-core

def inicio_processo(pid):
    try:
        campos = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        btime = next(int(l.split()[1]) for l in Path("/proc/stat").read_text().splitlines() if l.startswith("btime"))
        return btime + int(campos[19]) / os.sysconf("SC_CLK_TCK")
    except (OSError, ValueError, IndexError, StopIteration):
        return 0


def hc(*args):
    r = subprocess.run(["hc", *args], capture_output=True, text=True, timeout=10)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None


def terminais():
    lista = (hc("ls", "--json") or {}).get("terminals", [])
    out = []
    for item in lista:
        if item.get("state") != "live":
            continue
        g = hc("get", item["address"], "--json") or {}
        fg = g.get("foreground") or {}
        st = g.get("status") or {}
        pid = fg.get("pid")
        out.append({
            "address": item["address"],
            "parent": g.get("parent"),
            "name": g.get("name"),
            "app": st.get("app") or item.get("agent"),
            "programa": fg.get("name"),
            "estado": st.get("state") or item.get("status"),
            "msg": st.get("msg"),
            "pid": pid,
            "cwd": g.get("cwd"),
            "cwd_vivo": fg.get("cwd"),
            "where": (g.get("labels") or {}).get("where") or item.get("where"),
            "inicio": inicio_processo(pid) if pid else 0,
        })
    return out


def main():
    try:
        cache = json.loads(CACHE.read_text())
    except (OSError, ValueError):
        cache = {}
    try:
        dados = grupos(terminais(), Path.home(), time.time(), cache)
    except Exception as e:  # o painel mostra o erro em vez de sumir
        print(json.dumps({"erro": f"{type(e).__name__}: {e}"}))
        return 0
    # Arquivo sumido ou parado há mais de um dia sai do cache.
    limite = time.time() - 86400
    cache = {k: v for k, v in cache.items() if os.path.exists(k) and os.path.getmtime(k) > limite}
    try:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        tmp = CACHE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache))
        tmp.replace(CACHE)
    except OSError:
        pass
    print(json.dumps({"grupos": dados}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

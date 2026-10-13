#!/usr/bin/env python3
"""Hook PreCompact/SessionEnd: grava rascunho da sessão em <vault>/_inbox (sem LLM)."""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

VAULT = Path(os.environ.get("CAPTURA_VAULT", "~/Documentos/Obsidian-cell")).expanduser()
MAX_PEDIDOS = 30
MAX_PEDIDO = 300
MAX_FINAL = 800

SEGREDOS = re.compile(
    r"(sk-[A-Za-z0-9_-]{16,}|ctx7sk-[A-Za-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}"
    r"|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+"
    r"|(?i:(?:password|senha|passwd|pwd|token|secret|api[_-]?key)\s*[=:]\s*)\S+)"
)


def limpar(texto, limite):
    texto = SEGREDOS.sub("[REDACTED]", " ".join(texto.split()))
    return texto if len(texto) <= limite else texto[:limite] + "…"


def ler_transcript(caminho):
    s = {"pedidos": [], "arquivos": [], "commits": [], "titulo": "", "final": "", "branch": "", "cwd": ""}
    for linha in Path(caminho).open(encoding="utf-8"):
        try:
            d = json.loads(linha)
        except ValueError:
            continue
        tipo = d.get("type")
        if tipo == "ai-title":
            s["titulo"] = d.get("aiTitle", s["titulo"])
            continue
        if d.get("isSidechain"):
            continue
        conteudo = (d.get("message") or {}).get("content")
        if tipo == "user" and not d.get("isMeta"):
            s["branch"] = d.get("gitBranch") or s["branch"]
            s["cwd"] = d.get("cwd") or s["cwd"]
            textos = [conteudo] if isinstance(conteudo, str) else [
                c.get("text", "") for c in conteudo or [] if c.get("type") == "text"]
            for t in textos:
                t = t.strip()
                if t and not t.startswith(("<", "[Image", "Caveat:")):
                    s["pedidos"].append(limpar(t, MAX_PEDIDO))
        elif tipo == "assistant" and isinstance(conteudo, list):
            for c in conteudo:
                if c.get("type") == "text" and c.get("text", "").strip():
                    s["final"] = c["text"]
                elif c.get("type") == "tool_use":
                    entrada = c.get("input") or {}
                    caminho_arq = entrada.get("file_path") or entrada.get("notebook_path")
                    if c.get("name") in ("Edit", "Write", "NotebookEdit") and caminho_arq:
                        if not caminho_arq.startswith("/tmp/") and caminho_arq not in s["arquivos"]:
                            s["arquivos"].append(caminho_arq)
                    elif c.get("name") == "Bash" and "git commit" in entrada.get("command", ""):
                        m = re.search(r"-m\s+[\"']([^\"'\n]+)", entrada["command"])
                        s["commits"].append(limpar(m.group(1) if m else entrada["command"].splitlines()[0], 150))
    return s


def montar_nota(s, evento, sessao):
    projeto = Path(s["cwd"]).name or "sem-projeto"
    agora = datetime.now()
    linhas = [
        "---",
        "tags: [inbox, sessao-claude]",
        f"projeto: {projeto}",
        f"branch: {s['branch'] or '-'}",
        f"cwd: {s['cwd']}",
        f"sessao: {sessao}",
        f"evento: {evento}",
        f"data: {agora:%Y-%m-%d %H:%M}",
        "---",
        "",
        f"# {s['titulo'] or 'Sessão ' + sessao[:8]} ({projeto})",
        "",
        "> Rascunho automático. A skill `salvar` promove o que presta para as notas definitivas e apaga este arquivo.",
        "",
        "## Pedidos",
        "",
    ]
    pedidos = s["pedidos"]
    if len(pedidos) > MAX_PEDIDOS:
        linhas.append(f"- … {len(pedidos) - MAX_PEDIDOS} pedidos anteriores omitidos")
        pedidos = pedidos[-MAX_PEDIDOS:]
    linhas += [f"- {p}" for p in pedidos]
    if s["arquivos"]:
        linhas += ["", "## Arquivos alterados", ""] + [f"- `{a}`" for a in s["arquivos"]]
    if s["commits"]:
        linhas += ["", "## Commits", ""] + [f"- {c}" for c in s["commits"]]
    if s["final"]:
        linhas += ["", "## Última resposta", "", limpar(s["final"], MAX_FINAL)]
    return projeto, agora, "\n".join(linhas) + "\n"


def main():
    dados = json.load(sys.stdin)
    transcript = dados.get("transcript_path")
    if not transcript or not Path(transcript).is_file() or not VAULT.is_dir():
        return
    s = ler_transcript(transcript)
    s["cwd"] = s["cwd"] or dados.get("cwd", "")
    # Sessão trivial (só pergunta rápida) não vira rascunho
    if not s["arquivos"] and len(s["pedidos"]) < 3:
        return
    sessao = dados.get("session_id", "sessao")
    projeto, agora, nota = montar_nota(s, dados.get("hook_event_name", ""), sessao)
    inbox = VAULT / "_inbox"
    inbox.mkdir(exist_ok=True)
    # Mesmo arquivo por sessão: PreCompact e SessionEnd sobrescrevem
    existentes = list(inbox.glob(f"*-{sessao[:8]}.md"))
    destino = existentes[0] if existentes else inbox / f"{agora:%Y-%m-%d}-{projeto}-{sessao[:8]}.md"
    destino.write_text(nota, encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:  # hook nunca pode travar a sessão
        print(f"captura-sessao: {erro}", file=sys.stderr)
    sys.exit(0)

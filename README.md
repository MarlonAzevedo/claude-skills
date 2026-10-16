# claude-skills

Skills pessoais do Claude Code (`~/.claude/skills`), valendo para qualquer projeto.
Este diretório é o próprio repositório: editou uma skill, é só commitar aqui.

## Skills

| Skill | Para quê | Origem |
|---|---|---|
| `corrigir` | Resolver bug, pendência ou issue um por vez: teste de regressão antes do fix, gate, CI verde no SHA | adaptada de [akitaonrails/my-skills](https://github.com/akitaonrails/my-skills) (`github-resolution` + `iss-audit`) |
| `pos-auditoria` | Auditar o intervalo `<base>..HEAD` antes de push em lote ou release | adaptada de akitaonrails/my-skills (`pr-post-audit`) |
| `auditoria-seguranca` | Auditoria de segurança com threat model, verificação adversarial e `scripts/superficie.sh` | adaptada de akitaonrails/my-skills (`security-audit`), com ideias de cloudflare/security-audit-skill (MIT) |
| `release` | Cortar versão: semver pelo CHANGELOG, tag anotada só com CI verde | adaptada de akitaonrails/my-skills (`release`) |
| `atualizar-deps` | Consolidar Dependabot/Renovate e desatualizados num commit, com piso de supply chain | adaptada de akitaonrails/my-skills (`pr-bump`) |
| `refletir` | Kaizen: transformar erros reais em regras e skills | adaptada de akitaonrails/my-skills (`reflect`) |
| `limpar` | Achar e remover arquivos desnecessários (lixo, artefato rastreado, duplicado, órfão) com prova de não uso, aprovação e gate; levantamento em `scripts/candidatos.sh` | própria |
| `salvar` | Registrar a sessão: docs do repo + memória de longo prazo (vault Obsidian do projeto, se existir) | própria |
| `recado` | Conversa assíncrona entre agentes por arquivos: recado entre projetos (pego uma vez só) e handoff de sessão oferecido por id; `scripts/recado.py` | própria, com o protocolo de mensagens e handoff de [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| `tlc-spec-lean` | Features novas: plan → checks → build → verificador independente | [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), CC-BY-4.0 |
| `harness-eval` | Auditar CLAUDE.md/AGENTS.md e skills (caminhos quebrados, redundância) | tech-leads-club/agent-skills, CC-BY-4.0. `scripts/inventory_extract.py` alterado: pula citações fora do repo |
| `security-best-practices` | Specs de código seguro por linguagem/framework | tech-leads-club/agent-skills (originalmente openai/skills), Apache-2.0 (`LICENSE.txt`) |

## Versão do projeto primeiro

Skills pessoais têm precedência sobre as de projeto com o mesmo nome. Por isso as sete
do fluxo começam por um Passo 0: se o repositório atual tiver `.claude/skills/<nome>/SKILL.md`,
seguem a versão do projeto. Sem ela, descobrem gate, testes e convenções pelo
`CLAUDE.md`/`AGENTS.md` e pelos arquivos do projeto.

## Restaurar numa máquina nova

```bash
git clone https://github.com/MarlonAzevedo/claude-skills.git ~/.claude/skills
```

Se `~/.claude/skills` já existir (por exemplo, com a pasta `synced/` do app), clone em
outro lugar e mova o `.git` e os arquivos pra dentro dele.

Depois, ligue os subagentes e o hook de captura (`_harness/`):

```bash
mkdir -p ~/.claude/agents ~/.claude/hooks
ln -s ~/.claude/skills/_harness/agents/*.md ~/.claude/agents/
ln -s ~/.claude/skills/_harness/hooks/captura-sessao.py ~/.claude/hooks/
```

e acrescente ao `~/.claude/settings.json` os hooks `PreCompact` e `SessionEnd`
com o comando `python3 -I ~/.claude/hooks/captura-sessao.py`, e o `SessionStart` com
`python3 -I ~/.claude/skills/recado/scripts/recado.py aviso`. Para os outros agentes
lerem a `recado`: `for d in ~/.agents/skills ~/.gemini/config/skills ~/.pi/agent/skills; do ln -s ~/.claude/skills/recado "$d/"; done`. Testes:
`for t in ~/.claude/skills/testes/test_*.py; do python3 -I "$t"; done`.

Os mods (`_mods/`) entram como marketplace local:

```bash
claude plugin marketplace add ~/.claude/skills/_mods
for m in progresso-agentes arvore-arquivos alerta-cache reflect guarda-encoding lembrete-doc-one context-bar usage-meter replay-theater cache-clock; do claude plugin install "$m@claude-mods" --scope user; done
```

O cache-clock ainda pede `/cache-clock setup` numa sessão. Testes: `for m in ~/.claude/skills/_mods/*/; do claude plugin test "$m"; done`.

## `_harness/`

| Arquivo | Para quê |
|---|---|
| `agents/consultor-obsidian.md` | Busca no vault e devolve só caminhos + resumo (Haiku) |
| `agents/leitor-mssql.md` | Consulta o MSSQL só com leitura |
| `agents/executor-testes.md` | Roda testes e devolve só placar e falhas (Haiku) |
| `agents/verificador.md` | Revisor só de leitura que tenta refutar um achado |
| `hooks/captura-sessao.py` | Grava rascunho da sessão em `<vault>/_inbox` antes de compactar e no fim, sem LLM |

## `_mods/`

Mods do Claude Code (plugins de function hooks), num marketplace local chamado `claude-mods`. O
Claude Code lê direto desta pasta: editou um mod, rode `/reload-plugins` ou abra outra sessão.

| Mod | Para quê | Origem |
|---|---|---|
| `progresso-agentes` | Barra de progresso das tarefas acima do prompt e painel `/subagentes` com modelo, passos e tokens | própria |
| `arvore-arquivos` | Painel `/arvore`: arquivos que o Claude lê/edita agora e o estado de cada um no git | própria |
| `alerta-cache` | Segura o envio quando o cache expirou numa conversa grande e diz quantos tokens vão ser reprocessados | própria |
| `reflect` | Reclamação vira regra no `CLAUDE.md`/`AGENTS.md` do projeto ou no global, com um clique | própria |
| `guarda-encoding` | Mantém encoding, BOM, CRLF/LF e final de arquivo; Windows-1252 (PHP legado) é lido e gravado pela guarda | própria |
| `lembrete-doc-one` | Código alterado em `htdocs` vira lembrete de atualizar a `documentacao-one` no fim do turno | própria |
| `context-bar` | Contexto em barra empilhada por categoria acima do prompt | [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods), MIT, traduzido |
| `usage-meter` | Uso do plano (5h e 7 dias), reset e custo da sessão | hamzafer/claude-code-mods, MIT, traduzido |
| `replay-theater` | `/replay` passa pelas edições do último turno, um diff por vez | hamzafer/claude-code-mods, MIT, traduzido |
| `cache-clock` | Linha do cache do prompt sob a status line (`/cache-clock setup`) | hamzafer/claude-code-mods, MIT, traduzido |
| `blast-radius` | Segura comandos destrutivos até a pessoa liberar. Fica no repositório, desinstalado | própria |

As faixas acima do prompt seguem o protocolo `hooks/bands.ts` do hamzafer (uma coluna `bands`
compartilhada), então os mods próprios e os dele empilham juntos e respeitam a ordem de
`~/.claude/claude-code-mods/bands.json`.

# claude-skills

Skills pessoais do Claude Code (`~/.claude/skills`), valendo para qualquer projeto.
Este diretório é o próprio repositório: editou uma skill, é só commitar aqui.

## Skills

| Skill | Para quê | Origem |
|---|---|---|
| `corrigir` | Resolver bug, pendência ou issue um por vez: teste de regressão antes do fix, gate, CI verde no SHA | adaptada de [akitaonrails/my-skills](https://github.com/akitaonrails/my-skills) (`github-resolution` + `iss-audit`) |
| `pos-auditoria` | Auditar o intervalo `<base>..HEAD` antes de push em lote ou release | adaptada de akitaonrails/my-skills (`pr-post-audit`) |
| `auditoria-seguranca` | Auditoria de segurança com threat model, verificação adversarial e `scripts/superficie.sh` | adaptada de akitaonrails/my-skills (`security-audit`), com ideias de cloudflare/security-audit-skill (MIT) |
| `release` | Cortar versão: semver pelo CHANGELOG, tag anotada só com CI verde. Na ONE, desvia para o modelo de lançamento da documentacao-one (branch local, versão pelo número do meio) | adaptada de akitaonrails/my-skills (`release`) |
| `atualizar-deps` | Consolidar Dependabot/Renovate e desatualizados num commit, com piso de supply chain | adaptada de akitaonrails/my-skills (`pr-bump`) |
| `refletir` | Kaizen: transformar erros reais em regras e skills | adaptada de akitaonrails/my-skills (`reflect`) |
| `commit` | Commits semânticos em português por grupo lógico, conferindo encoding e segredos; push só se escolher. Roda no Haiku | adaptada de [midudev/better-claude](https://github.com/midudev/better-claude) (`/commit`), MIT |
| `limpar` | Achar e remover arquivos desnecessários (lixo, artefato rastreado, duplicado, órfão) com prova de não uso, aprovação e gate; levantamento em `scripts/candidatos.sh` | própria |
| `salvar` | Registrar a sessão: docs do repo + memória de longo prazo (vault Obsidian do projeto, se existir) | própria |
| `recado` | Conversa assíncrona entre agentes pelo ai-memory: recado entre projetos (`ai-memory message`, pego uma vez só) e handoff de sessão (`memory_handoff_*`) | própria, sobre o protocolo de mensagens e handoff de [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| `integrar-equipamento` | Integrar equipamento novo no Córtex da ONE nos dois lados (base wsOnePortaria e módulo Node), com investigação do aparelho, armadilhas do FR300 e checklist de entrega | própria, a partir do guia `cortex-integrar-equipamento` da documentacao-one |
| `tlc-spec-lean` | Features novas: plan → checks → build → verificador independente | [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), CC-BY-4.0, versão 2.1.0. `SKILL.md`, `references/build.md` e `references/verify.md` alterados: o Verifier só roda com o ok do usuário |
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
com o comando `python3 -I ~/.claude/hooks/captura-sessao.py`. A `recado` usa o ai-memory:
ligue os hooks e o MCP dele no Claude Code com `ai-memory install-hooks --agent claude-code --apply`
e `claude mcp add --scope user --transport stdio ai-memory -- /usr/bin/ai-memory mcp-bridge --server-url http://127.0.0.1:49374/mcp`.
Para os outros agentes lerem a `recado`: `for d in ~/.agents/skills ~/.gemini/config/skills ~/.pi/agent/skills; do ln -s ~/.claude/skills/recado "$d/"; done`. Testes:
`for t in ~/.claude/skills/testes/test_*.py; do python3 -I "$t"; done`.

Os mods (`_mods/`) formam o marketplace `claude-mods`, descrito em `.claude-plugin/marketplace.json` na raiz. Nesta máquina (onde os mods são editados), registre pela pasta; em outra máquina, sem clonar, registre pelo GitHub (as mudanças chegam depois do push, com `claude plugin marketplace update claude-mods`):

```bash
claude plugin marketplace add ~/.claude/skills          # pela pasta
# claude plugin marketplace add MarlonAzevedo/claude-skills   # pelo GitHub
for m in progresso-agentes arvore-arquivos alerta-cache reflect guarda-encoding lembrete-doc-one context-bar usage-meter replay-theater cache-clock use-haiku think-hard; do claude plugin install "$m@claude-mods" --scope user; done
```

O cache-clock ainda pede `/cache-clock setup` numa sessão. O after pede as opções na instalação: `claude plugin install after@claude-mods --scope user --config smart=true --config model=haiku --config display=band`. Testes: `for m in ~/.claude/skills/_mods/*/; do claude plugin test "$m"; done`.

## `_harness/`

| Arquivo | Para quê |
|---|---|
| `agents/consultor-obsidian.md` | Busca no vault e devolve só caminhos + resumo (Haiku) |
| `agents/leitor-mssql.md` | Consulta o MSSQL só com leitura |
| `agents/executor-testes.md` | Roda testes e devolve só placar e falhas (Haiku) |
| `agents/verificador.md` | Revisor só de leitura que tenta refutar um achado |
| `hooks/captura-sessao.py` | Grava rascunho da sessão em `<vault>/_inbox` antes de compactar e no fim, sem LLM |

## `_mods/`

Mods do Claude Code (plugins de function hooks), no marketplace `claude-mods` (`.claude-plugin/marketplace.json` na raiz). Registrado pela pasta, o
Claude Code lê direto daqui: editou um mod, rode `/reload-plugins` ou abra outra sessão.

| Mod | Para quê | Origem |
|---|---|---|
| `progresso-agentes` | Barra de progresso das tarefas acima do prompt e painel `/subagentes` com modelo, passos e tokens | própria |
| `arvore-arquivos` | Painel `/arvore`: arquivos que o Claude lê/edita agora e o estado de cada um no git | própria |
| `alerta-cache` | Segura o envio quando o cache expirou numa conversa grande e diz quantos tokens vão ser reprocessados | própria |
| `reflect` | Reclamação vira regra no `CLAUDE.md`/`AGENTS.md` do projeto ou no global, com um clique | própria |
| `guarda-encoding` | Mantém encoding, BOM, CRLF/LF e final de arquivo; Windows-1252 (PHP legado) é lido e gravado pela guarda | própria |
| `lembrete-doc-one` | Código alterado em `htdocs` (no Linux, nas pastas `docker-*`, opção `pastasCodigo`) aparece na linha de dicas como documentação pendente, sem interromper (as notas são escritas no fim da sessão ou quando pedir) | própria |
| `context-bar` | Contexto em barra empilhada por categoria acima do prompt | [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods), MIT, traduzido |
| `usage-meter` | Uso do plano (5h e 7 dias), reset e custo da sessão | hamzafer/claude-code-mods, MIT, traduzido |
| `replay-theater` | `/replay` passa pelas edições do último turno, um diff por vez | hamzafer/claude-code-mods, MIT, traduzido |
| `cache-clock` | Linha do cache do prompt sob a status line (`/cache-clock setup`) | hamzafer/claude-code-mods, MIT, traduzido |
| `after` | Fila de prompts: `/after <tarefa>` roda depois da tarefa atual, sem interromper; `/after` mostra e edita a fila | [midudev/better-claude](https://github.com/midudev/better-claude), MIT |
| `use-haiku` | Prompt começando com `_` roda o turno principal no Haiku; os subagentes mantêm o modelo definido neles | midudev/better-claude, MIT, alterado: não força os subagentes |
| `think-hard` | Prompt começando com `+` pensa com esforço máximo no turno principal; os subagentes mantêm o esforço definido neles | midudev/better-claude, MIT, alterado: não força os subagentes |
| `blast-radius` | Segura comandos destrutivos até a pessoa liberar. Fica no repositório, desinstalado | própria |

As faixas acima do prompt seguem o protocolo `hooks/bands.ts` do hamzafer (uma coluna `bands`
compartilhada), então os mods próprios e os dele empilham juntos e respeitam a ordem de
`~/.claude/claude-code-mods/bands.json`.

---
name: atualizar-deps
description: Atualizar dependências de qualquer projeto com segurança num único commit consolidado — PRs do Dependabot/Renovate e/ou pacotes desatualizados detectados localmente (npm/pnpm/yarn/bun, pip/poetry/uv, cargo, go mod, bundler, composer, GitHub Actions, imagens Docker), com piso de supply chain, gate completo e fechamento dos PRs supersedidos. Use quando o usuário pedir "atualizar dependências", "bump", "resolver os PRs do dependabot/renovate", "tem pacote desatualizado?". PR que mexe em código de aplicação não é bump — vai para revisão normal.
---

# Atualizar dependências

## Passo 0 — Delegação ao projeto

Skills pessoais têm precedência sobre as de projeto com o mesmo nome. Por isso:
se o repositório atual (`git rev-parse --show-toplevel`) tiver
`.claude/skills/atualizar-deps/SKILL.md`, siga essa versão específica do
projeto no lugar desta. Só continue aqui se ela não existir.

Várias atualizações formam **uma** unidade de trabalho: consolide todas,
resolva cada uma para a versão compatível mais nova (que pode ser mais nova
que a do PR), rode **um** gate e corrija o que quebrar em commits seguintes.
Nunca faça merge de PR de bump um por um.

## Contexto do projeto

- `CLAUDE.md`/`AGENTS.md`: regras, gate, "erros que não devem se repetir",
  armadilhas de dependência já registradas, e se os comandos rodam no host ou
  num container.
- **Gate**: o declarado no `CLAUDE.md`/`AGENTS.md`. Senão `scripts/ci.sh`,
  `bin/ci`, alvo `ci`/`check` do Makefile ou justfile, scripts do
  `package.json`, `cargo test`, `pytest`, `go test ./...`,
  `bundle exec rspec`. Se não der para descobrir, pergunte.
- **CI**: `.github/workflows/` + `gh run`. Sem CI, vale o gate local, e o
  relatório diz isso.

## Detectar ecossistemas

| Sinal | Ecossistema | Desatualizados | Atualizar |
|---|---|---|---|
| `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `bun.lock` | npm / pnpm / yarn / bun | `<pm> outdated` | `<pm> update <pkg>` / `<pm> add <pkg>@<v>` |
| `uv.lock` / `poetry.lock` / `requirements*.txt` | uv / poetry / pip | `uv tree --outdated`, `poetry show -o`, `pip list -o` | `uv lock -P <pkg>`, `poetry update <pkg>` |
| `Cargo.lock` | cargo | `cargo outdated` (se instalado) | `cargo update -p <pkg>` |
| `go.sum` | go mod | `go list -u -m all` | `go get <mod>@<v> && go mod tidy` |
| `Gemfile.lock` | bundler | `bundle outdated` | `bundle update <gem> --conservative` |
| `composer.lock` | composer | `composer outdated` | `composer update <pkg>` |
| `.github/workflows/*.yml` | GitHub Actions | PRs do bot | pin por SHA |
| `Dockerfile*`, `compose*.yml` | imagens Docker | PRs do bot | tag/digest |

Monorepo: repita por diretório com manifesto próprio.

## Guardrails

- Nunca commite mudança local sem relação. Antes: `git status --short --branch`,
  `git diff --stat` e o diff dos arquivos pretendidos.
- PR de bot que toca algo além de manifest/lock/pin (código, schema,
  migração, script) **não é bump**: pare e faça revisão normal.
- Lockfile se regenera pela ferramenta, nunca à mão. Nada de formatador amplo.
- **Piso de supply chain**, para cada pacote:
  - nome exatamente igual ao de antes, sem typosquat nem troca de escopo;
  - vem do registry público de sempre, não de git, tarball, path ou registry
    novo;
  - não surgiu script de ciclo de vida novo (`postinstall`, `preinstall`,
    `build.rs` inesperado, hook de setup);
  - não houve troca de mantenedor nem republicação estranha
    (`npm view <pkg> maintainers time`, página do registry).

  Qualquer sinal → pare e trate como auditoria de segurança, não como bump.
- **Major bump** nunca entra no automático. Leia o changelog/guia de migração,
  resuma o que muda e peça decisão. Sem decisão, aplique a versão compatível
  mais nova dentro da faixa atual e relate o que ficaria faltando.
- **Pacotes acoplados andam juntos, na mesma versão**: `prisma` +
  `@prisma/client` (+ adapters), `react` + `react-dom` + `@types/react*`,
  `@angular/*`, `@nestjs/*`, `vite` + plugins, `eslint` + configs, crates de um
  mesmo workspace. Rode o passo de geração que a lib exige (ex.:
  `prisma generate`).
- **Imagens de banco** (`mysql`, `postgres` etc.): pular de major é decisão do
  usuário, porque mexe no formato do volume de dados.
- **Actions** ficam pinadas por SHA com o comentário `# vX.Y.Z`. Resolva o SHA
  pela API (`gh api repos/<o>/<r>/commits/<tag> -q .sha`), nunca copie do texto
  do PR sem conferir.

## Passo 1 — Inventário

```bash
gh pr list --state open --search "author:app/dependabot author:app/renovate" \
  --json number,title,author,headRefName,files,statusCheckRollup,url
gh pr diff <n> --name-only
```

Some a isso os desatualizados locais de cada ecossistema. Monte uma tabela:
pacote → atual → PR → mais nova compatível → tipo (patch/minor/major) →
decisão.

## Passo 2 — Consolidar

Na branch padrão atualizada, sem fazer checkout das branches dos bots,
aplique as atualizações com o gerenciador de cada ecossistema (no container,
se o projeto roda assim). Edite pins de actions e tags de imagem direto. Liste
as transitivas que mudaram.

## Passo 3 — Verificar (um gate só)

Rode o gate completo num passo isolado e leia o código de saída antes de
seguir. Se falhar:

1. reproduza só a parte que falhou;
2. descubra se a causa é a dependência, o ambiente ou um teste frágil que já
   existia;
3. faça a correção mínima e robusta, sem enfraquecer teste;
4. rode o gate completo de novo.

Para isolar qual pacote quebrou, use uma worktree descartável. A solução entra
como pin, restrição ou correção de código em commit separado.

## Passo 4 — Commit e push

Só com pedido do usuário para commitar/subir. Um commit consolidado com os
manifestos, lockfiles e pins, no estilo de mensagem do repo, com
`Closes #N` de cada PR consolidado e a linha de coautoria do harness. A
correção que o bump exigiu vai num commit próprio. Nunca `gate && push`.
Depois do push, confira o CI no SHA exato
(`gh run list --commit "$(git rev-parse HEAD)"`). Pendente não é verde.

## Passo 5 — Fechar o ciclo de cada PR

- Consolidado → fechado pelo `Closes #N`. Se não pegou:
  `gh pr close <n> --comment "Consolidado em <sha>."`.
- Adiado (major, build quebrado, fonte suspeita) → comente o motivo e feche,
  ou abra uma issue de acompanhamento e linke. Nunca deixe PR adiado aberto e
  vermelho em silêncio.

## Relatório

```markdown
## Atualização de dependências

- Ecossistemas: <lista>
- Consolidados: #N, #M
- Versões: <pkg a → b (mais nova que o PR: c)>; transitivas: <...>
- Piso de supply chain: <ok | sinais encontrados>
- Gate: <comando> <verde/vermelho> em <SHA>
- CI: <jobs + resultado no SHA | sem CI>
- Não consolidados: #X — <motivo> — <fechado com comentário | issue #Y>
- Mudanças locais deixadas de fora: <...>
```

Se o projeto tem CHANGELOG, só entra atualização relevante para o usuário
(ex.: correção de segurança). Bump de rotina não precisa de entrada.

---

Adaptado de akitaonrails/my-skills (`pr-bump`).

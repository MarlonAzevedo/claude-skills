---
name: limpar
description: Acha e remove arquivos desnecessários de qualquer repositório — lixo (backup, cópia, temporário, log), artefato de build rastreado, arquivo coberto pelo .gitignore, duplicado, vazio, órfão e não rastreado esquecido — com prova de que nada usa cada um, aprovação do usuário e gate antes do commit. Use quando o usuário pedir "limpar", "limpeza", "arquivos desnecessários", "arquivo sobrando", "faxina no repo".
---

# Limpar — arquivos desnecessários

Cada remoção precisa de **prova**: evidência de que nada no projeto usa o
arquivo. Sem prova, o arquivo fica.

## Passo 0 — Versão do projeto primeiro

Skills pessoais têm precedência sobre as de projeto com o mesmo nome. Se
`$(git rev-parse --show-toplevel)/.claude/skills/limpar/SKILL.md` existir,
siga essa versão no lugar desta.

## Passo 1 — Levantar candidatos

1. `git status --short --branch`: anote mudanças alheias; elas ficam fora do commit.
2. Rode o levantamento (só lê, nada apaga):

   ```bash
   bash ~/.claude/skills/limpar/scripts/candidatos.sh "$(git rev-parse --show-toplevel)"
   ```

   Categorias: rastreado coberto pelo `.gitignore`, artefato de build/cache
   rastreado, lixo por nome, não rastreado e não ignorado, vazio, duplicado
   exato, grande, possível órfão. A saída corta em 40 linhas por categoria.
3. Pedido com escopo (uma pasta, um tipo) → filtre a saída para esse escopo.

Feito quando: cada candidato do escopo está numa das categorias.

## Passo 2 — Provar cada candidato

Classifique cada um com a evidência ao lado:

| Decisão | Quando | Ação |
|---|---|---|
| **Remover** | lixo por nome, artefato, vazio sem papel, órfão com prova | `git rm` |
| **Parar de rastrear** | coberto pelo `.gitignore` ou artefato gerado | `git rm --cached` (+ regra no `.gitignore`, se faltar) |
| **Consolidar** | duplicado | manter uma cópia, apontar as referências para ela |
| **Manter** | qualquer dúvida, ou uso achado | nada; diga onde é usado |

Prova de órfão (todas):

- `git grep` pelo nome **com e sem** extensão e pelo caminho relativo, incluindo
  configs, scripts do `package.json`/`composer.json`, CI, Dockerfile, docs e
  rotas;
- nada monta o nome em tempo de execução (import dinâmico, `require` com
  variável, glob, convenção de pasta do framework: rotas por arquivo,
  migrations, seeders, fixtures, `public/`, templates);
- não é ponto de entrada (CLI, cron, worker, script chamado à mão citado no
  README).

Mantenha sempre: migrations, lockfiles, `LICENSE`, arquivos de config de
ferramenta, `.gitkeep`, segredos locais ignorados (`.env`), e o que o
`CLAUDE.md`/`AGENTS.md` do projeto mandar preservar.

Arquivo grande só sai com motivo além do tamanho (duplicado, sem uso). Grande
e usado → sugira otimizar ou mover para fora do git, sem remover.

Feito quando: todo candidato tem decisão e uma linha de evidência.

## Passo 3 — Aprovação

Mostre a tabela `arquivo → decisão → evidência` e espere o usuário aprovar.
Arquivo **não rastreado** não tem volta pelo git: liste à parte e só apague com
aprovação explícita dele.

## Passo 4 — Aplicar e verificar

1. Aplique só o aprovado (`git rm`, `git rm --cached`, edição do
   `.gitignore`, ajuste de referências do duplicado).
2. Atualize doc que citava o arquivo removido.
3. Rode o gate do projeto num passo próprio e leia o exit code
   (`<gate>; echo "exit=$?"`). Vermelho → restaure o arquivo responsável
   (`git checkout HEAD -- <arquivo>`) e reclassifique como **Manter**.

## Passo 5 — Commit

Só com pedido do usuário. Um commit com as remoções, no estilo de mensagem do
repo (ex.: "Remover arquivos desnecessários"), listando as categorias no
corpo. Push também só com pedido.

## Relatório

```markdown
## Limpeza

- Removidos: N (<categorias>)
- Parou de rastrear: N (+ regras no .gitignore)
- Consolidados: <duplicados>
- Mantidos com uso achado: <arquivo — onde>
- Não rastreados apagados: <lista | nenhum>
- Gate: <comando> exit=<n>
```

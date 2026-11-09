---
name: analisar-tarefa
description: Analisa a tarefa da branch atual contra a base (feature/<base>/... → base; senão develop/main/master), incluindo o não commitado — lista só os arquivos de código (sem docs de IA nem testes), explica cada um com link que abre no Antigravity na linha alterada, dá o comando que abre o diff da branch arquivo por arquivo no Antigravity, e aponta pontos positivos, pontos de atenção e problemas com solução proposta. Use quando o usuário pedir "analisar tarefa", "analisa a branch", "explica o que mudou", "revisa o que foi feito", "/analisar-tarefa". Testes só são explicados quando ele pedir.
allowed-tools: Bash(bash ~/.claude/skills/analisar-tarefa/scripts/*), Bash(git *), Bash(gh pr view *), Bash(iconv *), Bash(file *), Read, Grep, Glob
---

# Analisar tarefa

Só lê e explica: não edita código, não commita. Soluções ficam como proposta.

## Passo 0: versão do projeto primeiro

Se `$(git rev-parse --show-toplevel)/.claude/skills/analisar-tarefa/SKILL.md` ou
`.agents/skills/analisar-tarefa/SKILL.md` existir, siga essa versão.

## Passo 1: levantar os arquivos

```bash
bash ~/.claude/skills/analisar-tarefa/scripts/arquivos.sh "$(git rev-parse --show-toplevel)" [base]
```

- Sem `base`, o script deduz pelo nome da branch (preferindo `origin/<base>`).
- Pedido com PR → `gh pr view <n> --json baseRefName,headRefName`; com commit ou
  intervalo → passe o início como `base`.
- A saída traz `base`, `merge-base`, a linha `diff:` (abre o diff de cada arquivo no
  Antigravity, um após o outro; fechar a aba passa ao próximo; não inclui os `?`) e três seções. Cada
  linha tem status (`M`, `A`, `D`, `R`, `?` = não rastreado), caminho, `+adições -remoções`
  e o link `antigravity-ide://file/...:<primeira linha alterada>`.
- **CODIGO** é o que se analisa. **TESTES** fica para quando o usuário pedir.
  **IGNORADOS** (docs, `.specs/`, `.agents/`, `.claude/`, `*.md`) só é contado.
- Se um arquivo da seção IGNORADOS for código de verdade (ou o contrário), mova-o de seção e diga isso.

## Passo 2: ler cada arquivo de código

Para cada arquivo da seção CODIGO: `git diff <merge-base> -- <arquivo>` (ou o arquivo
inteiro, se for `?`/`A`) e, quando o diff não bastar, o entorno no arquivo e quem chama
o código alterado (Grep). Arquivo Windows-1252 (PHP legado da ONE): leia com
`iconv -f WINDOWS-1252 -t UTF-8 <arquivo>` em vez de concluir que está corrompido.

Procure: bug de lógica, caso não tratado (null, vazio, erro de rede), quebra de
contrato com quem chama, SQL/entrada sem tratamento, segredo no código, encoding ou
quebra de linha trocados, código morto ou duplicado e divergência com o padrão do projeto
(`AGENTS.md`/`CLAUDE.md`).

## Passo 3: responder no terminal

```markdown
**Branch** `<branch>` → **base** `<base>` · <n> arquivos de código · <n> testes · <n> ignorados
Diff no Antigravity: `<comando da linha diff:>`

### [<caminho>](<link>) · <status> · +a −r
<2 a 4 linhas: o que mudou e por quê, em linguagem simples>

… (um bloco por arquivo de código, na ordem do fluxo: entrada → regra → dados)

## Pontos positivos
- …

## Pontos de atenção
- [<caminho>:<linha>](<link com essa linha>) — <o que observar e por quê>

## Problemas encontrados
- **<alta|média|baixa>** [<caminho>:<linha>](<link>) — <o problema e o cenário que o dispara>
  **Solução proposta:** <o que mudar, com trecho curto se ajudar>
```

- Links de linha específica: troque o `:<linha>` do final do link do script.
- Sem problema encontrado, escreva "Nenhum problema encontrado" (não invente).
- Problema só com evidência no código; suspeita sem confirmação vai para Pontos de atenção.

## Pedidos seguintes

- **"detalha <arquivo>"**: explicação completa daquele arquivo, trecho por trecho do
  diff, com link por trecho.
- **"explica os testes"**: mesmo formato do Passo 3 para a seção TESTES: o que cada
  teste cobre, o que ficou sem cobertura e se algum teste não prova o que diz provar.
- **"corrige"**: fora desta skill; siga a skill `corrigir`.

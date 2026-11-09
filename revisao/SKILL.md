---
name: revisao
description: Analisa a tarefa da branch atual contra a base (feature/<base>/... → base; senão develop/main/master), incluindo o não commitado — gráfico do fluxo alterado, ordem de leitura, explicação de cada arquivo de código (sem docs de IA nem testes) com link que abre no Antigravity na linha alterada, código sem teste, placar dos testes, documentação desatualizada, pontos positivos, pontos de atenção e problemas com solução proposta. Use quando o usuário pedir "analisar tarefa", "analisa a branch", "explica o que mudou", "revisa o que foi feito", "/revisao". Testes só são explicados quando ele pedir.
allowed-tools: Bash(bash ~/.claude/skills/revisao/scripts/*), Bash(git *), Bash(gh pr view *), Bash(iconv *), Bash(file *), Read, Grep, Glob, Agent
---

# Analisar tarefa

Só lê e explica: não edita código nem documentação, não commita. Soluções ficam como proposta.

## Passo 0: versão do projeto primeiro

Se `$(git rev-parse --show-toplevel)/.claude/skills/revisao/SKILL.md` ou
`.agents/skills/revisao/SKILL.md` existir, siga essa versão.

## Passo 1: levantar os arquivos

```bash
bash ~/.claude/skills/revisao/scripts/arquivos.sh "$(git rev-parse --show-toplevel)" [base]
```

- Sem `base`, o script deduz pelo nome da branch (preferindo `origin/<base>`).
- Pedido com PR → `gh pr view <n> --json baseRefName,headRefName`; com commit ou
  intervalo → passe o início como `base`.
- A saída traz `base`, `merge-base`, a linha `diff:` (abre o diff de cada arquivo no
  Antigravity, um após o outro; fechar a aba passa ao próximo; não inclui os `?`) e as seções:
  - **CODIGO**: o que se analisa. Cada linha: status (`M`, `A`, `D`, `R`, `?` = não
    rastreado), caminho, `+adições -remoções` e o link `antigravity-ide://file/...:<primeira linha alterada>`.
  - **TESTES**: só explicados quando o usuário pedir.
  - **SEM_TESTE**: código da tarefa cujo nome nenhum teste do repo cita. É indício,
    não prova: confirme lendo antes de afirmar.
  - **IGNORADOS** (docs, `.specs/`, `.agents/`, `.claude/`, `*.md`): só contados.
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

Monte o fluxo: por onde a execução entra (rota, evento, tela, cron), por quais
arquivos passa e onde termina (banco, API, equipamento, resposta). É dele que saem a
ordem de leitura e o gráfico do Passo 5.

## Passo 3: rodar os testes

Em paralelo ao Passo 2, chame o subagente `executor-testes` (Agent) com o repo, a branch
e os arquivos de TESTES e CODIGO: ele roda a pasta `testes/` e o gate do projeto e devolve
o placar e as falhas. Se o projeto precisar de containers, ele pode subir os de
`~/Documentos/portaria`. Sem como rodar (falta dependência ou serviço), diga o motivo em uma
linha; não invente placar.

## Passo 4: conferir a documentação

Todo projeto tem documentação; descubra onde fica:

- **ONE** (repo em `~/Documentos/portaria` ou remoto `one-portaria`): notas em
  `~/Documentos/Obsidian-cell/ONE/documentacao-one`. Peça ao subagente `consultor-obsidian`
  as notas do projeto que tratam dos arquivos, rotas, tabelas e fluxos alterados.
- **Outros:** `README*`, `docs/`, `CHANGELOG*` e o que o `AGENTS.md`/`CLAUDE.md` apontar
  (inclusive vault Obsidian do projeto).

Compare as notas com o comportamento novo. Desatualizada = a nota descreve algo que o
código da branch mudou, ou falta rota, tabela ou fluxo novo. Só avise, citando nota e
trecho; quem atualiza é a skill `salvar` (ou `documentar`, na ONE), quando o usuário pedir.

## Passo 5: responder no terminal

````markdown
**Branch** `<branch>` → **base** `<base>` · <n> arquivos de código · <n> testes · <n> ignorados
Diff no Antigravity: `<comando da linha diff:>`

## Fluxo
Ordem de leitura: `<arq1>` → `<arq2>` → `<arq3>`

```
[Origem] ──► [arq1 ★] ──► [arq2 ★] ──► [Destino]
                 │
                 └──► [arq3 ★ novo]
★ arq1: <antes> → <depois>
★ arq2: <o que muda no fluxo>
Efeito: <o que melhora ou muda para quem usa, em uma linha>
```

### [<caminho>](<link>) · <status> · +a −r
<2 a 4 linhas: o que mudou e por quê, em linguagem simples>

… (um bloco por arquivo de código, na ordem de leitura)

## Testes
<placar do executor-testes, ou o motivo de não ter rodado>
Sem teste: <arquivos de SEM_TESTE confirmados, ou "todo o código alterado tem teste">

## Documentação
<"Em dia", ou uma linha por nota desatualizada: [[nota]] (caminho) — o que está errado>

## Pontos positivos
- …

## Pontos de atenção
- [<caminho>:<linha>](<link com essa linha>) — <o que observar e por quê>

## Problemas encontrados
- **<alta|média|baixa>** [<caminho>:<linha>](<link>) — <o problema e o cenário que o dispara>
  **Solução proposta:** <o que mudar, com trecho curto se ajudar>
````

- Gráfico em texto, com caixas e setas Unicode; ★ marca o que a tarefa alterou ou criou.
  Inclua só os pontos do fluxo que a tarefa toca e os vizinhos diretos.
- Links de linha específica: troque o `:<linha>` do final do link do script.
- Sem problema encontrado, escreva "Nenhum problema encontrado" (não invente).
- Problema só com evidência no código; suspeita sem confirmação vai para Pontos de atenção.
- Não diga que a tarefa está completa. Se houver plano (`.specs/features/<n>/plan.md`) ou
  descrição da tarefa e algum item não aparecer no código, anote em Pontos de atenção como
  "possível pendência, confirmar" (pode estar feito de outra forma ou fora desta branch).

## Pedidos seguintes

- **"detalha <arquivo>"**: explicação completa daquele arquivo, trecho por trecho do
  diff, com link por trecho.
- **"explica os testes"**: mesmo formato do Passo 5 para a seção TESTES: o que cada
  teste cobre, o que ficou sem cobertura e se algum teste não prova o que diz provar.
- **"corrige"**: fora desta skill; siga a skill `corrigir`.

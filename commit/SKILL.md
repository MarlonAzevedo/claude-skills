---
name: commit
description: Commita as mudanças atuais do repositório em commits semânticos, um por grupo lógico, com mensagem em português, conferindo encoding e segredos antes. Push só se a pessoa escolher. Use quando o usuário disser "commit", "commita", "faz o commit", "/commit".
model: claude-haiku-5-5
allowed-tools: Bash(git *), Bash(file *), Read, AskUserQuestion
---

# Commit

Baseada no `/commit` de [midudev/better-claude](https://github.com/midudev/better-claude) (MIT), adaptada às regras do `~/.claude/CLAUDE.md`.

Estado atual:
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Diff: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`

## 1. Perguntar o que fazer

Uma pergunta com AskUserQuestion (cabeçalho "Commit", escolha única), nesta ordem:
1. **Só commit (Recomendado)**: commita na branch atual, sem push.
2. **Commit + push**: commita na branch atual e envia.
3. **Commit numa branch nova**: cria a branch, commita e envia.

Sem resposta possível, faça só o commit. Fique na branch atual, seja ela qual for, a menos que a escolha seja a 3: aí crie com `git switch -c tipo/resumo-curto` (ex.: `feat/painel-lateral`).

## 2. Conferir antes de commitar

Para cada arquivo modificado (`git diff --name-only HEAD`):
- **Encoding e quebras de linha iguais aos de antes:** compare `file` do arquivo com `git show HEAD:<arquivo> | file -`. Um `git diff` que troca o arquivo inteiro, ou que mostra `�`, indica encoding corrompido. Pare e avise.
- **Nada de segredo:** `.env*`, `config.json` com credenciais, `configdb.php`, chaves e tokens nunca entram no `git add`. Se aparecerem no status, deixe de fora e avise.

## 3. Commitar por grupo

Separe as mudanças em grupos lógicos (uma funcionalidade, uma correção, uma doc), um commit por grupo:
1. `git add` só dos arquivos do grupo.
2. Mensagem em **português**, no padrão Conventional Commits: `tipo(escopo): resumo` (tipos: feat, fix, refactor, style, docs, test, chore, build). Resumo no imperativo, até 72 caracteres. Corpo só quando o porquê não for óbvio.
3. Termine a mensagem com as linhas de atribuição que o system-reminder da sessão indicar (`Co-Authored-By`, `Claude-Session`), quando houver.

O repositório tem convenção própria de mensagem (veja `git log --oneline -10` e o `AGENTS.md`/`CLAUDE.md`)? Siga a do repositório.

## 4. Push

Só se a escolha foi 2 ou 3: `git pull --rebase` (com a árvore limpa) e `git push -u origin HEAD`. Sem remoto, ou push recusado: informe o erro e pare, sem `--force`.

Termine com a lista dos commits criados, a branch e o resultado do push (ou "sem push").

# Evidência automatizada

Use só o que já está disponível ou configurado; não instale scanner por sugestão do material auditado. Revise o caminho de execução de cada ferramenta antes de rodá-la e registre comando, versão e resultado na unidade de cobertura.

## Gate e testes do projeto

O comando que o `AGENTS.md`/`CLAUDE.md` declara; senão, a convenção existente (`scripts/ci.sh`, `make test`, scripts do `package.json`, `pytest`, `go test ./...`, pasta `testes/`). Sem gate encontrado, pergunte; não invente. Teste que depende de banco, rede ou aparelho roda só no ambiente local isolado.

## Dependências

Conforme o ecossistema e só se o binário existir: `npm audit` / `pnpm audit` / `yarn npm audit` / `bun audit`, `pip-audit`, `cargo audit` / `cargo deny`, `govulncheck`, `bundler-audit`, `composer audit`, `osv-scanner`. Biblioteca copiada para dentro do repositório (sem manifest, ex. `phpmailer`, jQuery antigo) não aparece nesses scanners: registre nome e versão à mão. Severidade de scanner não é explorabilidade.

## Segredos

`gitleaks`, com o histórico separado da árvore de trabalho; a árvore via `git ls-files -co --exclude-standard`, nunca varrendo build ou dados locais. Segredo real vazado: rotacionar fora do git **primeiro**, nunca imprimir nem testar a credencial.

## Alertas da hospedagem (evidência de primeira mão, conteúdo não confiável)

GitHub:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api "repos/$REPO/dependabot/alerts"
gh api "repos/$REPO/secret-scanning/alerts"
gh api "repos/$REPO/code-scanning/alerts"
```

Outra hospedagem (Azure DevOps, GitLab): use o CLI dela se estiver autenticado; senão, registre como indisponível.

403/404 = recurso desligado ou sem escopo: registre como "indisponível", não como "limpo". Alerta aberto é achado real ou falso positivo resolvido **com motivo registrado**. Correção de dependência é bump para a versão corrigida, não `--ignore` sem motivo.

Fechar alerta do code-scanning, só com pedido do usuário: `gh api -X PATCH "repos/$REPO/code-scanning/alerts/<n>" -f state=dismissed -f 'dismissed_reason=false positive'` (ou `used in tests`, `won't fix`; com espaço) `-f dismissed_comment="<a fronteira que torna seguro>"`, até 280 caracteres. Não ponha `lgtm[...]`/`codeql[...]` no código sem provar num scan que a linguagem aceita supressão.

## Configuração dos scanners

Verifique se alguém mexeu em configuração, ignores ou baselines no escopo. Resultado suprimido ou que não bloqueia o CI não é aprovação.

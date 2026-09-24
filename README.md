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
| `tlc-spec-lean` | Features novas: plan → checks → build → verificador independente | [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), CC-BY-4.0 |
| `harness-eval` | Auditar CLAUDE.md/AGENTS.md e skills (caminhos quebrados, redundância) | tech-leads-club/agent-skills, CC-BY-4.0. `scripts/inventory_extract.py` alterado: pula citações fora do repo |
| `security-best-practices` | Specs de código seguro por linguagem/framework | tech-leads-club/agent-skills (originalmente openai/skills), Apache-2.0 (`LICENSE.txt`) |

## Versão do projeto primeiro

Skills pessoais têm precedência sobre as de projeto com o mesmo nome. Por isso as seis
adaptadas começam por um Passo 0: se o repositório atual tiver `.claude/skills/<nome>/SKILL.md`,
seguem a versão do projeto. Sem ela, descobrem gate, testes e convenções pelo
`CLAUDE.md`/`AGENTS.md` e pelos arquivos do projeto.

## Restaurar numa máquina nova

```bash
git clone https://github.com/MarlonAzevedo/claude-skills.git ~/.claude/skills
```

Se `~/.claude/skills` já existir (por exemplo, com a pasta `synced/` do app), clone em
outro lugar e mova o `.git` e os arquivos pra dentro dele.

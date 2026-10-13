# upstream

Fork das versões originais das skills que adaptamos na `main`. Esta branch
nunca é mergeada: serve para comparar com a nossa versão e portar só o que for
aprovado.

## Cópias (licença permite redistribuir)

| Pasta | Origem | Commit | Licença | Nossa skill |
|---|---|---|---|---|
| `tlc-spec-lean`, `harness-eval` | [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) | 6df68d5 | CC-BY-4.0 | mesmo nome |
| `security-best-practices` | tech-leads-club/agent-skills (originalmente openai/skills) | 6df68d5 | Apache-2.0 | mesmo nome |

Atualizar: copiar as pastas novas por cima, commitar com o SHA de origem e ver
o que mudou com `git diff upstream~1 upstream -- <pasta>`.

## Só referência (repositório sem licença, não copiamos o texto)

[akitaonrails/my-skills](https://github.com/akitaonrails/my-skills), último commit comparado: `5763b9e9e6c84f36874096e256b8fdf6a309d34e`.

| Skill upstream | Nossa skill (texto próprio) |
|---|---|
| `github-resolution` + `iss-audit` | `corrigir` |
| `pr-post-audit` | `pos-auditoria` |
| `security-audit` | `auditoria-seguranca` |
| `release` | `release` |
| `pr-bump` | `atualizar-deps` |
| `reflect` | `refletir` |

Atualizar: clonar o repositório fora daqui, `git log 5763b9e9e6c84f36874096e256b8fdf6a309d34e..HEAD -- <skill>`
para ver o que mudou, reescrever a ideia com palavras nossas na skill da
`main` e trocar o commit desta tabela.

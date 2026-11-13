# Registro da auditoria

Use estes campos como contrato mínimo. Acrescente campos pertinentes ao alvo sem preencher fatos desconhecidos com suposições.

## cobertura.json

Objeto com `alvo`, `sha`, `arvore_suja`, `escopo`, `fora_do_escopo` (sistemas vizinhos, ambientes e pastas excluídos, com motivo), `data`, `ambiente` (onde algo foi executado: container local, banco de teste; nunca credenciais), `auditor` (identificador do subagente com contexto novo) e `unidades`. Cada unidade contém:

- `id`: identificador estável da superfície/fronteira/classe, o mesmo entre auditorias;
- `estado`: `planejada`, `coberta`, `candidata`, `pendente`, `adiada` ou `fora_do_escopo`;
- `superficie`, `fronteira`, `classe`, `arquivos`;
- `evidencia`: inspeções e testes executados, com comando, resultado e localização;
- `lacuna`: fato ainda não verificado ou motivo de exclusão/adiamento.

Não marque `coberta` sem evidência específica: uma busca textual ou um scanner sozinho não basta. Em auditorias posteriores, compare os arquivos e controles relevantes; reutilize uma unidade anterior somente depois de revalidá-la.

## achados.json

Objeto com `alvo`, `sha` e `registros`. Cada registro contém `id`, `unidades`, `estado`, `titulo`, `evidencia`, `justificativa` e `verificador` (identificador do subagente independente). Para `confirmado`, inclua `severidade`, `pre_requisitos`, `fronteira_cruzada`, `resultado`, `impacto`, `correcao`, `teste_regressao` e `divulgacao` (rollout e se a divulgação deve esperar). Para `precisa_validar`, inclua `fato_pendente` e `plano_validacao`, sem `severidade`. Para `rejeitado`, inclua `refutacao`, sem `severidade`.

## RELATORIO.md

Derivado dos dois JSON:

```markdown
# Auditoria <data> — <escopo> @ <SHA>

Auditor: <id> · Verificadores: <ids> · Ambiente: <onde algo rodou>
Threat model: <ativos, atores, pontos de entrada, fronteiras com sistemas vizinhos>
Evidência automatizada: <ferramenta e versão → resultado; indisponíveis e por quê>
Reconciliação com auditorias anteriores: <item → mantido | regrediu | não se aplica>
Cobertura: <contagem por estado>

## Achados confirmados
### [Severidade] Título
- Evidência (arquivo:linha) e resultado que ela sustenta:
- Pré-requisitos e caminho de exploração:
- Impacto e raio de alcance:
- Correção mínima:
- Teste de regressão:
- Divulgação e rollout:

## Fronteiras cobertas sem achado
- <fronteira — arquivos/funções examinados, testes rodados, resultado>

## Precisa validar
- <fato pendente, por quê, plano seguro para fechar>

## Candidatos rejeitados
- <alegação — refutação em uma linha>

## Risco residual e escopo não testado
- <ambientes, produção, plataformas, partes adiadas>
```

Sem achados confirmados, escreva: "Nenhum achado substanciado no escopo auditado."

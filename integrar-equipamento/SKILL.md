---
name: integrar-equipamento
description: Integra um equipamento novo (leitor facial, controladora de acesso, módulo de relés) no Córtex da ONE (One Portaria) nos dois lados — base wsOnePortaria (tipo novo em lista_equipamentos, portas em lista_portas_equip_tipo, tela MudouTipo, Windows-1252 + CRLF) e Córtex (módulo node/api_<fabricante>.js com as ops versao/online/ping/cmd/setadata/sincusuarios/excusr/excallusr, rota de push, despacho em api_equipamentos.js, status das portas, imagem, testes node:test) — com investigação do aparelho antes do plano, plano pela tlc-spec-lean, testes de regressão e documentação na documentacao-one. Use quando o usuário pedir "integrar equipamento", "novo tipo de equipamento", "integrar o leitor X no Córtex", "suporte à controladora Y", "cadastrar fabricante novo no Córtex".
---

# Integrar equipamento no Córtex (ONE)

Um tipo de equipamento novo mexe em **dois repositórios** que precisam concordar: a base
(`wsOnePortaria`, PHP) cadastra o tipo, as portas e os botões; o Córtex (`cortex`, Node) fala
com o aparelho. Referência real e completa: o Nice FR300 (tipo `52`, tarefa 81299) — copie o
padrão dele em vez de inventar.

Nada de chutar rota, campo ou código de erro do aparelho: tudo o que o módulo manda tem fonte
(manual, página web do aparelho ou resposta real da bancada) registrada na nota do equipamento.

## Passo 0 — Versão do projeto e documentação

1. Se `cortex` ou `wsOnePortaria` tiver `.agents/skills/integrar-equipamento/SKILL.md` (ou
   `.claude/skills/...`), siga a versão do projeto.
2. `git pull` em `documentacao-one` e siga o `AGENTS.md` dela. Leia antes de mexer:
   `cortex/guias/cortex-integrar-equipamento.md` (este roteiro, mantido pela equipe),
   `documentacao/equipamentos/equipamentos-00-indice.md`, `equipamentos-nice-fr300.md` (exemplo),
   `cortex/cortex-00-indice.md` e `sistemas-vizinhos.md`. Confira contra o código: se a nota
   divergir do código, vale o código e a nota entra na lista do que corrigir no fim.
3. Código: `~/Documentos/portaria/docker-cortex/cortex` e
   `~/Documentos/portaria/docker-portaria/wsOnePortaria`. Containers
   de teste: `docker-cortex/subir.sh` e `docker-portaria/subir.sh`.

## Fluxo

1. **Branch** nos dois repositórios, a partir da `develop` atualizada (`git pull` antes):
   `feature/develop/<tarefa>-integrar-<equipamento>`, mesmo nome nos dois.
2. **Investigar o aparelho** antes de qualquer plano: fabricante real (OEM), família da API,
   credenciais, rotas, assinatura de eventos, modo online/remoto, portas físicas. Só `GET` no
   aparelho até o usuário autorizar mudar configuração. Roteiro:
   [references/investigacao.md](references/investigacao.md).
3. **Plano com a skill `tlc-spec-lean`** no Córtex (`.specs/features/<equipamento>/plan.md`,
   `checks.md`, `verification.md`), cobrindo os dois repositórios. Decisões que só o usuário
   toma (quem decide o acesso: aparelho ou Córtex; senha padrão na tela; o que fazer com a rede
   fora) vão para o plano como perguntas, não como suposição.
4. **Escolher o número do tipo**: o próximo livre conferido em **todas** as branches (locais e
   remotas) dos dois repositórios — outra feature pode ter reservado o número:
   ```bash
   N=53
   cd wsOnePortaria && git fetch --all -q && for b in $(git branch -a --format='%(refname:short)'); do git grep -q "array(\"$N\"" "$b" -- adm/inc/funcoes.php && echo "$b"; done
   cd cortex && git fetch --all -q && for b in $(git branch -a --format='%(refname:short)'); do git grep -qE "tipo ?== ?$N\b" "$b" -- node && echo "$b"; done
   ```
   Nenhuma saída = livre.
5. **Portas**: leitores, comandos e sensores iguais na base, no Córtex e no módulo, seguindo os
   modelos (17 HikVision e 29 ZKTeco para facial, 42 Endpoint Full para vários relés e sensores),
   com a verificação obrigatória:
   [references/portas.md](references/portas.md).
6. **Base**: tipo, tela, encoding: [references/base.md](references/base.md).
7. **Córtex**: módulo, rota de push, despacho, status das portas, imagem, testes:
   [references/cortex.md](references/cortex.md).
8. **Testes de regressão** em `testes/` de cada repositório (permanentes, versionados), escritos
   a partir dos checks; todo bug achado na bancada ganha teste que falha antes do fix.
9. **Bancada**: Córtex do Docker cadastrado na conta como **1º IP do `ws_modulo`**, aparelho
   apontando para o IP público do Córtex. Conferir de verdade: versão, ping, ativar, sincronizar
   faces, reconhecimento liberado e negado, relé, sensores, reinício do aparelho.
10. **Verificação independente** da `tlc-spec-lean` (verificador novo a cada rodada, nunca o
   autor), quantas rodadas forem precisas.
11. **Documentação** na `documentacao-one` no fim (ver Entrega). Commit local nos dois
    repositórios; push e PR só quando o usuário pedir.

## Armadilhas reais (FR300)

Cada uma derrubou o Node ou travou a integração na bancada. Trate como requisito do módulo novo:

- **`Content-Length` sempre**, inclusive `0`: a lib `request` com `.auth(usuario, senha, false)`
  (HTTP Digest) e sem corpo não manda o cabeçalho, e o FR300 respondia `Common Error`.
- **Tamanho de arquivo em base64**: o `Size` da face é o tamanho do **texto base64**, não da foto
  em bytes (senão `StatusCode 1020`). Confira no manual do aparelho novo qual dos dois ele quer.
- **`global.padl` só aceita texto** (chama `.trim()`): `global.padl(1234, 10, '0')` derruba o
  Node. Sempre `global.padl("" + numero, ...)`. O mesmo para `response.end()` do Node 0.10: op
  chamada pela rota `/equipamento/` devolve texto no callback, nunca número ou objeto.
- **`versao_base` tem 15 caracteres** na base e no Córtex (`serial` 32, `modelo` 50): grave a
  versão curta (`QPTS-B2212.2.6.CLA002...` → `B2212.2.6`).
- **IP do Córtex no Docker**: `global.meuip` é o IP interno do container. O que vai para o
  aparelho (assinatura, servidor de eventos) vem de `process.env.CORTEX_IP_PUBLICO || global.meuip`
  (`CORTEX_IP_PUBLICO` no `docker-cortex/docker-compose.yml`).
- **Assinatura perdida no reboot**: o aparelho esquece assinaturas (e às vezes hora e modo) ao
  reiniciar. Reconfigurar tudo a cada reconexão (primeiro ping OK depois de offline), não só no
  botão "Ativar equip.".
- **Acentos UTF-8 → ISO na base**: a resposta do Córtex vem em UTF-8 e as telas montam a mensagem
  em Windows-1252 com `utf8_encode` no fim; converter antes com `resposta_cortex_iso()`
  (`inc/funcoes_ws.php`). Texto para a tela do aparelho vai sem acento (`global.TiraAcento`).
- **Uma assinatura de face só**: no FR300 só a mais antiga recebia com duas. Um "servidor
  inteligente" de outra plataforma ligado no aparelho rouba os eventos — confira e anote o
  original antes de trocar.
- **Log**: `global.Log(msg, false, true)` só vai para o painel (WebSocket), não para o
  `docker logs`.
- **SQL Server pela linha de comando**: script PHP no container grava acento errado
  (`Relé` → `Rel?`); use `CHAR(233)` ou o caminho da tela.
- **`ws_modulo` com IP inalcançável** trava a sincronização ("Atualizar DMI") e a sessão: os
  comandos da tela vão sempre para o 1º IP.

## Entrega (checklist)

Base (`wsOnePortaria`):
- [ ] Item em `lista_equipamentos()` com número livre em todas as branches
- [ ] Portas em `lista_portas_equip_tipo()` no padrão dos tipos 17/29/42 (lista explícita só se o nome genérico não servir), iguais às do Córtex
- [ ] Tipo na lista `leitorfacial` (se facial) e ramo no `MudouTipo()` com só os botões que o módulo atende, usuário/senha padrão de fábrica
- [ ] Windows-1252 + CRLF preservados (`file`, `git diff` sem linha inteira trocada)
- [ ] Teste em `testes/<equipamento>_tipo_test.php` passando no container

Córtex (`cortex`):
- [ ] `node/api_<fabricante>.js` com `Api(param, callback)` e as ops; erro claro para op não implementada
- [ ] `require` + `global.<Modulo>` e rota de push em `api.js` antes do `/log`
- [ ] `else if (param.tipo == N)` em `api_equipamentos.js` antes do `ping` genérico
- [ ] Tipo na lista de `Listar_Placas_Cortex5` e ramo em `Ler_Status_Portas_Equip`
- [ ] Módulo grava o estado (`Leitor_Seta_Porta`, `Atualiza_Status_Porta`, `MsgClientes`) e só avisa `processa_sensor` quando muda (como o 29 e o 42)
- [ ] Verificação das portas feita (os 6 passos de `references/portas.md`)
- [ ] `images/equipN.png` e `ARQUITETURA.md` (árvore de módulos e tabela de tipos)
- [ ] `testes/<equipamento>.test.js` (`node --test`) passando, com os testes existentes de `testes/` de novo

Fechamento:
- [ ] Bancada conferida (lista do passo 9), pendências não testadas escritas como pendências
- [ ] Verificação independente PASS
- [ ] `documentacao-one` (com `git pull` imediatamente antes de editar): nota do equipamento em
      `documentacao/equipamentos/equipamentos-<fabricante>-<modelo>.md` (fontes, rotas usadas,
      portas, o que foi confirmado na bancada, cuidados) e link no `equipamentos-00-indice`;
      tabela de tipos e módulos nas notas do Córtex; `wsoneportaria` se a tela mudou; armadilha
      nova no guia `cortex-integrar-equipamento`; entradas em `cortex-registro-de-mudancas` e
      `wsoneportaria-registro-de-mudancas`; nota da tarefa na sprint; links `[[...]]` válidos
- [ ] Nada de senha de banco, IP interno de cliente ou token nas notas e nos commits

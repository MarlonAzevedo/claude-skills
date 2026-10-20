# Córtex (`cortex`)

Node antigo (0.10 em produção): `var`, `function`, callbacks, sem `const`/arrow/`async` no código
do módulo (os testes podem usar). Arquivos UTF-8; cabeçalho `// API <NOME> ( ENCODE UTF-8 )`.
Modelo completo: `node/api_nice_fr300.js` e `testes/nice_fr300.test.js`.

## Módulo `node/api_<fabricante>.js`

Contrato: `Api(param, callback)`, `callback(erro, retorno)` com `erro = false` no sucesso.
`param` chega de `api_equipamentos.js` já com `ip`, `tipo`, `serial`, `usuario`, `senha`,
`modelo` completados de `global.GetEquipamento(ip)`.

| op | Faz | Devolve no sucesso |
|---|---|---|
| `versao` | Lê dados do aparelho | texto JSON `{"serial","modelo","versao_base","facial":true}` — `versao_base` com no máximo 15 caracteres |
| `ping` | Verifica online por uma rota HTTP real (não `ping` ICMP); `global.SetEquipamentoStatus(ip, 0/1)`; se voltou de offline, chama `Online(param)` | `callback(false, 0 ou 1)` (mesmo contrato do `Ping` genérico) |
| `online` | Configuração completa: hora, modo de abertura, assinaturas de eventos com o IP público do Córtex | `"OK"` |
| `cmd` | Aciona a porta `param.pt` com `param.stat` (`"0"` em pulso não faz nada e devolve OK); porta desconhecida é erro | `"Comando enviado"` |
| `setadata` | Acerta data/hora com `global.cfg.fuso` | `"OK"` |
| `sincusuarios` | `global.Sql_Pessoas_TagConvite_ativos(param, "'f'", null)` + `global.executa`, só quem tem `/var/www/fotos/f<cd_acesso>.jpg` (`global.Existe_Arquivo`); fila com `setTimeout` e progresso por `global.MsgClientes('sts_sinc', {ip, serial, perc, tipo: "foto"})`; inclusão que falha tenta alterar | `"OK"` (responde logo, a fila segue) |
| `sincusuarios` com `param.usuarios` | Lista pronta (`SincUsuariosSecundarios`, captura em outro facial): envia **só** ela, sem consultar o banco | `"OK"` |
| `excusr` | Exclui `param.cd_acesso` (também chega pelo `expirartag`, bloqueio na saída) | `"OK"` |
| `excfoto` | Base excluiu a face ou a pessoa (`excluirFaceEquipamentos`): tira a face ou a pessoa | `"OK"` |
| `excallusr` | Limpa todas as pessoas; se o firmware não tem o comando de lote, responde OK e apaga uma a uma em segundo plano | `"OK"` |
| `capfoto` / `capfotocanc` / `capbiocanc` | Captura de foto pelo aparelho (Plus/aba Web) com `MsgClientes("face", {status: "iniciada"/"cadastrada"/"falha"})`, `EnviarFotoBase` e `SincUsuariosSecundarios`; cancelar encerra | `"OK"` |
| outra | — | `callback("Erro: Op não implementada no <Equip>: " + param.op, "")` |

Op chamada pela tela vai para `response.end()` do Node 0.10: devolva **texto**, nunca número ou
objeto (derruba o Node). Erros vão para `global.Erro(msg, err)`; log por nível
`global.cfg.nivel_Log`.

**Uma função de requisição só** (`Requisicao(param, metodo, rota, corpo, descricao, callback)` no
FR300) com `global.req`: `timeout` (7000 ms), `Content-Type`, `Connection: close`, corpo sempre
string (`""` se não houver) e `Content-Length = Buffer.byteLength(corpo)` sempre, `.auth(usuario,
senha, false)` só se houver usuário (Digest), código de erro do aparelho virando erro com a
resposta junto (para tratar "já existe" como sucesso).

**Push do aparelho**: função exportada `Integracao_<Equip>(request, response, query, ip_cliente,
inicioT)` que junta o corpo (`data`/`end`), processa num `try/catch` e **sempre** responde 200 no
formato que o aparelho espera (senão ele reenvia). Padrões a reaproveitar:

- Equipamento pelo IP de origem: `global.GetEquipamento(ip_cliente)`; IP não cadastrado →
  `global.Erro` e nada mais. Evento recebido → `global.SetEquipamentoStatus(ip, 1)`.
- Face reconhecida → tag `"f" + global.padl("" + id, 10, '0')` (`cd_acesso` como `PersonID`),
  repetida em menos de 1,5 s ignorada (`equip.ult_face`, `equip.ult_face_time`), validada em
  `global.ChamarWS("http://127.0.0.1/API/?tag=<tag>&porta=1&ip_leitor=<ip>&equipamento=<serial>", null, 20, ...)`.
  Retorno `"ok"` = liberado; o acionamento volta ao módulo como `op = "cmd"` por
  `Acionar_Porta_Equipamento` (ramo `tipo >= 40` em `api.js`; tipo abaixo de 40 precisa entrar
  na lista explícita daquele ramo).
- Modo remoto: mostrar o resultado na tela do aparelho com as mensagens do `HikRemoteCheck`
  ("Acesso Liberado", "SEM VAGAS" quando o retorno contém `Nenhuma vaga disp`, motivo com
  `global.TiraAcento`, "Erro ao validar").
- Registro histórico (reenvio do que ficou pendente offline) só vai para o log.
- Sensores: `global.processa_sensor(ip, "<porta>", "0"|"1", serial, Date.now())` — porta e
  status como texto.
- IP que o aparelho usa para falar com o Córtex: `process.env.CORTEX_IP_PUBLICO || global.meuip`;
  sem IP, erro claro e nenhuma assinatura.

`module.exports.Api = Api; module.exports.Integracao_<Equip> = Integracao_<Equip>;`

## `node/api.js` (6000+ linhas: editar pontual)

1. `var <Modulo> = require("./api_<fabricante>");` junto dos outros e `global.<Modulo> = <Modulo>;`.
2. Rota do push no roteador do `http.createServer`, **antes** do ramo `/log`, casando com o
   caminho fixo do firmware:
   ```js
   else if (request.url.indexOf("/LAPI/V1.0/System/Event/Notification") != -1 || request.url.indexOf("/LAPI/V1.0/Channel/0/Event/") != -1) {   // Nice FR300 (caminhos fixos do firmware)
       NiceFR300.Integracao_Nice_FR300(request, response, result.query, ip_cliente, inicioT);
   }
   ```
   Confira que nenhum ramo anterior captura o caminho.
3. Tipo na lista de `Listar_Placas_Cortex5` (`[2,3,5,...,51,52].indexOf(parseInt(leitor.tipo))`).
4. Ramo em `Ler_Status_Portas_Equip(tipo, ip, serial)` com as mesmas portas da base, e o módulo
   gravando o estado com `Leitor_Seta_Porta` antes do `processa_sensor` (modelos tipos 17, 29 e 42):
   [portas.md](portas.md).

## `node/api_equipamentos.js`

```js
else if ( param.tipo == 52) {
    global.NiceFR300.Api(param, callback);
}
```
antes do `else if ( param.op == "ping")` genérico (senão o ping do tipo novo vira ICMP).

## Painel e documentação do repositório

- `images/equip<N>.png`: sem ela o painel fica sem ícone. Provisória (cópia de outro tipo) até
  ter a foto, e isso fica anotado como pendência.
- `ARQUITETURA.md`: módulo na árvore de `node/` e linha na tabela de tipos.

## Testes (`testes/<equipamento>.test.js`, `node:test`)

Roteiro completo (tela, Sincronizar Equip., ações por pessoa, robustez, integração com o aparelho
real): [testes.md](testes.md). Abaixo, só o harness do unitário.

O `api.js` **não** é carregado (sobe servidor e banco ao carregar): os pontos dele são conferidos
no código-fonte por regex (require/global, rota antes do `/log`, lista de
`Listar_Placas_Cortex5`, ramo de `Ler_Status_Portas_Equip`, ramo de `Acionar_Porta_Equipamento`
sem outro ramo capturando o tipo).

O módulo é carregado com **globals falsos** definidos antes do `require`:

- `global.req` falso que registra método, URL, corpo, cabeçalhos (`Content-Length`), timeout e
  `auth`, e responde como o aparelho (respostas reais da bancada guardadas na investigação), com
  um `responder` trocável por teste para simular erro e "já existe".
- `global.cfg`, `global.meuip`, `Log`, `Erro`, `MsgClientes`, `SetEquipamentoStatus`,
  `processa_sensor`, `GetEquipamento`, `ChamarWS`, `Sql_Pessoas_TagConvite_ativos`, `executa`,
  `Existe_Arquivo` e `fs.readFileSync` interceptado para `/var/www/fotos/`.
- `global.padl` e `global.TiraAcento` **reais**, extraídos do código-fonte (`api.js`,
  `api_util.js`) com `new Function`, nunca uma cópia: foi assim que o teste pegou o `padl` com
  número.
- `Push(ip, corpo, url)` com um `EventEmitter` no papel do `request` e um `response` falso.
- `api_equipamentos.js` carregado de verdade para provar o despacho do tipo.

Um teste por check da `tlc-spec-lean` (nome começando com o id: `C13 push em tempo real ...`),
cada bug de bancada com o seu. Rodar:

```bash
node --test testes/<equipamento>.test.js                      # um check: --test-name-pattern="C13 "
for t in testes/*.test.js; do node --test "$t"; done          # regressão (mais os outros de testes/ da área)
```

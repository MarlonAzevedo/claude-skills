# Investigar o equipamento antes do plano

Objetivo: saber, com fonte, cada rota e cada campo que o módulo vai usar. O resultado vira a nota
`documentacao/equipamentos/equipamentos-<fabricante>-<modelo>.md` e a seção de fontes do plano.

## 1. Quem fabrica de verdade

- A marca da caixa nem sempre é o fabricante: o Nice FR300 é **Uniview**. O serial (`210235…`),
  o firmware e as rotas da página web dizem a família da API: `/LAPI/...` (Uniview),
  `/ISAPI/...` (Hikvision), `/cgi-bin/...` (Dahua/Intelbras), entre outras.
- Se a família já existe no Córtex (`ls node/api_*.js`), reaproveite o módulo ou parte dele em
  vez de duplicar.

## 2. Documentação

- Baixe para o scratchpad o manual da API e o manual do aparelho (PDF do fabricante e da marca
  revendedora). Leia as rotas que importam: dados do aparelho (serial, modelo, firmware), hora,
  abertura remota, pessoas/faces/cartões, assinatura ou push de eventos, alarmes e estado da
  porta, reinício, códigos de erro.
- Leia a **página web do aparelho**: os scripts da interface (no FR300,
  `/script/common/ComScript*.js`, `/page/PTS/pts_advancedSetting*.htm`,
  `/page/PTS/operate_IOPort*.htm`) mostram rotas e valores que o manual não traz (`OpenDoorMode`,
  `GUIShowInfo`, mapa de protocolos do servidor de eventos).
- Rota sem documentação mas confirmada na bancada entra na nota como "não está no manual,
  confirmado em <data>".

## 3. Credenciais e autenticação

- Padrão de fábrica do FR300: usuário `admin`, senha `123456`, HTTP Digest. Confira o do aparelho
  novo no manual; vira o default da tela (`MudouTipo`).
- Algumas unidades respondem sem senha: teste com e sem, e o módulo autentica só quando a tela
  manda usuário (`if (param.usuario) requisicao.auth(usuario, senha, false)`).
- Com Digest, confira se o aparelho exige `Content-Length` em requisição sem corpo (o FR300 exige).

## 4. Descobrir as rotas na bancada

- Só `GET` até o usuário autorizar `PUT`/`POST`/`DELETE` no aparelho. Antes de mudar uma
  configuração, guarde o valor original (vai para a nota).
- Para cada op do módulo, uma chamada real com `curl --digest -u admin:<senha>` e a resposta
  guardada no scratchpad: é dela que saem os campos e os códigos de erro dos testes.
- Teste os casos de borda que viram armadilha: foto sem rosto (o FR300 aceita a pessoa e recusa
  a face com `ResultCode 1002`), pessoa já existente, exclusão de quem não existe, tamanho máximo
  de texto na tela (32 caracteres no FR300).

## 5. Eventos: assinatura ou push

- Como o aparelho avisa reconhecimento, porta e alarme: assinatura criada pelo Córtex (FR300:
  `POST /LAPI/V1.0/System/Event/Subscription`, `Duration` 4294967295, `StatusCode` 14 = já
  existe), servidor de eventos configurado no aparelho, ou polling.
- Caminho e formato do que chega: suba um **receptor HTTP de diagnóstico** no host (porta
  liberada no UFW só para o IP do aparelho) e anote método, URL, cabeçalhos e corpo reais. A rota
  do Córtex (`api.js`) casa com esses caminhos fixos do firmware.
- Pergunte e teste: o aparelho reenvia o que não foi confirmado? (FR300: sim, como histórico,
  `NotificationType` 1 — o módulo ignora histórico.) Quantas assinaturas entrega ao mesmo
  tempo? A assinatura sobrevive ao reinício? (FR300: não.) Qual resposta ele espera do Córtex?
- Remova as regras temporárias do UFW e o receptor no fim.

## 6. Modo online / remoto

- Quem decide o acesso: o aparelho com a lista local (abre sozinho e só avisa) ou o Córtex
  (modo remoto: o aparelho reconhece e espera a resposta). Na ONE o padrão é o **Córtex decidir**
  (o `index.php` valida a tag `f` + `cd_acesso` como qualquer facial), com o resultado na tela
  do aparelho com as mesmas mensagens do `HikRemoteCheck` ("Acesso Liberado", "SEM VAGAS",
  motivo sem acento, "Erro ao validar").
- Descubra o que acontece com o Córtex fora no modo remoto (o Hikvision tem `remoteCheckTimeout`;
  o FR300 não tem fallback documentado). Sem resposta testada, fica como pendência e decisão do
  usuário, nunca como suposição.

## 7. Portas físicas

- Relés, entradas (botoeira, sensor de porta, tamper, incêndio) e saídas de alarme, pela página
  de IO do aparelho ou pelo manual. Decida com o usuário o que vira comando e sensor na ONE.
- FR300: F1 fechadura → comando `1` "Abrir Porta" (`RemoteOpened`, pulso); estado da porta →
  sensor `201`; porta aberta além do tempo → sensor `202`; botoeira aciona no próprio aparelho e
  não vira sensor.

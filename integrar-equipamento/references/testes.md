# Testes e validação (obrigatório)

O usuário não deveria precisar pedir nenhum destes itens: tudo aqui faz parte da integração.
Cada função vira check da `tlc-spec-lean` com prova; o que só dá para ver na bancada vira
pendência escrita, nunca "deve funcionar". Modelo completo: Nice FR300 (tipo 52, tarefa 81299),
`cortex/testes/nice_fr300.test.js` e `cortex/testes/nice_fr300_integracao.sh`.

## 1. Três níveis de teste

| Nível | Onde | O que prova |
|---|---|---|
| Unitário Córtex | `cortex/testes/<equipamento>.test.js` (`node:test`, aparelho falso) | rota, corpo, cabeçalho e resposta de cada op e de cada push |
| Tela da base | `wsOnePortaria/testes/<equipamento>_tela.test.js` (jsdom) e `<equipamento>_tipo_test.php` | o que fica **visível** no fim e a lista de portas |
| Integração | `cortex/testes/<equipamento>_integracao.sh --filter=Cn` | o botão da tela chega no aparelho real e o efeito aparece no aparelho e na base |

O unitário com aparelho falso não basta: no FR300, `Zerar Usuários`, alarmes no formato
`Json=`, o `ping` que derrubava o Córtex e o "Ativar equip." que reiniciava o aparelho só
apareceram contra o aparelho real.

## 2. Tela de equipamento da base (`adm/cad_one_equipamento.html`)

A tela tem duas camadas: o ramo do tipo no `MudouTipo` e o `atu_leitores`, que roda **depois** e
mostra/esconde por listas fixas de tipos (`cfg_excallusr` só para `[7, 12, 18, 19, 20]`,
`grp_captura_facial`/`grp_facial`/`grp_libera_pulseira_facial` por `leitorfacial`,
`grp_forcar_ocad_tela` por exclusão). Conferir só o texto do ramo deixou o "Zerar Usuários"
escondido no FR300.

Teste jsdom (modelo `wsOnePortaria/testes/nice_fr300_tela.test.js`): carrega o HTML real e o
`adm/assets/js/jquery-1.10.2.js`, extrai `MudouTipo`, `atu_leitores`, `resetCampos`,
`AtivaReiniciaAuto`, põe a opção do tipo no `#tipo` (as opções vêm do PHP) e confere a
visibilidade final (elemento e ancestrais sem `display: none`).

Regra: **todo botão e opção visível para o tipo tem de funcionar no módulo**; o que o módulo não
atende fica escondido. Faça a tabela e transforme cada linha em check:

| Elemento | Chega como | Prova |
|---|---|---|
| Ativar equip. (`cfg_online`) | `config_equipamento.php` → Córtex `op=online` | integração: responde ok, aparelho configurado (modo, hora, assinaturas) |
| Sinc Usuários/Fotos (`cfg_sincusuarios`) | `op=sincusuarios` | integração: pessoas com foto aparecem no aparelho (contagem) |
| Zerar Usuários (`cfg_excallusr`) | `op=excallusr` | integração: biblioteca do aparelho vazia |
| Desativar/Reiniciar/Reset fábrica | `op=offline/reset/resetfab` | esconder se o módulo não atende |
| Captura Facial (`grp_captura_facial`, `facialprincipal`) | websocket/HTTP `op=capfoto`, `capfotocanc`, `capbiocanc` | unitário do fluxo + integração das ops; rosto real na bancada |
| Inibe Comando Rele (`inibe_comando_rele`) | `index.php` do Córtex não aciona o relé da entrada | integração: com 1 não chega `cmd` ao aparelho, com 0 chega |
| Liberar Pulseiras (`libera_pulseira_facial`) | QrToken `posProcessaEvento` → `desbloqueiaTags` no `OACC` | integração: tag bloqueada do imóvel volta a `personalizado = 0` |
| OCAD Vai p/ Tela (`forcar_ocad_tela`) | QrToken `preProcessarEventoNaoTratado` | integração: `OCAD` entra em `one_tratar_evento` com a opção ligada e não entra desligada |

As três opções de baixo dependem só de o evento da base sair com o `id_equipamento` do aparelho
(o módulo valida com `ip_leitor` e `equipamento` = serial). Mesmo assim teste: no FR300 o
"OCAD Vai p/ Tela" não funcionava para **nenhum** equipamento (cache do QrToken sem o campo).

## 3. Tela "Sincronizar Equip." (`adm/atualizar_dmi.php` → `web/atualizar_dmi.php`)

| Botão | Efeito esperado | Reflete no aparelho? |
|---|---|---|
| CONDOMÍNIO, EQUIPAMENTOS, GRUPOS, ENTRADAS, Garagens, MORADORES, IMÓVEIS, TAGS, CONVITES, Usuários, Automações | grava a tabela no MySQL do Córtex (`atu_tabela.php`) e avisa o Node | não (igual aos outros faciais); EQUIPAMENTOS recarrega o cadastro e as portas |
| FOTOS p/ leitores | base copia as fotos da seleção do `equipamentos/compacta_fotos.php` e o QrToken manda ao Córtex (`POST :3000/fotos/?sinc=0`) | não: só leva ao Córtex; o "Sinc Usuários/Fotos" envia |

Teste do **envio completo**: dispare FOTOS p/ leitores no servidor da base, confira que **toda**
pessoa da seleção do `compacta_fotos.php` (mesma consulta no SQL Server) com foto na base tem
`/var/www/fotos/f<cd_acesso>.jpg` no Córtex; depois Zerar + Sinc e confira que o aparelho ficou
com uma pessoa para cada pessoa ativa com foto no Córtex (`Sql_Pessoas_TagConvite_ativos`). Os
filtros da base e do Córtex não são iguais (tag personalizada sem data final): compare cada lado
com a sua consulta e anote a diferença.

## 4. Ações por pessoa (fluxos gerais do Córtex)

O módulo novo precisa atender o que o Córtex já manda para **todos** os faciais
(`api_equipamentos.js`, `api.js`):

| Origem | Chega no módulo | Teste |
|---|---|---|
| Foto salva de uma pessoa (`POST :3000/fotos/?cd_acesso=&tp=facial&sinc=1`) | `sincusuarios` com `cd_acesso` | integração: a pessoa aparece no aparelho (busca por código) |
| Captura em outro facial (`SincUsuariosSecundarios`) | `sincusuarios` com `param.usuarios` | unitário: envia só a lista, sem consultar o banco |
| Base exclui face ou pessoa (`excluirFaceEquipamentos` → `op=excfoto` sem `ip`) | `excfoto` | integração: a pessoa sai do aparelho |
| Bloqueio na saída (`op=expirartag` sem `ip`) | `excusr` | integração: a pessoa sai |
| Hora (`op=setadata` sem `ip`) | `setadata` | unitário |
| Captura pela aba Web / Plus | `capfoto`, `capfotocanc`/`capbiocanc` | unitário do fluxo completo (iniciada, aceita, recusada, tempo esgotado, cancelada) |

Op sem tratamento só vira "Op não implementada" no log e a função da tela falha calada.
Só `excfoto`, `capfoto`, `capbio`, `expirartag` e `sincusuarios` passam sem `ip` pela rota
`/equipamento/` (`excusr` sem `ip` volta "Parametros incompletos").

## 5. Robustez (sempre)

- **Córtex reiniciado** e "Ativar equip." de novo: nada de configuração repetida que o aparelho
  não aceite (no FR300 a assinatura repetida reiniciava o aparelho; o módulo grava os IDs em
  `node/<equipamento>_assinaturas.json` e apaga antes de recriar). Vigie o aparelho 3 min.
- **Aparelho reiniciado** (rota de reboot): o ping vê cair e voltar e o Córtex reconfigura sozinho.
- **Ping perdido** sem o aparelho cair: não pode repetir configuração.
- **`/equipamento/?op=ping` pela rota HTTP**: responde texto e o container não reinicia
  (`docker inspect -f '{{.State.StartedAt}}'` igual antes e depois).
- **Comando de lote que o firmware não tem** (FR300 sem `DelLibPeople`): plano B testado.
- **Formato real dos avisos**: capture o que chega de verdade (alarmes do FR300 vinham como
  `Json={...}` com o corpo cortado) e cubra com unitário usando o texto real.

## 6. Script de integração (`testes/<equipamento>_integracao.sh`)

Padrão dos `*_integracao.sh` da base, CRLF, rodado com `bash <(sed 's/\r$//' ...) --filter=Cn`:

- SQL no `.241` pelo `node` + `mssql` do container `wsoneportaria` (credenciais do `config.json`
  lidas lá dentro, nunca impressas); MySQL do Córtex por `docker exec ... mysql`.
- Botões da tela por `POST http://127.0.0.1/wsOnePortaria/equipamentos/config_equipamento.php`
  dentro do `wsoneportaria`; validação como o módulo chama
  (`docker exec <cortex> curl http://127.0.0.1/API/?tag=f00<cd>&porta=1&ip_leitor=<ip>&equipamento=<serial>`);
  aparelho direto pela API dele para conferir o efeito.
- Dados próprios ("TESTE <tarefa>"), criados no começo e apagados num `trap ... EXIT`, e as opções
  do equipamento e da conta (`inibe`, `libera`, `forcar`, `captura`, `bloq_tags_hr*`,
  `one_base.nivel_log`) guardadas e devolvidas, também em falha.
- Sincronizar o que mudou com `web/atualizar_dmi.php/?tabela=<imoveis|pessoas|tag|grupo|entrada|equipamento|config>&conta=`.
- Um check por bloco (`if roda C55; then ...`), um por vez (alguns reiniciam o Córtex ou o aparelho).

Armadilhas para montar os dados (custaram rodadas no FR300):

- Entrada que libera: `leitores` = `,0#<id da porta L>&1,` (o `&sentido` é obrigatório; o
  `index.php` busca `%#<id>&%`), `id_porta_rele` = porta C, `inter_travamento = 0`, e o grupo da
  tag (`one_tags.id_grupo`, um grupo que exista no Córtex da conta) ligado à entrada em
  `one_grupo_entrada` — grupo master não dispensa o vínculo.
- `one_tags` exige `id_central`, `tag`, `data`; tag desconhecida gera `OCAD` e a base grava a tag
  sem pessoa (novo dispositivo): apague também pelo valor da tag.
- Eventos vão para a base do `one_config.ws_portaria` do Córtex: OCAD e pulseira são tratados pelo
  QrToken **desse servidor**, não pelo container local. Recarga do condomínio:
  `POST <base>:3000/v2/ReloadCache/CondoCache {"id_central":...}`; cache de equipamentos relê a
  cada 60 s. Correção no QrToken só passa no teste depois de publicada lá.
- `bloq_tags_hr_ativo = 1` com `bloq_tags_hr` vazio derruba o QrToken: configure um horário longe
  de agora.
- O Córtex zera `one_base.nivel_log` 10 s depois de fechar a página `/config`: prova que lê log
  liga o nível antes (e devolve); prefira conferir o efeito no banco (`one_log`, `one_tratar_evento`).
- Ordem de chaves no JSON (`{"255":..,"1024":..}`): compare com `jq`, não com regex.

## 7. Bancada (o que só o aparelho mostra)

Com o Córtex **na mesma rede** do aparelho (`docker-cortex/subir.sh` com alias na rede da bancada,
1º IP do `ws_modulo` e IP do cadastro atualizados):

- rosto/credencial reconhecido gera `OACC`/`OANG` do equipamento em `one_log` e o resultado aparece
  na tela do aparelho;
- relé abre pelo botão da tela e pela validação;
- sensores mudam abrindo e fechando a porta; botoeira, tamper, incêndio;
- captura facial com rosto de verdade;
- comportamento com o Córtex fora do ar (o que o aparelho faz sozinho).

Pela VPN: o aparelho pode chegar com o IP do NAT (identifique pelo serial do aviso) e pacotes
grandes podem sumir no túnel (teste `ping -M do -s 1400`; MSS no `wg0`). Avisos pequenos chegando
e grandes não é sinal de MTU, não de código.

# Portas (leitores, comandos e sensores)

As portas existem em três lugares que têm de dizer **os mesmos números**:

| Onde | O quê |
| --- | --- |
| Base: `lista_portas_equip_tipo($tipo, $filtro, ...)` (`adm/inc/funcoes.php`) | define as portas; `One_equipamento::Save` → `Gerar_Portas()` (`adm/Model/One_equipamento.class.php`) grava em `one_equipamento_porta` |
| Córtex: `Ler_Status_Portas_Equip(tipo, ip, serial)` (`node/api.js`) | o que a tela de status lista, com o estado de cada porta (`global.Leitor_Ler_Porta`) |
| Módulo `node/api_<fabricante>.js` | comando chega em `op = "cmd"` com `param.pt`; sensor sai por `global.processa_sensor(ip, "<porta>", "0"\|"1", serial, inicioT)` |

## Modelo: tipo 17 (Leitor Facial HikVision)

Comece por ele e pelo 29: são os faciais de referência e seguem o padrão gerado por quantidade.

Base, bloco de quantidades do topo de `lista_portas_equip_tipo`:
```php
} elseif ( $tipo == 17 ) {	// Facial HikVision
	$leitores = 1;	$porta_leitores = 1;
	$sensores = 2;	$porta_sensores = 201;
	$comandos = 1;	$porta_comandos = 1;
	if (!empty($modelo) && strpos($modelo,"KV9503") !== false) {
		$comandos = 2;
	}
```
Sem ramo próprio nos blocos `S` e `C`, os laços genéricos geram as descrições:
`Leitor 1` (L, porta 1), `Sensor 201` e `Sensor 202` (S), `Relé 1` (C, porta 1). O `$modelo` muda a
quantidade por modelo (KV9503 tem 2 relés) — use o mesmo recurso se a família tiver variações.

Córtex, `Ler_Status_Portas_Equip`:
```js
else if (tipo == 17) { // leitor facial HikVision
    portas = {
        leitores: [ [1, 1] ],
        comandos: [ [1, global.Leitor_Ler_Porta(ip,1)] ],
        sensores: [ [201, global.Leitor_Ler_Porta(ip,201)], [202, global.Leitor_Ler_Porta(ip,202)] ]
    }
}
```

Módulo (`node/api_hikvision.js`): evento de porta (subEventType 25/26/27) → sensor `"201"`;
botoeira (23/24) → sensor `"202"` e `Gerar_Evento_Botoeira`; o comando abre a porta pelo `pt`.
Para a tela de status mostrar o estado, grave antes de avisar:
`global.Leitor_Seta_Porta(ip, porta, stat)` e depois `global.processa_sensor(...)`
(`Processa_Sensor_HikVision`, `api_controlid.js`, `api_bravo.js`, endpoints). O `processa_sensor`
sozinho **não** atualiza o estado que `Leitor_Ler_Porta` lê.

## Modelo: tipo 29 (Leitor Facial ZKTeco SpeedFace M4)

Mesmo padrão gerado, com outra faixa de sensores e o melhor exemplo de controle de estado.

Base: `$leitores = 1; $porta_leitores = 1; $sensores = 2; $porta_sensores = 211; $comandos = 1;
$porta_comandos = 1;` → `Leitor 1`, `Sensor 211`, `Sensor 212`, `Relé 1`.

Córtex, `Ler_Status_Portas_Equip`:
```js
else if (tipo == 29) { // Facial ZKTeco
    portas = {
        leitores: [ [1, 1] ],
        comandos: [ [1, "1"] ],
        sensores: [ [211, global.Leitor_Ler_Porta(ip,211)], [212, global.Leitor_Ler_Porta(ip,212)] ]
    }
}
```

Módulo (`node/api_zkteco_push.js`, `ZkProcessar_Eventos`): a porta do sensor é calculada do evento
(`200 + door * 10 + sns`, `sns` 1 = abertura acidental, 2 = demais alarmes) e só é avisada quando o
estado muda:
```js
var ult_status = Leitor_Ler_Porta(ip_cliente, porta);
if (status !== ult_status) {
    Leitor_Seta_Porta(ip_cliente, porta, status);
    global.processa_sensor(ip_cliente, porta, status, serial, inicioT, ( status=="0" ? 100: 0 ) );
}
```
Copie esse trecho: evita evento repetido na base e mantém a tela de status certa.

## Modelo completo de relés e sensores: tipo 42 (Endpoint Full)

Para equipamento com vários relés, sensores e leitores, siga o 42: faixas separadas por centena,
uma função de estado para relé e outra para sensor, pulso pelo `tempo`.

Base: `$leitores = 2; $porta_leitores = 1; $sensores = 8; $porta_sensores = 201; $comandos = 4;
$porta_comandos = 101;` → `Leitor 1-2`, `Sensor 201-208`, `Relé 101-104`.

Córtex, `Ler_Status_Portas_Equip` (até os leitores têm estado):
```js
else if (tipo == 42) {  // Endpoint Full
    portas = {
        leitores: [ [1, global.Leitor_Ler_Porta(ip,1)], [2, global.Leitor_Ler_Porta(ip,2)] ],
        comandos: [ [101, global.Leitor_Ler_Porta(ip,101)], [102, global.Leitor_Ler_Porta(ip,102)], [103, global.Leitor_Ler_Porta(ip,103)], [104, global.Leitor_Ler_Porta(ip,104)] ],
        sensores: [ [201, global.Leitor_Ler_Porta(ip,201)], ..., [208, global.Leitor_Ler_Porta(ip,208)] ]
    }
}
```

Módulo (`node/api_endpoint_full.js`):

- **Comando** (`EndpointFullComando`): `pt` 101-104 vira o relé do aparelho (`/relay<pt - 100>/on|off`);
  com `param.stat == "1"` e `param.tempo > 0`, um `setTimeout` manda o `off` depois do tempo (pulso).
- **Push de status**: o aparelho manda JSON com a porta como chave
  (`{"serial":"...","201":"0","101":"1","1":"0"}`); o módulo separa pela faixa: `2xx` sensor
  (`209`/`210` analógicos), `1xx` relé, um dígito leitor.
- **Estado do relé** — atualiza banco, tela e cache, sem `processa_sensor`:
  ```js
  function EndpointFullSetaStatusRele(param, porta, stat) {
      var ult_status = global.Leitor_Ler_Porta(param.ip, porta);
      var status_atual = ""+stat;
      if (status_atual !== ult_status) {
          global.Atualiza_Status_Porta(porta, status_atual, param.serial);
          global.MsgClientes('cmd', [[porta, status_atual, param.serial]]);
          global.Leitor_Seta_Porta(param.ip, porta, status_atual);
      }
  }
  ```
- **Estado do sensor** — o mesmo e, no fim, o `processa_sensor` (gera o evento na base):
  ```js
  function EndpointFullSetaStatusSensor(param, porta, stat) {
      var ult_status = global.Leitor_Ler_Porta(param.ip, porta);
      var status_atual = ""+stat;
      if (status_atual !== ult_status) {
          global.Atualiza_Status_Porta(porta, status_atual, param.serial);
          global.Leitor_Seta_Porta(param.ip, porta, status_atual);
          MsgClientes('sns', [[porta, status_atual, param.serial]]);
          global.processa_sensor(param.ip, porta, status_atual, param.serial, new Date().getTime());
      }
  }
  ```
  `MsgClientes('cmd'|'sns', ...)` atualiza a tela do Córtex na hora.
- **Atenção — não copie a duplicação do sensor**: o `processa_sensor` (`node/api.js`) já chama
  `Atualiza_Status_Porta` e `MsgClientes('sns', ...)`. No sensor, o 42 faz os dois de novo antes
  (grava `one_status` e avisa a tela duas vezes). Equipamento novo usa a estrutura do 42 sem isso:
  ```js
  // Estrutura do Endpoint Full: grava o estado e só avisa quando muda.
  // O processa_sensor já grava one_status (Atualiza_Status_Porta) e avisa a tela (MsgClientes)
  function SetaStatusSensor(equip, ip_cliente, porta, status) {
      if (global.Leitor_Ler_Porta(ip_cliente, porta) !== status) {
          global.Leitor_Seta_Porta(ip_cliente, porta, status);
          global.processa_sensor(ip_cliente, porta, status, equip.serial, Date.now());
      }
  }
  ```
  (é a do Nice FR300, tipo 52). No relé, que não passa pelo `processa_sensor`, as três chamadas
  do 42 continuam necessárias.

## Quando sair do padrão gerado

Use lista explícita nos blocos `S`/`C` só quando o nome genérico ("Sensor 201", "Relé 1") não diz
o que a porta é, e copie a convenção da família mais próxima:

- Sensor de porta / botoeira em **310/311**: Control ID (7, 18, 20) e Facial Intelbras (19, `310`
  "Sensor Porta", `311` "Botoeira").
- Comandos com nome: `Manter Aberto` (Control ID 7/18, catraca 45), sentidos de catraca (12, 45).
- Sensores em **201+** / **211+** e relés em **101+** gerados: HikVision (17), ZKTeco (29),
  Endpoint Full (42), Brasvas, Rasp.

Exemplo de lista explícita — Facial Intelbras (19):
```php
if ( $tipo == 19 ) { // Facial Intelbras
	$lista[] = array("porta"=>310, "tipo"=>"S", "descricao"=>"Sensor Porta", "numero"=>1);
	$lista[] = array("porta"=>311, "tipo"=>"S", "descricao"=>"Botoeira", "numero"=>2);
}
```
O bloco de quantidades continua existindo mesmo com lista própria: ele define os leitores e serve
de fallback. `numero` é a ordem dentro do tipo (1, 2, …), `porta` é o número que o Córtex usa.

Exemplo de equipamento novo no padrão gerado — Nice FR300 (52): começou com 310/311 em lista própria
e foi trocado para o padrão do 42 (`$sensores = 2; $porta_sensores = 201;`, sensor 201 = estado da
porta, 202 = porta aberta além do tempo); só o comando tem nome próprio (`1` "Abrir Porta"). Se
mudar as portas de um tipo já cadastrado, regrave os equipamentos para o `Gerar_Portas` refazer.

## Verificação das portas (obrigatória)

Faça para o tipo novo e compare com os tipos 17 e 29 (faciais) e 42 (vários relés e sensores):

1. **Base x Córtex**: a saída de `lista_portas_equip_tipo(N, "LSC")` (porta e tipo) é igual ao
   ramo de `Ler_Status_Portas_Equip` (leitores, comandos, sensores). Teste nos dois repositórios
   (`testes/<equipamento>_tipo_test.php` lê a lista; `testes/<equipamento>.test.js` confere o ramo
   no fonte do `api.js`).
2. **Módulo x Córtex**: todo número que o módulo manda para `processa_sensor` e todo `pt` que o
   `cmd` aceita está nas listas acima; porta fora delas é erro claro no `cmd`.
3. **Cadastro**: salve o equipamento pela tela e confira `one_equipamento_porta`:
   ```sql
   SELECT tipo, numero, porta, descricao FROM one_equipamento_porta
   WHERE id_equipamento = <id> AND excluido = 0 ORDER BY tipo, numero
   ```
   Equipamento já cadastrado antes de mudar as portas: salve de novo para o `Gerar_Portas` refazer.
   Depois **sincronize com o Córtex** ("Atualizar EQUIPAMENTOS" na tela Sincronizar Equip., ou
   `web/atualizar_dmi.php/?tabela=equipamento&conta=<conta>`) e confira a mesma consulta no MySQL do
   Córtex: no FR300 a base já tinha 201/202 e o Córtex continuava com 310/311 até sincronizar.
4. **Tela de comandos da base**: aparecem só os comandos do tipo, com a descrição certa; cada botão
   chega no módulo como `op = "cmd"` com o `pt` esperado (log do Córtex).
5. **Tela de status do Córtex**: lista leitores, comandos e sensores do tipo, e o estado de relé
   e sensor muda na hora (`Leitor_Seta_Porta` + `Atualiza_Status_Porta` + `MsgClientes`, como no 42).
6. **Relé ao vivo**: cada comando pelo Córtex (`/equipamento/?op=cmd&ip=&tipo=&pt=<porta>&stat=1&tempo=800`)
   responde e o aparelho age (confirmação do próprio aparelho, como o `Status/RemoteOpened` do
   FR300, ou log `Porta <n> aberta`); `pt` fora da lista volta erro. Pela entrada: a validação de
   uma tag liberada aciona o relé da entrada (`id_porta_rele`) e, com "Inibe Comando Rele" ligado,
   não aciona.
7. **Sensores ao vivo**: capture o aviso real do aparelho para cada sensor (formato e campos podem
   diferir da documentação: o FR300 manda `Json={...}` cortado) e confira `processa_sensor` com a
   porta certa, `one_status` e a tela de status do Córtex mudando; o mesmo estado repetido não gera
   evento.
8. **Bancada**: abrir/fechar a porta e apertar a botoeira geram o evento do sensor certo na base;
   o relé abre pelo botão da tela; o que não foi visto fica como pendência escrita.

Os passos 1 a 3 entram em teste automatizado; 6 e 7 no script de integração
([testes.md](testes.md)); 4, 5 e 8 são conferidos na tela e na bancada.

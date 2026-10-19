# Base (wsOnePortaria)

Banco: nenhuma tabela nova. O tipo fica em `one_equipamento.tipo` e as portas em
`one_equipamento_porta`, geradas pela tela (`One_equipamento::Save` → `Gerar_Portas`).
Equipamento já cadastrado antes da mudança precisa ser **salvo de novo** na tela para ganhar as
portas.

## Encoding (antes de editar)

`adm/`, `inc/` e `equipamentos/` são **Windows-1252 + CRLF**. Edite por troca pontual (o mod
`guarda-encoding` ajuda, mas confira), acento escrito como byte Windows-1252 (`ó` = `\xF3`), e
antes do commit:

```bash
file adm/inc/funcoes.php adm/cad_one_equipamento.html   # continua Non-ISO/ISO-8859 + CRLF
git diff --stat                                         # poucas linhas, não o arquivo inteiro
git diff adm/inc/funcoes.php | iconv -f WINDOWS-1252 -t UTF-8
```

## `adm/inc/funcoes.php`

**`lista_equipamentos()`**: um item `array("<N>", "<Descrição na tela>", "<Modelo>")` no fim da
lista. FR300:

```php
$lista[] = array("52", "Nice - Leitor Facial FR300", "Nice - Leitor Facial FR300");
```

**`lista_portas_equip_tipo($tipo, $filtro, ...)`**: quantidades no bloco do topo (padrão gerado,
modelos tipos 17, 29 e 42) e, só se o nome genérico não servir, lista explícita nos blocos `S`/`C`.
Padrão, exemplos e a verificação obrigatória: [portas.md](portas.md).

## `adm/cad_one_equipamento.html`

- **Lista `leitorfacial`**: se o equipamento é facial, inclua o tipo no
  `$('#leitorfacial').val([11, 17, 45, 18, 19, 23, 29, 52].indexOf(tipo) ...)`. É esse campo que
  faz o Córtex mandar faces para o aparelho.
- **`MudouTipo()`**: um ramo `} else if (tipo == N) {` que mostra/esconde campos e botões. Mostre
  **só os botões cujas ops o módulo atende**: `CfgEquip('<op>')` manda a op direto para o Córtex
  (`equipamentos/config_equipamento.php` → `wsServidorLeitor(...):3000/equipamento/?op=...`).
  IDs: `cfg_online` (Ativar equip. → `online`), `cfg_offline`, `cfg_reset`, `cfg_resetfab`,
  `cfg_excallusr` (`excallusr`), `cfg_lerbio`, `cfg_sincbio`, `cfg_sincusuarios`
  (`sincusuarios`); grupos `grp_usuario`, `grp_facial`, `grp_captura_facial`,
  `grp_captura_biometria`, `grp_porta_leitor`, `grp_leitor_prin`, `grp_chave_online`,
  `grp_comandos_equip`, `equip7`. O botão de informações (`AtuVersao` →
  `cad_one_equipamento_versao.php`) usa a op `versao` e grava `versao_base`, `modelo`, `serial`.
- **Defaults de usuário/senha** de fábrica, só quando vazios:
  ```js
  if ($('#usuario').val() == "") { $('#usuario').val("admin"); }
  if ($('#senha').val() == "") { $('#senha').val("123456"); }
  ```

## Respostas do Córtex com acento

`config_equipamento.php` junta texto Windows-1252 com a resposta do Córtex (UTF-8) e faz
`utf8_encode` no fim. A resposta passa por `resposta_cortex_iso()` (`inc/funcoes_ws.php`) logo
depois do `ChamarWS`. Tela nova que mostre resposta do Córtex faz o mesmo.

## Teste

`testes/<equipamento>_tipo_test.php`, sem banco: inclui `adm/inc/funcoes.php`, confere o item de
`lista_equipamentos()`, as portas de `lista_portas_equip_tipo(N, "LSC")` (com `utf8_encode` na
descrição), a lista `leitorfacial` e o ramo do `MudouTipo` lidos do HTML por regex. Modelo:
`testes/nice_fr300_tipo_test.php` (com `--filter=C2`). Rodar:

```bash
docker exec wsoneportaria php /var/www/html/wsOnePortaria/testes/<equipamento>_tipo_test.php
```

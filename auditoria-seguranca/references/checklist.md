# Checklist de segurança (genérico)

Livro-razão de cobertura, não substituto de seguir o fluxo real de dados e de
autoridade. Para cada item, marque: **aplicável + revisado (com evidência)**,
**não aplicável (com motivo)** ou **achado**. "Revisei auth" sem arquivo,
função e teste citados não conta como cobertura.

Seções 1–13 valem para qualquer projeto. Da seção 14 em diante, aplique **só**
os ecossistemas cujos manifests existem no repo.

## 1. Escopo e arquitetura

- Commit/intervalo exato, árvore suja ou limpa, modo (dev/prod) e arquivos de
  deploy correspondentes.
- Ativos: credenciais, dados pessoais, dados por tenant, pagamento, execução
  de código, filesystem, disponibilidade, integridade do histórico.
- Atores: anônimo, usuário, admin de tenant, admin global, serviço/webhook,
  plugin, CI, mantenedor de dependência, atacante de rede.
- Pontos de entrada mapeados até o handler real (rotas registradas vs
  arquivos de rota: divergência é candidato).

## 2. Autenticação e sessão

- Token/sessão gerado com CSPRNG; só o hash persistido; plaintext nunca logado
  nem devolvido de novo.
- Expiração aplicada no caminho de validação; token sem expiração?
- Logout revoga; troca de senha, desativação e exclusão revogam as sessões
  existentes.
- Senha: KDF adequado (bcrypt/argon2/scrypt), limite de tamanho (bcrypt
  trunca em 72 bytes), erro de login que não revela se a conta existe.
- Enumeração de conta em cadastro, reset e reenvio de e-mail.
- Comparação de segredo em tempo constante; JWT com algoritmo fixo,
  audience/issuer validados, sem `none`.
- OAuth/SSO: `state`, PKCE, redirect_uri exato.

## 3. Autorização e multi-tenancy

- Nega por padrão; auth é middleware global ou por handler? Se for por
  handler, **todo** handler precisa chamar a checagem — liste os públicos
  intencionais.
- Papel conferido contra a matriz documentada (API.md, docs, policies).
- **IDOR/BOLA**: toda leitura/escrita por id filtra por dono ou tenant — GET
  de lista, GET por id, PATCH/PUT, DELETE, ações, relatórios, exports.
- **Escalada**: usuário consegue mudar o próprio papel, tenant ou criar conta
  de nível maior?
- **Mass assignment**: campos sensíveis (`role`, `is_admin`, `tenant_id`,
  `owner_id`, `status`, valores monetários, `email_verified_at`) não vêm do
  corpo onde não deveriam; o handler usa o resultado validado, não o corpo cru.
- Identidade parcial ou ausente falha fechada; checagem e uso sem TOCTOU.
- Front-end: guarda de rota é só UX; a regra vale no back.

## 4. Entrada e injeção

- SQL: ORM parametrizado; SQL raw com interpolação é achado.
- Shell/subprocesso: argv separado, sem `shell=True`/string montada.
- Template/HTML: auto-escape ligado; sinks crus (`dangerouslySetInnerHTML`,
  `innerHTML`, `v-html`, `|safe`, `html_safe`, `template.HTML`).
- HTML de e-mail montado com dado do usuário sem escapar; CRLF em cabeçalhos
  de e-mail/HTTP.
- Path traversal, symlink, nome de arquivo de upload, extração de arquivo
  compactado (zip slip).
- SSRF: URL de saída controlada pelo usuário, redirects, IPs internos e de
  metadata (169.254.169.254), timeout.
- Open redirect em login/logout/callbacks.
- Deserialização insegura (pickle, YAML.load, Marshal, unserialize,
  ObjectInputStream).
- Regex com backtracking catastrófico sobre entrada do usuário.
- CSV/fórmula em exports; prompt injection quando texto do usuário chega a um
  LLM com ferramentas.
- Parse de ids (inteiro/BigInt/UUID) inválidos vira 400/404, não 500 com stack.

## 5. Arquivos, processos e plugins

- Uploads: tamanho, tipo verificado pelo conteúdo, armazenamento fora da raiz
  servida, nome gerado.
- Temp files seguros, permissões, limpeza.
- Plugins/hooks/carregamento dinâmico: quem pode registrar, com que
  privilégio.

## 6. Web e rede

- CORS: origens explícitas, sem `*` com credenciais.
- CSRF quando há cookie de sessão.
- Headers: CSP (sem `unsafe-eval` em produção), `frame-ancestors`/
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`. HSTS só com HTTPS real e
  decisão consciente.
- Limites de corpo, tempo e upload.
- Rate limit em login, cadastro, reset, reenvio e contato; chave por IP vinda
  de `X-Forwarded-For`/`X-Real-IP` **sem proxy confiável** é spoofável.
- Erros não vazam stack, SQL ou mensagem interna do ORM.
- Bind padrão (0.0.0.0 vs localhost) e portas expostas.

## 7. Persistência e integridade

- Transações onde há múltiplas escritas dependentes; idempotência de webhook
  e de pagamento.
- Migrations reversíveis e sem perda silenciosa; guardas em operações
  destrutivas.
- Soft delete respeitado em todas as consultas (inclusive auth).

## 8. Segredos e privacidade

- `.env` real nunca rastreado; `.env.example` só com placeholders.
- Imagem de container não carrega `.env`/segredos (`.dockerignore`, `ARG`/
  `ENV`, `COPY` amplo).
- Logs e telemetria sem token, senha, corpo de login ou PII desnecessária.
- Segredo no bundle do front (`VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`) é
  público por definição.
- Histórico do git: segredo que já vazou precisa ser rotacionado — reescrever
  histórico é decisão separada.
- Token em `localStorage` depende da CSP para não virar XSS → roubo de sessão.

## 9. Criptografia

- Primitivas estabelecidas; sem MD5/SHA1 para segurança; sem ECB; nonce nunca
  reutilizado; CSPRNG (não `Math.random`/`rand()`).
- Verificação de certificado ligada (`verify=False`, `InsecureSkipVerify`,
  `rejectUnauthorized: false` são achados em produção).
- HMAC de links assinados com TTL e falha fechada sem segredo configurado.

## 10. Disponibilidade e abuso

- Entrada limitada (tamanho, profundidade, contagem); paginação com teto.
- Filas/tarefas com limite; retry com backoff; timeouts em chamadas externas.
- Descompressão, recursão e alocação a partir de tamanho controlado pelo
  usuário.

## 11. Supply chain, CI e release

- Lockfile presente e usado em modo congelado (`npm ci`, `--frozen-lockfile`,
  `pip install --require-hashes`, `cargo --locked`).
- Dependência nova justificada; typosquatting; registries/git/path deps
  novos; lifecycle scripts (`postinstall`, `build.rs`, `setup.py`).
- GitHub Actions: `uses:` pinado por SHA de 40 caracteres com comentário da
  versão; `permissions:` mínimo; sem `pull_request_target` com checkout do PR;
  sem `${{ github.event.* }}` interpolado em `run:`; segredos fora de jobs de
  PR de fork.
- Imagens base por tag sem digest (risco aceito ou não?); `curl | sh` no
  build.
- Tags/release: assinatura ou checksum; tag publicada nunca reescrita.
- Dependabot/Renovate e alertas do GitHub lidos como evidência.

## 12. Indícios de código malicioso

Pistas, não prova: destino de rede novo, leitura de `~`/credenciais/SSH/
navegador, `eval`/execução dinâmica, blobs base64/hex, Unicode bidi, ativação
condicional por data/ambiente, conta ou chave escondida, bypass de
debug/admin, persistência (cron, systemd, autorun), teste que mascara efeito
colateral, desligar CSP/rate limit/auth.

## 13. Qualidade da evidência

- Hit de grep ≠ caminho alcançável.
- Pré-requisitos do atacante e controle sobre cada entrada explícitos.
- Teste de regressão com caso de controle legítimo.
- Correção verificada na árvore final exata, com o gate do projeto verde.

---

## 14. JavaScript/TypeScript (Node, Bun, Deno — `package.json`)

- Gerenciador e lockfile do projeto (`package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `bun.lock`); `preinstall`/`postinstall`/`prepare`,
  `overrides`/`resolutions`, deps por git/file URL.
- `child_process`, `Bun.spawn`/`Bun.$`, `eval`/`new Function`, `vm`, imports
  dinâmicos com caminho do usuário.
- Prototype pollution (merge profundo de objeto do usuário, `__proto__`).
- Validação (zod/joi/yup/class-validator): o handler usa o objeto validado;
  schema com `.passthrough()`/`additionalProperties` abre mass assignment.
- Servidor (Express/Fastify/Hono/Koa/Nest/Next): `trust proxy`, limites de
  corpo, CORS/cookies (`httpOnly`, `sameSite`, `secure` só com TLS), helmet/
  headers, tratamento de erro, rotas de API do Next sem auth, Server Actions.
- ORM: `$queryRawUnsafe`/`$executeRawUnsafe` (Prisma), `sequelize.query` com
  interpolação, `knex.raw`, TypeORM `query()`.
- Front: sinks de XSS, `target=_blank` sem `rel`, `postMessage` sem checar
  origem, token em storage, source maps publicados, variáveis de ambiente no
  bundle.
- Auditoria: `npm audit`/`pnpm audit`/`yarn npm audit`/`bun audit`.

## 15. Python (`pyproject.toml`, `requirements*.txt`, `setup.py`)

- Build backend, hooks de `setup.py`, índices extras, deps VCS/editáveis,
  hashes.
- `subprocess` com `shell=True`, `os.system`, `eval`/`exec`, `pickle`,
  `yaml.load` sem `SafeLoader`, `render_template_string`, `mark_safe`, SQL raw
  (`cursor.execute` com f-string, `.raw()`, `.extra()`, `text()`).
- Django: `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, CSRF, `@login_required`/
  permissions em toda view, querysets filtrados por dono. FastAPI: `Depends`
  de auth em toda rota, modelos Pydantic de entrada separados dos de saída.
  Flask: `secret_key`, CSRF (WTF), `send_file` com caminho do usuário.
- Auditoria: `pip-audit`, Bandit se configurado.

## 16. Go (`go.mod`)

- `replace`, módulos privados/vanity, cgo, `go:generate` (não rodar
  automaticamente), `//go:linkname`, `unsafe`.
- `os/exec` com `sh -c`, `text/template` gerando HTML (use `html/template`),
  `template.HTML` com dado do usuário, SQL com `fmt.Sprintf`.
- `http.Server` sem timeouts, `InsecureSkipVerify`, goroutines sem limite,
  contexto sem cancelamento, race (`go test -race`).
- Auditoria: `go vet`, `govulncheck`.

## 17. Ruby/Rails (`Gemfile`, `*.gemspec`)

- Fontes de gem, gems por git/path, extensões nativas, hooks, Rake tasks.
- `system`/backticks/`Open3` com string, `eval`/`send`/`constantize` com
  entrada, `YAML.load`/`Marshal.load`, SQL com interpolação em `where`/
  `find_by_sql`, `html_safe`/`raw`, `redirect_to params[...]`.
- Rails: strong parameters (`permit`), `before_action` de auth/policy (Pundit/
  CanCan) e escopo por dono, `protect_from_forgery`, `config.force_ssl`,
  `secret_key_base`/credentials, Active Storage, signed ids, `config.hosts`.
- Auditoria: Brakeman, `bundler-audit`.

## 18. PHP (`composer.json`)

- Scripts/plugins do Composer, repositórios, pacotes por path/VCS.
- `exec`/`system`/`shell_exec`/backticks, `include`/`require` com caminho do
  usuário, `unserialize`, SQL com concatenação (use PDO com placeholders),
  `{!! !!}` no Blade, `extract($_REQUEST)`.
- Laravel: `$fillable`/`$guarded` (mass assignment silencioso), policies/
  gates em toda rota, `APP_DEBUG=false` em produção, `APP_KEY`, CSRF,
  throttle. Symfony: firewall/voters.
- Auditoria: `composer audit`.

## 19. Rust (`Cargo.toml`)

- `build.rs`, proc macros, `.cargo/config`, deps por git/path, features,
  `links`, código vendorado — revisar antes de compilar.
- `unsafe`, FFI, lints `allow` novos; `Command::new` com shell; `std::env`;
  caminhos/temp; serde (`untagged`, deserializadores custom); regex; bounds
  de tarefas async.
- Conversões de inteiro, alocação a partir de tamanho não confiável, trabalho
  bloqueante em async, `unwrap`/panic em caminho de requisição.
- Auditoria: `cargo clippy`, `cargo deny`, `cargo audit`, fuzz/property tests.

## 20. Docker e compose

- Imagens base confiáveis, de preferência por digest; multi-stage sem levar
  build tools/segredos ao runtime.
- `USER` não-root no runtime; capacidades mínimas; sem `privileged`,
  `network_mode: host`, `docker.sock` ou mount de `/`.
- `COPY` amplo vs `.dockerignore` (`.env`, `.git`, chaves); `ARG`/`ENV` com
  segredo ficam gravados na imagem.
- Portas publicadas sem `127.0.0.1` ficam em `0.0.0.0` (expostas na rede) —
  confirmar se é intencional; banco sem porta publicada em produção.
- Healthcheck sem senha na linha de comando; limites de memória/CPU.

## 21. GitHub Actions / CI

- `permissions:` no nível do workflow e do job, mínimo necessário.
- `pull_request_target`/`workflow_run` com checkout do código do PR = segredo
  exposto a código não confiável.
- `${{ github.event.issue.title }}` e similares interpolados em `run:` =
  injeção de shell; passe por `env:`.
- `uses:` sem SHA de 40 caracteres; actions de terceiros desconhecidas;
  `actions/cache`/artifacts compartilhados entre PRs de fork e o branch
  principal.
- Publicação/deploy separados do build, com environment protegido.

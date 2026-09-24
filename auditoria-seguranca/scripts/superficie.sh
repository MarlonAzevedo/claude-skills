#!/usr/bin/env bash
# Inventário read-only de CANDIDATOS à revisão de segurança — qualquer stack.
# Não prova vulnerabilidade nenhuma: cada linha é um ponto pra verificar à mão
# (alcance, controle do atacante, autorização, intenção).
#
# Só olha arquivos rastreados/não-ignorados (git ls-files -co --exclude-standard),
# nunca node_modules/vendor/target/dist nem .env locais. NUNCA imprime valor de
# segredo: nas seções de segredo e env só sai caminho:linha + tipo/nome.
# Dependências: bash, git, grep, awk, find.
#
# Uso: bash ~/.claude/skills/auditoria-seguranca/scripts/superficie.sh [raiz-do-repo]
set -uo pipefail

ROOT="${1:-.}"
cd "$ROOT" || { echo "superficie: diretório inválido: $ROOT" >&2; exit 64; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "superficie: não é um repo git" >&2; exit 64; }

MAX=60
mapfile -t FILES < <(git ls-files -co --exclude-standard \
  | grep -vE '(^|/)(node_modules|vendor|target|dist|build|coverage|generated|\.venv|venv|__pycache__)/' \
  | grep -vE '\.(md|MD|rst|txt|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|pdf|zip|gz|tgz|lock|min\.js|map)$' \
  | grep -vE '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$' \
  | grep -vE '(^|/)auditoria-seguranca/scripts/superficie\.sh$' \
  | while IFS= read -r f; do [[ -f "$f" && ! -L "$f" ]] && printf '%s\n' "$f"; done)

pick() { printf '%s\n' "${FILES[@]}" | grep -E "$1"; }
mapfile -t JS < <(pick '\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$')
mapfile -t PY < <(pick '\.py$')
mapfile -t GO < <(pick '\.go$')
mapfile -t RB < <(pick '\.(rb|erb|rake)$')
mapfile -t PHP < <(pick '\.(php|phtml)$|\.blade\.php$')
mapfile -t RS < <(pick '\.rs$')
mapfile -t SH < <(pick '\.(sh|bash|zsh)$')
CODE=("${JS[@]}" "${PY[@]}" "${GO[@]}" "${RB[@]}" "${PHP[@]}" "${RS[@]}" "${SH[@]}")

section() { printf '\n## %s\n' "$1"; }
cap() { awk -v max="$MAX" 'NR <= max { print } END { if (NR > max) print "... truncado (" NR " no total)"; if (NR == 0) print "(nenhum)" }'; }
g() { # g <regex> <arquivos...> — grep -nHE sem cor, tolera lista vazia
  local re="$1"; shift
  local fs=(); for f in "$@"; do [[ -n "$f" ]] && fs+=("$f"); done
  (( ${#fs[@]} )) && grep -nHE --color=never -e "$re" -- "${fs[@]}" 2>/dev/null
}

section 'Estado do repositório'
git status --short --branch | head -40
echo "HEAD: $(git rev-parse --short HEAD 2>/dev/null)"

section 'Ecossistemas detectados (aplique só as seções correspondentes do checklist)'
{
  pick '(^|/)package\.json$' | head -1 | grep -q . && echo "JS/TS: $(pick '(^|/)package\.json$' | tr '\n' ' ')"
  pick '(^|/)(pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile)$' | head -1 | grep -q . && echo "Python: $(pick '(^|/)(pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile)$' | tr '\n' ' ')"
  pick '(^|/)go\.mod$' | head -1 | grep -q . && echo "Go: $(pick '(^|/)go\.mod$' | tr '\n' ' ')"
  pick '(^|/)(Gemfile|[^/]*\.gemspec)$' | head -1 | grep -q . && echo "Ruby: $(pick '(^|/)(Gemfile|[^/]*\.gemspec)$' | tr '\n' ' ')"
  pick '(^|/)composer\.json$' | head -1 | grep -q . && echo "PHP: $(pick '(^|/)composer\.json$' | tr '\n' ' ')"
  pick '(^|/)Cargo\.toml$' | head -1 | grep -q . && echo "Rust: $(pick '(^|/)Cargo\.toml$' | wc -l) Cargo.toml"
  pick '(^|/)(Dockerfile[^/]*|[^/]*\.Dockerfile)$' | head -1 | grep -q . && echo "Docker: $(pick '(^|/)(Dockerfile[^/]*|[^/]*\.Dockerfile)$' | tr '\n' ' ')"
  pick '(^|/)(docker-)?compose[^/]*\.ya?ml$' | head -1 | grep -q . && echo "Compose: $(pick '(^|/)(docker-)?compose[^/]*\.ya?ml$' | tr '\n' ' ')"
  pick '^\.github/workflows/.*\.ya?ml$' | head -1 | grep -q . && echo "GitHub Actions: $(pick '^\.github/workflows/.*\.ya?ml$' | wc -l) workflow(s)"
  pick '(^|/)(Makefile|justfile|Taskfile\.ya?ml)$' | head -1 | grep -q . && echo "Task runner: $(pick '(^|/)(Makefile|justfile|Taskfile\.ya?ml)$' | tr '\n' ' ')"
} | cap

section 'Documentos de segurança/instrução do projeto (ler na Fase 0)'
git ls-files -co --exclude-standard | grep -iE '(^|/)(CLAUDE|AGENTS|SECURITY|SECURITY-AUDIT|security_best_practices_report|CONTRIBUTING)[^/]*\.md$' | cap

section 'Modos rastreados: executável, symlink, submódulo'
git ls-files -s | awk '$1=="100755"||$1=="120000"||$1=="160000"' | cap

# --- Injeção / execução ---------------------------------------------------
section 'SQL raw / montado em string'
{
  g '\$queryRawUnsafe|\$executeRawUnsafe|\$queryRaw|\$executeRaw|sequelize\.query\(|knex\.raw\(|\.query\(`' "${JS[@]}"
  g '\.execute\(f["'"'"']|\.execute\([^)]*%|\.raw\(|\.extra\(|text\(f["'"'"']|executescript\(' "${PY[@]}"
  g 'fmt\.Sprintf\("(SELECT|INSERT|UPDATE|DELETE)|\.(Query|Exec)(Context)?\([^)]*\+' "${GO[@]}"
  g 'find_by_sql|\.where\("[^"]*#\{|execute\("[^"]*#\{' "${RB[@]}"
  g '(mysqli_query|->query)\([^)]*\$|"(SELECT|INSERT|UPDATE|DELETE)[^"]*"\s*\.' "${PHP[@]}"
  g 'format!\("(SELECT|INSERT|UPDATE|DELETE)|sql_query\(' "${RS[@]}"
  g '(SELECT|INSERT|UPDATE|DELETE) [^;]*\$\{' "${JS[@]}"
} | cap

section 'Execução dinâmica / subprocesso'
{
  g '(^|[^[:alnum:]_.$-])eval\(|new Function\(|child_process|execSync\(|spawnSync\(|(^|[^[:alnum:]_.$-])exec\(|Bun\.spawn|Bun\.\$|vm\.run' "${JS[@]}"
  g 'subprocess\.|os\.system\(|os\.popen\(|(^|[^[:alnum:]_.$-])eval\(|(^|[^[:alnum:]_.$-])exec\(|pickle\.loads?\(|yaml\.load\(|marshal\.loads' "${PY[@]}"
  g 'os/exec|exec\.Command\(|"sh", *"-c"|syscall\.Exec' "${GO[@]}"
  g '(^|[^[:alnum:]_.$-])system\(|`[^`]*#\{|Open3\.|(^|[^[:alnum:]_.$-])eval\(|\.send\(params|constantize|YAML\.load\(|Marshal\.load' "${RB[@]}"
  g '\b(exec|system|shell_exec|passthru|proc_open|popen)\(|(^|[^[:alnum:]_.$-])eval\(|unserialize\(|(include|require)(_once)?\s*\(?\s*\$' "${PHP[@]}"
  g 'Command::new|std::process|unsafe\s*\{|libc::' "${RS[@]}"
  g '(^|[^[:alnum:]_.-])eval |\$\(curl|curl [^|]*\|\s*(sh|bash)|wget [^|]*\|\s*(sh|bash)' "${SH[@]}"
} | cap

section 'Sinks de HTML/XSS'
{
  g 'dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|document\.write|insertAdjacentHTML|v-html|\{@html|javascript:' "${JS[@]}"
  g 'mark_safe|\|safe|render_template_string|Markup\(|autoescape\s*(=\s*)?False' "${PY[@]}"
  g 'template\.HTML\(|text/template' "${GO[@]}"
  g 'html_safe|raw\(|<%==' "${RB[@]}"
  g '\{!!|echo \$_(GET|POST|REQUEST)' "${PHP[@]}"
} | cap

section 'Redirecionamentos e requisições de saída (open redirect / SSRF)'
{
  g 'res\.redirect\(|c\.redirect\(|Response\.redirect|window\.location|\bfetch\(|axios\.|got\(|http\.request\(' "${JS[@]}"
  g 'redirect\(|requests\.(get|post)|httpx\.|urlopen\(' "${PY[@]}"
  g 'http\.Redirect|http\.(Get|Post|NewRequest)' "${GO[@]}"
  g 'redirect_to params|Net::HTTP|Faraday|HTTParty|open-uri' "${RB[@]}"
  g 'header\(.Location|file_get_contents\(\$|curl_exec' "${PHP[@]}"
  g 'reqwest::|ureq::|hyper::' "${RS[@]}"
  g '169\.254\.169\.254|metadata\.google' "${CODE[@]}"
} | cap

section 'Confiança em headers de proxy (spoofável sem proxy confiável na frente)'
g '[Xx]-[Ff]orwarded-([Ff]or|[Hh]ost|[Pp]roto)|[Xx]-[Rr]eal-[Ii][Pp]|trust.?proxy|HTTP_X_FORWARDED' "${CODE[@]}" | cap

section 'Cripto e aleatoriedade (hash fraco, RNG não criptográfico, TLS desligado)'
{
  g 'Math\.random|createHash\(.(md5|sha1).\)|rejectUnauthorized:\s*false' "${JS[@]}"
  g 'hashlib\.(md5|sha1)|\brandom\.(random|randint|choice)|verify\s*=\s*False' "${PY[@]}"
  g 'crypto/md5|crypto/sha1|math/rand|InsecureSkipVerify' "${GO[@]}"
  g 'Digest::(MD5|SHA1)|\brand\(|VERIFY_NONE' "${RB[@]}"
  g '\bmd5\(|\bsha1\(|\brand\(|mt_rand\(' "${PHP[@]}"
  g 'danger_accept_invalid|thread_rng' "${RS[@]}"
} | cap

# --- Segredos / ambiente --------------------------------------------------
section 'Variáveis de ambiente lidas (só o nome, nunca o valor)'
for f in "${CODE[@]}"; do
  [[ -n "$f" ]] || continue
  grep -oE '(process\.env|Bun\.env|import\.meta\.env|Deno\.env\.get\(|os\.environ(\.get)?\(?\[?|os\.getenv\(|os\.Getenv\(|ENV\[|ENV\.fetch\(|getenv\(|\$_ENV\[|std::env::var\(|env!\()["'"'"'.]?[A-Z_][A-Z0-9_]*' "$f" 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]{2,}$'
done | sort | uniq -c | sort -rn | cap

section 'Arquivos .env rastreados ou não ignorados (só .env.example/.sample/.template é esperado)'
git ls-files -co --exclude-standard | grep -E '(^|/)\.env($|\.)' | grep -vE '\.(example|sample|template|dist)$' | cap

section 'Strings com formato de segredo (tipo + local, SEM valor)'
for f in "${FILES[@]}"; do
  grep -nE -e 'AKIA[0-9A-Z]{16}' -e 'gh[pousr]_[A-Za-z0-9]{30,}' -e 'github_pat_[A-Za-z0-9_]{30,}' \
    -e 'sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}' -e 'xox[abpr]-[A-Za-z0-9-]{10,}' -e 'AIza[0-9A-Za-z_-]{35}' \
    -e '(sk|rk)_live_[0-9A-Za-z]{16,}' -e '-----BEGIN [A-Z ]*PRIVATE KEY' \
    -e 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.' \
    -e '(mysql|postgres(ql)?|mongodb(\+srv)?|redis|amqp)://[^:/ "]+:[^@/ "]{3,}@' \
    -e '(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY)[A-Z_]*["'"'"']?\s*[=:]\s*["'"'"']?[A-Za-z0-9+/_!@#$%^&*.-]{12,}' "$f" 2>/dev/null \
  | grep -viE 'placeholder|example|changeme|your[-_]|seu[-_]|dummy|fake|xxxx|<[a-z_]+>|\$\{|process\.env|os\.environ|getenv' \
  | while IFS=: read -r ln rest; do
      tipo=senha/segredo-literal
      case "$rest" in
        *AKIA*) tipo=aws-access-key ;; *gh[pousr]_*|*github_pat_*) tipo=github-token ;;
        *sk-ant-*) tipo=anthropic-key ;; *sk-*) tipo=api-key-sk ;; *xox*) tipo=slack-token ;;
        *AIza*) tipo=google-api-key ;; *_live_*) tipo=stripe-live-key ;;
        *PRIVATE\ KEY*) tipo=chave-privada ;; *eyJ*) tipo=jwt ;; *://*@*) tipo=url-com-credencial ;;
      esac
      echo "$f:$ln: $tipo"
    done
done | cap
echo "(Credenciais de teste/dev conhecidas também aparecem aqui — confirme que não são as de produção.)"

# --- Supply chain / CI / containers --------------------------------------
section 'Scripts de ciclo de vida de pacote (rodam no install/build)'
{
  g '"(pre|post)?install"|"prepare"|"prepublish(Only)?"' $(pick '(^|/)package\.json$')
  pick '(^|/)build\.rs$' | sed 's/$/: build.rs (roda no cargo build)/'
  g 'cmdclass|setup_requires' $(pick '(^|/)setup\.py$')
  g '"(pre|post)-(install|update)-cmd"|"scripts"' $(pick '(^|/)composer\.json$')
  g 'git:|path:|github:' $(pick '(^|/)Gemfile$')
} | cap

WF=($(pick '^\.github/workflows/.*\.ya?ml$'))
section 'GitHub Actions: uses: sem pin por SHA de 40 caracteres'
if (( ${#WF[@]} )); then
  g 'uses:' "${WF[@]}" | grep -vE '@[0-9a-f]{40}' | grep -vE 'uses: *["'"'"']?\./' | cap
  section 'GitHub Actions: gatilhos, permissões e interpolação sensíveis'
  g 'pull_request_target|workflow_run|permissions:|write-all|secrets\.|\$\{\{ *github\.event\.(issue|pull_request|comment|head_commit|review)' "${WF[@]}" | cap
else
  echo "(nenhum workflow em .github/workflows)"
fi

DF=($(pick '(^|/)(Dockerfile[^/]*|[^/]*\.Dockerfile)$'))
section 'Dockerfiles: FROM/USER, imagens sem digest, curl|sh, ARG/ENV com segredo'
if (( ${#DF[@]} )); then
  g '^(FROM|USER)|curl .*\|.*sh|wget .*\|.*sh|^(ARG|ENV) .*(SECRET|PASSWORD|TOKEN|KEY)|^COPY \. ' "${DF[@]}" | cap
  for d in "${DF[@]}"; do
    grep -qE '^USER ' "$d" || echo "$d: sem instrução USER (roda como root)"
    grep -E '^FROM ' "$d" | grep -vE '@sha256:|^FROM +scratch|^FROM +[a-z0-9_-]+( |$)' | sed "s#^#$d: imagem sem digest: #"
  done | cap
  [[ -f .dockerignore ]] || echo ".dockerignore ausente (COPY . leva .env/.git pra imagem)"
else
  echo "(nenhum Dockerfile)"
fi

CF=($(pick '(^|/)(docker-)?compose[^/]*\.ya?ml$'))
if (( ${#CF[@]} )); then
  section 'Compose: portas publicadas sem 127.0.0.1 (ficam em 0.0.0.0 — expostas na rede)'
  g '^\s*- *["'"'"']?[^#"'"'"']*[0-9}]:[0-9]+' "${CF[@]}" | grep -vE '127\.0\.0\.1|localhost' | cap
  section 'Compose: privilégios e mounts perigosos'
  g 'privileged|docker\.sock|network_mode: *host|pid: *host|cap_add|- */:/' "${CF[@]}" | cap
fi

section 'Caracteres Unicode de controle bidi/invisíveis'
if printf 'x' | grep -qP 'x' 2>/dev/null; then
  for f in "${FILES[@]}"; do
    LC_ALL=C.UTF-8 grep -nP '[\x{202A}-\x{202E}\x{2066}-\x{2069}]' "$f" 2>/dev/null | cut -d: -f1 | sed "s#^#$f:#; s#\$#: bidi#"
    LC_ALL=C.UTF-8 grep -nP '[\x{200B}-\x{200F}\x{2060}\x{FEFF}]' "$f" 2>/dev/null | cut -d: -f1 | sed "s#^#$f:#; s#\$#: invisível (BOM/zero-width — pode ser legítimo)#"
  done | cap
else
  echo "(grep sem -P: seção pulada — use GNU grep)"
fi

section 'Fim'
echo "Arquivos analisados: ${#FILES[@]} (código: ${#CODE[@]})."
echo 'Candidatos, não achados. Verifique alcance, controle do atacante, autorização e intenção antes de classificar qualquer linha.'

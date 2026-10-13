#!/usr/bin/env bash
# Lista candidatos a arquivo desnecessário num repo git, por categoria.
# Só lê: não apaga nada. Uso: candidatos.sh [raiz-do-repo]
set -uo pipefail

cd "${1:-.}" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "não é um repositório git: $PWD" >&2; exit 1; }

LIMITE=40         # linhas por categoria
GRANDE_KB=1024    # arquivo rastreado acima disso é listado
MAX_ORFAOS=3000   # acima disso a busca de órfãos é pulada (lenta)

secao() {
  local titulo=$1 linhas
  linhas=$(cat)
  [ -z "$linhas" ] && return
  local total
  total=$(printf '%s\n' "$linhas" | wc -l)
  printf '\n## %s (%d)\n' "$titulo" "$total"
  printf '%s\n' "$linhas" | head -n "$LIMITE"
  [ "$total" -gt "$LIMITE" ] && printf '… mais %d\n' "$((total - LIMITE))"
}

LIXO='(\.bak|\.orig|\.rej|\.tmp|\.swp|\.swo|\.old|~|\.DS_Store|Thumbs\.db|desktop\.ini|\.log)$|( \([0-9]+\)| - c[oó]pia| copy|-copy)(\.[^/]*)?$'
ARTEFATO='(^|/)(node_modules|dist|build|coverage|__pycache__|\.pytest_cache|\.vitest|test-results|playwright-report|\.next|\.nuxt|\.turbo|\.cache|target)/|\.pyc$'

echo "# Candidatos em $(git rev-parse --show-toplevel)"

git ls-files -ci --exclude-standard | secao "Rastreado mas coberto pelo .gitignore"

git ls-files | grep -E "$ARTEFATO" | secao "Artefato de build/cache rastreado"

{ git ls-files; git ls-files -o --exclude-standard; } | grep -E "$LIXO" | sort -u | secao "Lixo por nome (backup, cópia, temporário, log)"

git ls-files -o --exclude-standard | grep -vE "$LIXO" | secao "Não rastreado e não ignorado"

git ls-files -s | awk '$2 == "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391" {print $4}' \
  | grep -vE '(^|/)(\.gitkeep|\.keep|__init__\.py|py\.typed)$' | secao "Vazio"

git ls-files -s | awk '$2 != "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391" {n[$2]++; p[$2] = p[$2] "  " $4 "\n"}
  END {for (b in n) if (n[b] > 1) printf "%s", p[b] "  --\n"}' | secao "Duplicado exato (mesmo conteúdo)"

git ls-files -z | xargs -0 -r du -k 2>/dev/null | awk -v m="$GRANDE_KB" '$1 > m {printf "%6d KB  %s\n", $1, $2}' \
  | sort -rn | secao "Grande (> ${GRANDE_KB} KB)"

# Órfão: nome (sem extensão) não aparece em nenhum outro arquivo rastreado.
# Heurística conservadora: nome genérico casa com algo e o arquivo some da lista.
candidatos=$(git ls-files | grep -E '\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|php|rb|go|css|scss|sass|less|png|jpe?g|gif|svg|webp|ico)$' \
  | grep -vE '(^|/)(index|main|app|server|setup|conftest|manage|__init__|vite-env\.d)\.|\.config\.|\.d\.ts$|(^|/)(tests?|testes|__tests__|spec|e2e|migrations?|seeders?|public|static|bin|\.github)/|[._-](test|spec)\.|(^|/)test_[^/]*$')
qtd=$(printf '%s' "$candidatos" | grep -c . || true)
if [ "$qtd" -gt "$MAX_ORFAOS" ]; then
  printf '\n## Possível órfão (pulado: %d arquivos, acima de %d)\n' "$qtd" "$MAX_ORFAOS"
else
  printf '%s\n' "$candidatos" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    nome=$(basename "$f"); nome=${nome%.*}
    [ "${#nome}" -lt 3 ] && continue
    git grep -q -F -e "$nome" -- . ":(exclude)$f" 2>/dev/null || echo "$f"
  done | secao "Possível órfão (nome não citado em nenhum outro arquivo)"
fi

echo
echo "# Fim. Nada foi apagado."

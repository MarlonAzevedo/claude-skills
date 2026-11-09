#!/usr/bin/env bash
# Lista os arquivos da tarefa (branch vs base, incluindo o não commitado) em CODIGO, TESTES, SEM_TESTE e IGNORADOS.
# Uso: arquivos.sh [repo] [base]   — sem base, deduz pelo nome da branch (feature/<base>/...) ou develop/main/master.
set -euo pipefail

repo=$(git -C "${1:-.}" rev-parse --show-toplevel)
g() { git -C "$repo" -c core.quotepath=off "$@"; }
existe() { g rev-parse -q --verify "$1^{commit}" >/dev/null; }

base=${2:-}
if [[ -z $base ]]; then
	branch=$(g branch --show-current)
	nome=$(cut -d/ -f2 <<<"$branch")
	for c in $([[ $branch == */*/* ]] && echo "$nome") develop main master; do
		if existe "origin/$c"; then base="origin/$c"; break; fi
		if existe "$c"; then base=$c; break; fi
	done
fi
[[ -n $base ]] || { echo "base não encontrada; passe como 2º argumento" >&2; exit 1; }
mb=$(g merge-base "$base" HEAD)

classe() {
	case "$1" in
	testes/* | */testes/* | tests/* | */tests/* | test/* | */test/* | spec/* | */spec/* | */__tests__/* | \
		*.test.* | *.spec.* | test_*.py | */test_*.py | *_test.py | *_test.go | *Test.php | *Tests.php | *_spec.rb)
		echo TESTES ;;
	*.md | *.mdx | .agents/* | .agent/* | .claude/* | .specs/* | .cursor/* | .gemini/* | .github/skills/* | \
		.github/copilot* | docs/* | */docs/* | .harness-eval/*)
		echo IGNORADOS ;;
	*) echo CODIGO ;;
	esac
}

url() { local p="$repo/$1"; p=${p//%/%25}; p=${p// /%20}; p=${p//#/%23}; p=${p//\?/%3F}; echo "antigravity-ide://file$p:$2"; }

linha() {
	local h
	h=$(g diff -U0 "$mb" -- "$1" | grep -m1 '^@@' || true)
	h=${h#*+}; h=${h%%[, ]*}
	[[ $h =~ ^[0-9]+$ && $h -gt 0 ]] && echo "$h" || echo 1
}

declare -A sec=([CODIGO]="" [TESTES]="" [IGNORADOS]="")
add() { # status caminho
	local st=$1 f=$2 n="" l
	if [[ $st == "?" ]]; then
		n="+$(wc -l <"$repo/$f" | tr -d ' ') -0"
	else
		n=$(g diff --numstat "$mb" -- "$f" | awk 'NR==1{print "+"$1" -"$2}')
	fi
	if [[ $st == D ]]; then l="(removido)"; else l=$(url "$f" "$(linha "$f")"); fi
	sec[$(classe "$f")]+="$st	$f	$n	$l"$'\n'
	[[ $st != D && $(classe "$f") == CODIGO ]] && codigo+=("$f")
	return 0
}
codigo=()

while IFS=$'\t' read -r st a b; do
	[[ $st == R* || $st == C* ]] && add "${st:0:1}" "$b" || add "$st" "$a"
done < <(g diff --name-status -M "$mb")
while IFS= read -r f; do add "?" "$f"; done < <(g ls-files --others --exclude-standard)

# Código que nenhum teste do repo cita pelo nome (sem extensão)
testes=()
while IFS= read -r f; do
	[[ -f $repo/$f && $(classe "$f") == TESTES ]] && testes+=("$repo/$f")
done < <(g ls-files --cached --others --exclude-standard)
semteste=""
for f in "${codigo[@]}"; do
	b=${f##*/}; b=${b%.*}
	if ((${#testes[@]} == 0)) || ! grep -qF -- "$b" "${testes[@]}"; then semteste+="$f"$'\n'; fi
done
sec[SEM_TESTE]=$semteste

echo "repo: $repo"
echo "branch: $(g branch --show-current)"
echo "base: $base"
echo "merge-base: ${mb:0:12}"
echo "diff: cd $(printf %q "$repo") && git -c difftool.ag.cmd='antigravity-ide --wait --diff \"\$LOCAL\" \"\$REMOTE\"' difftool -y -t ag ${mb:0:12}"
for s in CODIGO TESTES SEM_TESTE IGNORADOS; do
	echo
	echo "## $s"
	printf '%s' "${sec[$s]:-(nenhum)$'\n'}"
done

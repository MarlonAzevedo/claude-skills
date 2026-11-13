// Subagentes de cada IA aberta: os internos (Claude, Codex) e os terminais que ela abriu com hc run.
// Os dados vêm de coletar.py; este arquivo só desenha.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, appHome, run, theme } from "herdr";

const INTERVALO = 3000;

function idade(seg) {
  if (!seg) return "";
  const m = Math.floor((Date.now() / 1000 - seg) / 60);
  if (m < 1) return "agora";
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h`;
}

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));
const dur = (s) => (!s ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`);

// Linha de números do subagente: o que a fonte souber (terminais do herdr não têm tokens).
function numeros(s) {
  const partes = [];
  if (s.modelo) partes.push(s.modelo);
  if (s.passos) partes.push(`${s.passos} passo${s.passos > 1 ? "s" : ""}`);
  if (s.duracao) partes.push(dur(s.duracao));
  if (s.entrada || s.saida) partes.push(`↑${k(s.entrada)}${s.cache ? ` (${k(s.cache)} cache)` : ""} ↓${k(s.saida)}`);
  return partes.join(" · ");
}

function barra(feitas, total, largura) {
  const n = total ? Math.round((feitas / total) * largura) : 0;
  return "█".repeat(n) + "░".repeat(largura - n);
}

export default class Subagentes extends View {
  init(_props, cx) {
    this.grupos = [];
    this.erro = null;
    this.carregado = false;
    this.atualizar(cx);
    cx.timer.every(INTERVALO, (cx) => this.atualizar(cx));
  }

  atualizar(cx) {
    if (this.ocupado) return;
    this.ocupado = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/subagentes/coletar.py`], { timeout: 15000 });
        const dados = JSON.parse(r.stdout || "{}");
        this.erro = dados.erro ?? (r.code ? r.stderr.trim() || `código ${r.code}` : null);
        this.grupos = dados.grupos ?? [];
      } catch (e) {
        this.erro = String(e);
      }
      this.carregado = true;
      this.ocupado = false;
      cx.notify();
    });
  }

  estado(s, t) {
    if (s === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    const cor = { blocked: t.blocked, done: t.done, idle: t.idle }[s] ?? t.unknown;
    return div().size(8).mx(2).rounded(4).flex_none().bg(cor);
  }

  linha(g, s, t) {
    const el = h_flex().id(`s-${g.terminal}-${s.id}`).items_start().gap(8).py(4).pl(8 + (s.nivel - 1) * 12).pr(8).rounded(6)
      .hover((st) => st.bg(t.hover))
      .child(div().pt(3).child(this.estado(s.estado, t)))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).justify_between()
          .child(div().truncate().text_color(t.foreground).font_semibold().child(s.nome))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(idade(s.atualizado))))
        .when(!!s.descricao, (e) => e.child(div().truncate().text_color(t.muted).child(s.descricao)))
        .when(!!s.passo, (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(s.passo)))
        .when(!!numeros(s), (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(numeros(s)))));
    // Terminal do herdr: abre por cima; subagente interno: mostra a IA que o abriu.
    return el.on_click(() => (s.terminal ? run("terminal.peek", { terminal: s.terminal }) : run("agent.focus", { terminal: g.terminal })));
  }

  render(_cx) {
    const t = theme();
    const corpo = v_flex().gap(10);
    if (this.erro) corpo.child(div().text_color(t.blocked).child(`Erro ao coletar: ${this.erro}`));
    if (!this.grupos.length && !this.erro) {
      corpo.child(div().text_color(t.dim).child(this.carregado ? "Nenhum subagente ativo nos últimos 30 min." : "Carregando…"));
    }
    for (const g of this.grupos) {
      const ativos = g.subagentes.filter((s) => s.estado === "working");
      const tokens = ativos.reduce((n, s) => n + (s.entrada ?? 0) + (s.saida ?? 0), 0);
      const tarefas = g.tarefas ?? [];
      const feitas = tarefas.filter((x) => x.status === "completed").length;
      const atual = tarefas.find((x) => x.status === "in_progress");
      corpo.child(v_flex().gap(2)
        .child(h_flex().id(`g-${g.terminal}`).gap(6).px(8).py(4).rounded(6).hover((st) => st.bg(t.hover))
          .on_click(() => run("agent.focus", { terminal: g.terminal }))
          .child(div().flex_1().truncate().text_color(t.foreground).font_semibold().child(g.where ?? g.terminal))
          .child(div().flex_none().text_size(11).text_color(t.muted).child(`${g.app ?? ""} · ${ativos.length}/${g.subagentes.length}${tokens ? ` · ${k(tokens)} tokens` : ""}`)))
        .when(feitas < tarefas.length, (e) => e.child(v_flex().px(8).pb(2)
          .child(h_flex().gap(6).text_size(11)
            .child(div().flex_none().text_color(t.accent).child(barra(feitas, tarefas.length, 16)))
            .child(div().flex_none().text_color(t.muted).child(`${feitas}/${tarefas.length}`)))
          .when(!!atual, (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(atual.titulo)))))
        .children(g.subagentes.map((s) => this.linha(g, s, t))));
    }
    return v_flex().id("root").size_full().bg(t.chrome).text_size(12)
      .child(div().px(12).pt(10).pb(6).text_size(11).font_semibold().text_color(t.muted).child("SUBAGENTES"))
      .child(div().id("lista").flex_1().overflow_y_scrollbar().px(4).pb(8).child(corpo));
  }
}

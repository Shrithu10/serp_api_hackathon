/** Word-level diff (LCS) for comparing two AI answers. Whitespace is kept for display. */
export interface DiffPart {
  text: string;
  kind: "same" | "only";
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function wordDiff(a: string, b: string): { left: DiffPart[]; right: DiffPart[]; shared: number; total: number } {
  const ta = a.split(/(\s+)/);
  const tb = b.split(/(\s+)/);
  const wa = ta.map((t, i) => [norm(t), i] as const).filter(([w]) => w);
  const wb = tb.map((t, i) => [norm(t), i] as const).filter(([w]) => w);
  const n = wa.length;
  const m = wb.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = wa[i][0] === wb[j][0] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Set<number>();
  const keepB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wa[i][0] === wb[j][0]) {
      keepA.add(wa[i][1]);
      keepB.add(wb[j][1]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const build = (tokens: string[], keep: Set<number>): DiffPart[] => {
    const out: DiffPart[] = [];
    tokens.forEach((t, k) => {
      const kind: DiffPart["kind"] = !norm(t) || keep.has(k) ? "same" : "only";
      const last = out[out.length - 1];
      // Merge runs; whitespace joins whichever run it sits in.
      if (last && (last.kind === kind || (!norm(t) && last.kind === "only"))) last.text += t;
      else out.push({ text: t, kind });
    });
    return out;
  };
  return { left: build(ta, keepA), right: build(tb, keepB), shared: keepA.size, total: Math.max(n, m) };
}

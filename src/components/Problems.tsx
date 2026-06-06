import { useMemo, useState } from "react";
import { useStore } from "../store";
import { ITEMS, CATEGORIES, Item } from "../data/seed";

const tierOf = (d: number) => (d <= 2 ? "EASY" : d === 3 ? "MEDIUM" : "HARD");
const TIERS = ["EASY", "MEDIUM", "HARD"] as const;

export function Problems() {
  const mastery = useStore((s) => s.mastery);
  const solved = useStore((s) => s.solved);
  const selectItem = useStore((s) => s.selectItem);
  const solvedSet = new Set(solved);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("ALL");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Solved: true });

  const filtered = useMemo(
    () =>
      ITEMS.filter((it) => {
        if (cat !== "ALL" && it.category !== cat) return false;
        if (q && !`${it.title} ${it.id} ${it.kcs[0].slug}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [q, cat]
  );

  const groups = useMemo(() => {
    const g: Record<string, Record<string, Item[]>> = {
      Unsolved: { EASY: [], MEDIUM: [], HARD: [] },
      Solved: { EASY: [], MEDIUM: [], HARD: [] },
    };
    for (const it of filtered) {
      const status = solvedSet.has(it.id) ? "Solved" : "Unsolved";
      g[status][tierOf(it.difficulty)].push(it);
    }
    return g;
    // eslint-disable-next-line
  }, [filtered, solved]);

  const count = (status: string) => TIERS.reduce((a, t) => a + groups[status][t].length, 0);

  const Row = ({ it }: { it: Item }) => {
    const p = mastery[it.kcs[0].slug] ?? 0;
    return (
      <tr style={{ cursor: "pointer" }} onClick={() => selectItem(it.id)}>
        <td style={{ fontFamily: "var(--grotesk)", fontWeight: 500 }}>{it.title}</td>
        <td className="dim">{it.category}</td>
        <td className="mono dim" style={{ fontSize: 11 }}>{it.kcs[0].slug}</td>
        <td className="num mono amber">{p.toFixed(2)}</td>
        <td className="num"><span className="btn" style={{ padding: "4px 10px" }}>OPEN</span></td>
      </tr>
    );
  };

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-head">
        <span className="panel-label"><span className="panel-idx">01</span> / PROBLEM BANK</span>
        <span className="micro">{filtered.length} / {ITEMS.length} SHOWN · SOLVED {solved.length}</span>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input className="filter-input" placeholder="search title / skill…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="filter-input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="ALL">ALL CATEGORIES</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {(["Unsolved", "Solved"] as const).map((status) => {
            const isOpen = !collapsed[status];
            return (
              <div key={status} className="prob-status">
                <button
                  className="status-bar"
                  onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
                >
                  <span className="status-toggle">{isOpen ? "−" : "+"}</span>
                  <span className={`status-name ${status === "Solved" ? "solved" : ""}`}>{status.toUpperCase()}</span>
                  <span className="micro">{count(status)} PROBLEMS</span>
                </button>
                {isOpen &&
                  TIERS.map((tier) => {
                    const list = groups[status][tier];
                    if (list.length === 0) return null;
                    return (
                      <div key={tier} className="tier-block">
                        <div className="tier-head">
                          <span className={`tag ${tier === "HARD" ? "bad" : tier === "MEDIUM" ? "on" : "good"}`}>{tier}</span>
                          <span className="micro">{list.length}</span>
                        </div>
                        <table className="grid">
                          <tbody>{list.map((it) => <Row key={it.id} it={it} />)}</tbody>
                        </table>
                      </div>
                    );
                  })}
                {isOpen && count(status) === 0 && <div className="dim" style={{ padding: "8px 4px" }}>None.</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

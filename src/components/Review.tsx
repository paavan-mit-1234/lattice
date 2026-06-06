import { useStore } from "../store";
import { KCS, ITEMS, kcBySlug } from "../data/seed";
import { MASTERY_THRESHOLD } from "../engine/bkt";

export function Review() {
  const mastery = useStore((s) => s.mastery);
  const reviewDue = useStore((s) => s.reviewDue);
  const selectItem = useStore((s) => s.selectItem);
  const now = Date.now();

  const rows = KCS.map((k) => {
    const due = reviewDue[k.slug];
    const overdue = due ? due <= now : false;
    return { k, due, overdue, p: mastery[k.slug] ?? 0 };
  }).sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.due ?? Infinity) - (b.due ?? Infinity);
  });

  const fmt = (t?: number) => {
    if (!t) return "not scheduled";
    const d = t - now;
    if (d <= 0) return "DUE NOW";
    const m = Math.round(d / 60000);
    return "in " + m + "m";
  };

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-head">
        <span className="panel-label"><span className="panel-idx">01</span> / SPACED REVIEW QUEUE</span>
        <span className="micro">DECAY-DRIVEN · SOLVE TO REFRESH</span>
      </div>
      <div className="panel-body">
        <table className="grid">
          <thead>
            <tr>
              <th>SKILL</th>
              <th>P(MASTERED)</th>
              <th>STATE</th>
              <th>NEXT REVIEW</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, due, overdue, p }) => {
              const item = ITEMS.find((i) => i.kcs[0].slug === k.slug);
              return (
                <tr key={k.slug}>
                  <td>
                    <span className="mono">{k.slug}</span>
                    <div className="dim" style={{ fontSize: 11 }}>{kcBySlug(k.slug).title}</div>
                  </td>
                  <td className="num mono amber">{p.toFixed(3)}</td>
                  <td>
                    {p >= MASTERY_THRESHOLD ? (
                      <span className="tag good">MASTERED</span>
                    ) : (
                      <span className="tag">LEARNING</span>
                    )}
                  </td>
                  <td className="mono" style={{ color: overdue ? "var(--red)" : "var(--muted)" }}>{fmt(due)}</td>
                  <td className="num">
                    {item && (
                      <button className="btn" onClick={() => selectItem(item.id)}>
                        {overdue ? "REVIEW ▸" : "PRACTICE"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

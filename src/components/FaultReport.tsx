import { GradeResult } from "../engine/grader";
import { Diagnosis } from "../engine/diagnose";
import { Item } from "../data/seed";

export function FaultReport({
  grade,
  diag,
  item,
  committed = true,
}: {
  grade: GradeResult;
  diag: Diagnosis | null;
  item: Item;
  committed?: boolean;
}) {
  if (grade.verdict === "pass") {
    return (
      <div className="fault ok">
        <div className="fault-strip">
          {committed ? "PASS" : "SAMPLE PASS"} // {grade.passedCount}/{grade.totalCount} TESTS · {grade.runtimeMs}ms
        </div>
        <div className="panel-body">
          <div className="evidence">
            {committed ? (
              <>
                All tests pass. Mastery of <span className="tag good">{item.kcs[0].slug}</span> updated upward.
                The lattice has ticked. Scheduling spaced review.
              </>
            ) : (
              <>Visible tests pass. Hit SUBMIT to grade against the full hidden suite and update the model.</>
            )}
          </div>
        </div>
      </div>
    );
  }

  const fail = grade.firstFailIndex != null ? grade.results[grade.firstFailIndex] : null;
  const test = grade.firstFailIndex != null ? item.tests[grade.firstFailIndex] : null;
  const unattributed = !diag || diag.kcSlug === null;

  return (
    <div className={`fault ${unattributed ? "un" : ""}`}>
      <div className="fault-strip">{unattributed ? "FAULT // UNATTRIBUTED" : "FAULT REPORT"}</div>
      <div className="panel-body stack" style={{ gap: 10 }}>
        <div className="spread">
          <span className="micro">INFERRED SKILL</span>
          {unattributed ? (
            <span className="tag">UNATTRIBUTED</span>
          ) : (
            <span className="tag bad">{diag!.kcSlug}</span>
          )}
        </div>

        {diag && (
          <>
            <div className="evidence">{diag.evidence}</div>
            <div>
              <div className="spread">
                <span className="micro">CONFIDENCE</span>
                <span className="mono amber">{diag.confidence.toFixed(2)}</span>
              </div>
              <div className="conf-bar mt">
                <span style={{ transform: `scaleX(${diag.confidence})` }} />
              </div>
            </div>
            {diag.faultLine != null && (
              <div className="spread">
                <span className="micro">FAULT LINE</span>
                <span className="mono red">L{diag.faultLine}</span>
              </div>
            )}
            {diag.secondary.length > 0 && (
              <div className="row">
                <span className="micro">SECONDARY</span>
                {diag.secondary.map((s) => (
                  <span className="tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {test && fail && (
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>FAILING CASE</div>
            <div className="iorow">
              <span className="k">input</span>
              <span className="mono">{JSON.stringify(test.args)}</span>
            </div>
            <div className="iorow">
              <span className="k">expected</span>
              <span className="mono green">{JSON.stringify(test.expected)}</span>
            </div>
            <div className="iorow">
              <span className="k">actual</span>
              <span className="mono red">{fail.error ? fail.error.split("\n").slice(-2)[0] : fail.actual}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

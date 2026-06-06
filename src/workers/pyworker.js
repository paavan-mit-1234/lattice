// Pyodide worker. Handles all code execution (grade / custom run / complexity timing) off the
// main thread, so a runaway or infinite-loop submission can be terminated from the main thread on
// timeout instead of freezing the tab. Posts {ready:true} once Pyodide has loaded.

const BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(BASE + "pyodide.js");
const pyP = loadPyodide({ indexURL: BASE }).then((py) => {
  self.postMessage({ ready: true });
  return py;
});

const GRADE_HARNESS = `
import json, copy, traceback
tests = json.loads(TESTS_JSON)
results = []
ns = {}
compile_error = None
try:
    exec(USER_CODE, ns)
except Exception:
    compile_error = traceback.format_exc()
func = ns.get(FUNC_NAME)
for t in tests:
    r = {"hidden": t["hidden"], "passed": False, "actual": None, "error": None}
    if compile_error is not None:
        r["error"] = compile_error; results.append(r); continue
    if func is None:
        r["error"] = "NameError: function '%s' is not defined" % FUNC_NAME; results.append(r); continue
    try:
        args = copy.deepcopy(t["args"])
        val = func(*args)
        r["actual"] = json.dumps(val, default=str)
        r["passed"] = bool(val == t["expected"])
    except Exception:
        r["error"] = traceback.format_exc()
    results.append(r)
json.dumps(results)
`;

const CUSTOM_HARNESS = `
import json, copy, traceback
ns = {}
res = {"actual": None, "error": None}
try:
    exec(USER_CODE, ns)
    f = ns.get(FUNC_NAME)
    if f is None:
        res["error"] = "function '%s' is not defined" % FUNC_NAME
    else:
        val = f(*copy.deepcopy(json.loads(ARGS_JSON)))
        res["actual"] = json.dumps(val, default=str)
except Exception:
    res["error"] = traceback.format_exc()
json.dumps(res)
`;

const TIME_HARNESS = `
import json, copy, time
ns = {}
exec(USER_CODE, ns)
f = ns.get(FUNC_NAME)
if f is None:
    raise NameError("function '%s' is not defined" % FUNC_NAME)
args = json.loads(ARGS_JSON)
best = None
for _ in range(3):
    a = copy.deepcopy(args)
    t0 = time.perf_counter()
    f(*a)
    dt = (time.perf_counter() - t0) * 1000.0
    best = dt if best is None else min(best, dt)
best
`;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    const py = await pyP;
    py.globals.set("USER_CODE", m.code);
    py.globals.set("FUNC_NAME", m.funcName);
    if (m.type === "grade") {
      py.globals.set("TESTS_JSON", m.testsJSON);
      const t0 = performance.now();
      const raw = await py.runPythonAsync(GRADE_HARNESS);
      self.postMessage({ id: m.id, raw, runtimeMs: Math.round(performance.now() - t0) });
    } else if (m.type === "custom") {
      py.globals.set("ARGS_JSON", JSON.stringify(m.args));
      const raw = await py.runPythonAsync(CUSTOM_HARNESS);
      self.postMessage({ id: m.id, raw });
    } else if (m.type === "time") {
      py.globals.set("ARGS_JSON", JSON.stringify(m.args));
      const ms = await py.runPythonAsync(TIME_HARNESS);
      self.postMessage({ id: m.id, ms });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};

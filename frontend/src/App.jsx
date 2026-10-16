import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
const API = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";
const labels = {
  oom_kill: "Out of memory",
  missing_or_bad_env_var: "Environment variable",
  unreachable_dependency: "Dependency unavailable",
  ci_build_failure: "Build failure",
  healthy: "Healthy",
  uncertain: "Needs investigation",
};
const label = (type) => labels[type] || type?.replaceAll("_", " ") || "Unknown";
const time = (value) => {
  if (!value) return "—";
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};
function Icon({ name, size = 20 }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    box: "m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5",
    pulse: "M2 12h5l3-8 4 16 3-8h5",
    history: "M3 4v6h6 M3 10a9 9 0 1 1 1 8 M12 7v5l3 2",
    branch:
      "M6 3v12a4 4 0 0 0 8 0V9 M14 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    refresh:
      "M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 3 M4 16l2 3a8 8 0 0 0 13-3",
    search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.pulse} />
    </svg>
  );
}
function TypewriterHeading() {
  const text = "Less digging. More debugging.";
  const [length, setLength] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let interval;
    const delay = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setLength(current => {
          if (current + 1 >= text.length) window.clearInterval(interval);
          return Math.min(current + 1, text.length);
        });
      }, 65);
    }, 350);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(interval);
    };
  }, [text]);

  return (
    <h2 className="typewriter-heading" aria-label={text}>
      <span className="typewriter-reserve" aria-hidden="true">{text}</span>
      <span className="typewriter-text" aria-hidden="true">
        {text.slice(0, length)}
        {length < text.length && <span className="typewriter-caret" />}
      </span>
    </h2>
  );
}
function App() {
  const [containers, setContainers] = useState([]),
    [incidents, setIncidents] = useState([]),
    [ci, setCi] = useState(null);
  const [selected, setSelected] = useState(""),
    [diagnosis, setDiagnosis] = useState(null),
    [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [connected, setConnected] = useState(null),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [expanded, setExpanded] = useState(null),
    [updated, setUpdated] = useState(null);
  async function refresh() {
    setRefreshing(true);
    setError("");
    const results = await Promise.allSettled([
      axios.get(`${API}/containers`),
      axios.get(`${API}/incidents`),
      axios.get(`${API}/ci-status`),
    ]);
    setConnected(results[0].status === "fulfilled");
    if (results[0].status === "fulfilled") setContainers(results[0].value.data);
    else
      setError(
        "Assistant service is unavailable. Start the backend and refresh to reconnect.",
      );
    if (results[1].status === "fulfilled") setIncidents(results[1].value.data);
    else
      setError(
        (previous) =>
          previous || "Incident history could not be loaded. Try refreshing.",
      );
    setCi(results[2].status === "fulfilled" ? results[2].value.data : null);
    setUpdated(new Date());
    setRefreshing(false);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function diagnose() {
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    setDiagnosis(null);
    setStats(null);
    try {
      const result = await axios.get(`${API}/diagnose/${selected}`);
      setDiagnosis(result.data.diagnosis);
      setUpdated(new Date());
      const evidence = await Promise.allSettled([
        axios.get(`${API}/logs/${selected}`),
        axios.get(`${API}/incidents`),
      ]);
      if (evidence[0].status === "fulfilled") setStats(evidence[0].value.data);
      if (evidence[1].status === "fulfilled")
        setIncidents(evidence[1].value.data);
    } catch {
      setError(
        "Diagnosis failed. Check the service connection and selected container, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  const visible = incidents.filter(
    (i) =>
      (filter === "all" ||
        (filter === "healthy"
          ? i.failure_type === "healthy"
          : i.failure_type !== "healthy")) &&
      `${i.container_name} ${label(i.failure_type)} ${i.root_cause}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const running = containers.filter((c) => c.status === "running").length;
  return (
    <div className="shell">
      <aside className="navigation">
        <a className="brand" href="#overview">
          <span className="brand-icon">
            <Icon name="pulse" />
          </span>
          <span>
            incident<span className="brand-light">assistant</span>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <a className="active" href="#overview">
            <Icon name="grid" />
            Overview
            <span className="nav-dot" />
          </a>
          <a href="#diagnose">
            <Icon name="box" />
            Containers<span className="nav-count">{containers.length}</span>
          </a>
          <a href="#history">
            <Icon name="history" />
            Incident history
          </a>
          <a href="#pipeline">
            <Icon name="branch" />
            CI/CD pipeline
          </a>
        </nav>
        <div className="nav-bottom">
          <a
            href="https://github.com/Yogesh07garg/ai-incident-assistant"
            target="_blank"
            rel="noreferrer"
          >
            Project documentation <span>↗</span>
          </a>
          <div className="profile">
            <span className="workspace-avatar">DEV</span>
            <div>
              Developer workspace<small>Local environment</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>Overview</strong>
          </span>
          <span className={`connection ${connected === true ? "online" : ""}`}>
            <i />
            {connected === null
              ? "Connecting"
              : connected
                ? "Service connected"
                : "Service offline"}
          </span>
        </header>
        <main id="overview">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR OPERATIONS, AT A GLANCE</div>
              <h1>
                Workspace overview<span>.</span>
              </h1>
              <p>
                Find the failure. Understand the cause. Get back to building.
              </p>
            </div>
            <button
              className="secondary"
              onClick={refresh}
              disabled={refreshing}
            >
              <Icon name="refresh" size={16} />
              {refreshing ? "Refreshing…" : "Refresh workspace"}
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              <strong>Connection notice</strong>
              <span>{error}</span>
            </div>
          )}
          <div className="metrics">
            <Metric
              icon="box"
              title="Containers"
              value={connected ? containers.length : "—"}
              note="Available for diagnosis"
            />
            <Metric
              icon="pulse"
              title="Running containers"
              value={connected ? running : "—"}
              note="Current Docker state"
              green
            />
            <Metric
              icon="history"
              title="Recorded incidents"
              value={incidents.length}
              note="All diagnosis records"
            />
            <Metric
              icon="branch"
              title="Latest pipeline"
              value={ci ? ci.conclusion || ci.status : "Unavailable"}
              note={
                ci
                  ? `Run #${ci.run_number} · ${ci.branch}`
                  : "Connect GitHub Actions"
              }
            />
          </div>
          <div className="dashboard-grid">
            <div className="main-column">
              <section className="diagnose-card" id="diagnose">
                <div className="diagnose-art" aria-hidden="true">
                  <Icon name="spark" size={94} />
                </div>
                <div className="tag">
                  <Icon name="spark" size={13} /> AI-POWERED DIAGNOSIS
                </div>
                <TypewriterHeading />
                <p>
                  Your container logs and pipeline evidence, turned into a clear
                  next step.
                </p>
                <label htmlFor="container">Select a container</label>
                <div className="diagnose-controls">
                  <select
                    id="container"
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setDiagnosis(null);
                      setStats(null);
                    }}
                    disabled={loading}
                  >
                    <option value="">Choose a container to investigate</option>
                    {containers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.status} · {c.id}
                      </option>
                    ))}
                  </select>
                  <button onClick={diagnose} disabled={!selected || loading}>
                    <Icon name="spark" size={17} />
                    {loading ? "Analyzing…" : "Run diagnosis"}
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
                <div className="diagnose-foot">
                  <span>◈ Evidence-based insights</span>
                  <span>Powered by Google Gemini</span>
                </div>
              </section>
              <section className="panel diagnosis" aria-live="polite">
                <div className="section-heading">
                  <h2>
                    <Icon name="spark" size={18} />
                    Diagnosis results
                  </h2>
                  {diagnosis && <Badge type={diagnosis.failure_type} />}
                </div>
                {loading ? (
                  <div className="empty">
                    <div className="empty-icon analyzing">
                      <Icon name="pulse" size={27} />
                    </div>
                    <h3>Connecting the dots…</h3>
                    <p>Collecting evidence and investigating the root cause.</p>
                  </div>
                ) : diagnosis ? (
                  <div className="result">
                    <div className="result-title">
                      <h3>{label(diagnosis.failure_type)}</h3>
                      <span className="confidence">
                        {diagnosis.confidence} confidence
                      </span>
                    </div>
                    <div className="result-grid">
                      <div>
                        <div className="eyebrow">01 / ROOT CAUSE</div>
                        <p>{diagnosis.root_cause}</p>
                      </div>
                      <div className="fix">
                        <div className="eyebrow">02 / SUGGESTED FIX</div>
                        <p>{diagnosis.suggested_fix}</p>
                      </div>
                    </div>
                    {stats && (
                      <div className="evidence">
                        <span>
                          Process <strong>{stats.status}</strong>
                        </span>
                        <span>
                          Exit code <strong>{stats.exit_code ?? "—"}</strong>
                        </span>
                        <span>
                          OOM killed{" "}
                          <strong>{stats.oom_killed ? "Yes" : "No"}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty">
                    <div className="empty-icon">
                      <Icon name="pulse" size={27} />
                    </div>
                    <h3>Your next answer starts here</h3>
                    <p>
                      Select a container and run a diagnosis to uncover
                      <br />
                      the root cause and a recommended fix.
                    </p>
                    <span className="empty-caption">
                      REAL LOGS. CLEAR ANSWERS.
                    </span>
                  </div>
                )}
              </section>
              <section className="panel history" id="history">
                <div className="section-heading">
                  <h2>
                    Incident history{" "}
                    <span className="count">{incidents.length}</span>
                  </h2>
                  <span className="muted">Most recent first</span>
                </div>
                <div className="history-tools">
                  <div className="tabs">
                    {[
                      ["all", "All incidents"],
                      ["issues", "Issues"],
                      ["healthy", "Healthy"],
                    ].map(([value, title]) => (
                      <button
                        key={value}
                        className={filter === value ? "selected" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Icon name="search" size={16} />
                    <input
                      aria-label="Search incidents"
                      placeholder="Search incidents…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                {visible.length ? (
                  <div className="incident-list">
                    {visible.map((i) => (
                      <article key={i.id} className="incident">
                        <button
                          className="incident-row"
                          onClick={() =>
                            setExpanded(expanded === i.id ? null : i.id)
                          }
                          aria-expanded={expanded === i.id}
                        >
                          <span
                            className={`incident-symbol ${i.failure_type === "healthy" ? "good" : ""}`}
                          >
                            {i.failure_type === "healthy" ? "✓" : "!"}
                          </span>
                          <span className="incident-copy">
                            <strong>{i.container_name}</strong>
                            <span>{i.root_cause}</span>
                          </span>
                          <Badge type={i.failure_type} />
                          <time>{time(i.created_at)}</time>
                          <span>{expanded === i.id ? "−" : "+"}</span>
                        </button>
                        {expanded === i.id && (
                          <div className="incident-detail">
                            <strong>Root cause</strong>
                            <p>{i.root_cause}</p>
                            {i.suggested_fix && (
                              <>
                                <strong>Suggested fix</strong>
                                <p>{i.suggested_fix}</p>
                              </>
                            )}
                            {i.confidence && (
                              <small>Confidence: {i.confidence}</small>
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="history-empty">
                    <Icon name="history" size={24} />
                    <h3>
                      {query || filter !== "all"
                        ? "No matching incidents"
                        : "A clean slate"}
                    </h3>
                    <p>
                      {query || filter !== "all"
                        ? "Try another search or filter."
                        : "Your diagnosis history will appear here after your first check."}
                    </p>
                  </div>
                )}
              </section>
            </div>
            <aside className="right-column">
              <section className="panel pipeline" id="pipeline">
                <div className="section-heading">
                  <h2>
                    <Icon name="branch" size={18} />
                    CI/CD pipeline
                  </h2>
                  <span className="tiny-label">GITHUB ACTIONS</span>
                </div>
                {ci ? (
                  <>
                    <div
                      className={`pipeline-status ${ci.conclusion === "success" ? "success" : ""}`}
                    >
                      <span>
                        {ci.conclusion === "success"
                          ? "✓"
                          : ci.conclusion === "failure"
                            ? "!"
                            : "◷"}
                      </span>
                      <div>
                        <strong>{label(ci.conclusion || ci.status)}</strong>
                        <small>Latest workflow run</small>
                      </div>
                    </div>
                    <div className="run-meta">
                      <span>
                        Run <strong>#{ci.run_number}</strong>
                      </span>
                      <span>
                        Branch <strong>{ci.branch}</strong>
                      </span>
                    </div>
                    <p className="commit">{ci.commit_message}</p>
                    {ci.jobs?.map((job) => (
                      <div className="job" key={job.name}>
                        <h3>{job.name}</h3>
                        {job.steps?.map((step) => (
                          <div
                            className={`step ${step.conclusion}`}
                            key={step.name}
                          >
                            <span>
                              {step.conclusion === "success"
                                ? "✓"
                                : step.conclusion === "failure"
                                  ? "×"
                                  : "○"}
                            </span>
                            {step.name}
                          </div>
                        ))}
                      </div>
                    ))}
                    <a
                      className="pipeline-link"
                      href={ci.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View workflow on GitHub ↗
                    </a>
                    <p className="scope">
                      Repository-wide status, independent of the selected
                      container.
                    </p>
                  </>
                ) : (
                  <div className="pipeline-empty">
                    <div className="empty-icon">
                      <Icon name="branch" size={26} />
                    </div>
                    <h3>No pipeline data yet</h3>
                    <p>
                      Configure GITHUB_TOKEN and GITHUB_REPO in the backend to
                      see your latest workflow.
                    </p>
                    <a
                      href="https://github.com/Yogesh07garg/ai-incident-assistant#environment-variables"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View setup guide ↗
                    </a>
                  </div>
                )}
              </section>
              <section className="how-it-works">
                <div className="eyebrow">FROM FAILURE TO FIX</div>
                <h2>
                  A second pair of eyes
                  <br />
                  for your infrastructure.
                </h2>
                {[
                  [
                    "01",
                    "Collect the evidence",
                    "Docker state, logs, and CI signals.",
                  ],
                  [
                    "02",
                    "Connect the dots",
                    "Gemini investigates what went wrong.",
                  ],
                  [
                    "03",
                    "Take the next step",
                    "A root cause and an actionable fix.",
                  ],
                ].map(([n, title, desc]) => (
                  <div className="how-step" key={n}>
                    <span>{n}</span>
                    <div>
                      <strong>{title}</strong>
                      <p>{desc}</p>
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>
          <footer>
            <span>
              <Icon name="pulse" size={15} /> Incident Assistant
            </span>
            <span>
              {updated
                ? `Last checked ${updated.toLocaleTimeString()}`
                : "Waiting for workspace data"}
              <span className="footer-divider">·</span>Docker + CI/CD
              intelligence
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({ icon, title, value, note, green }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{title}</span>
        <Icon name={icon} size={19} />
      </div>
      <strong className={green ? "green-text" : ""}>{value}</strong>
      <small>
        {green && <i />}
        {note}
      </small>
    </div>
  );
}
function Badge({ type }) {
  return (
    <span
      className={`badge ${type === "healthy" ? "good" : type === "uncertain" ? "neutral" : ""}`}
    >
      <i />
      {label(type)}
    </span>
  );
}
export default App;

import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:8001";

const SEVERITY = {
  oom_kill: "#E5484D",
  missing_or_bad_env_var: "#F5A623",
  unreachable_dependency: "#5B8DEF",
  ci_build_failure: "#E5484D",
  healthy: "#3DD68C",
  uncertain: "#7C8798",
};

function accentFor(type) {
  return SEVERITY[type] || "#7C8798";
}
function formatTimestamp(ts) {
  const iso = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z";
  return new Date(iso).toLocaleString();
}

const confidenceBars = { high: 6, medium: 4, low: 2 };

function App() {
  const [containers, setContainers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [diagnosis, setDiagnosis] = useState(null);
  const [containerStats, setContainerStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [ciStatus, setCiStatus] = useState(null);

  const fetchContainers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/containers`);
      setContainers(res.data);
    } catch {
      setError("Couldn't reach the Assistant service. Confirm it's running.");
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await axios.get(`${API_BASE}/incidents`);
      setIncidents(res.data);
    } catch {
      setError("Couldn't load incident history.");
    }
  };

  const fetchCiStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ci-status`);
      setCiStatus(res.data);
    } catch {
      setCiStatus(null);
    }
  };

  useEffect(() => {
    fetchContainers();
    fetchIncidents();
    fetchCiStatus();
  }, []);

  const handleDiagnose = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setDiagnosis(null);
    setContainerStats(null);
    try {
      const [diagRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/diagnose/${selectedId}`),
        axios.get(`${API_BASE}/logs/${selectedId}`),
      ]);
      setDiagnosis(diagRes.data.diagnosis);
      setContainerStats(logsRes.data);
      setLastUpdated(new Date());
      fetchIncidents();
      fetchCiStatus();
    } catch {
      setError("Diagnosis failed. Check the container is still valid.");
    } finally {
      setLoading(false);
    }
  };

  const confidenceLevel = diagnosis?.confidence || "low";
  const activeBars = confidenceBars[confidenceLevel] || 2;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-icon">✦</div>
          <div>
            <h1>Incident Assistant</h1>
            <div className="subtitle">Automated Docker + CI/CD failure diagnosis</div>
          </div>
        </div>

        <div className="header-right">
          <div className="live-wrapper">
            <div className="status-pill">
              <span className="status-dot" />
              SYSTEM LIVE
            </div>
            <div className="updated-text">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Awaiting first check"}
            </div>
          </div>
        </div>
      </header>

      <div className="layout">
        <div className="main-col">
          <section className="panel target-panel">
            <div className="hero-title">Diagnose an issue</div>
            <div className="hero-subtitle">Select a container to get an AI-powered diagnosis</div>
            <div className="select-row">
              <div className="select-wrapper">
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Choose a container</option>
                  {containers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.id} · {c.status}
                    </option>
                  ))}
                </select>
                <span className="select-arrow">⌄</span>
              </div>

              <button className="diagnose-button" onClick={handleDiagnose} disabled={!selectedId || loading}>
                {loading ? "Diagnosing…" : "✦  Diagnose"}
              </button>

              <button className="refresh-button" onClick={fetchContainers} title="Refresh containers">
                ↻
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {containerStats && (
            <section className="panel stats-panel">
              <div className="stat-block">
                <div className={`stat-icon ${containerStats.status === "running" ? "stat-icon-ok" : "stat-icon-warn"}`}>
                  {containerStats.status === "running" ? "✓" : "!"}
                </div>
                <div>
                  <div className="stat-label">Process status</div>
                  <div className="stat-value">{containerStats.status}</div>
                  <div className="stat-sub">
                    {containerStats.status === "running" ? "Alive — see diagnosis below" : "Process has exited"}
                  </div>
                </div>
              </div>

              <div className="stat-block">
                <div className="stat-icon stat-icon-neutral">{">_"}</div>
                <div>
                  <div className="stat-label">Exit code</div>
                  <div className="stat-value">{containerStats.exit_code ?? "—"}</div>
                  <div className="stat-sub">{containerStats.exit_code === 0 ? "Success" : "Non-zero"}</div>
                </div>
              </div>

              <div className="stat-block">
                <div className={`stat-icon ${containerStats.oom_killed ? "stat-icon-danger" : "stat-icon-neutral"}`}>
                  ⚡
                </div>
                <div>
                  <div className="stat-label">OOM killed</div>
                  <div className="stat-value">{containerStats.oom_killed ? "Yes" : "No"}</div>
                  <div className="stat-sub">{containerStats.oom_killed ? "Memory limit exceeded" : "No memory issues"}</div>
                </div>
              </div>

              <div className="stat-block">
                <div className="stat-icon stat-icon-neutral">◷</div>
                <div>
                  <div className="stat-label">Last updated</div>
                  <div className="stat-value">Just now</div>
                  <div className="stat-sub">{lastUpdated?.toLocaleString()}</div>
                </div>
              </div>
            </section>
          )}

          {diagnosis && (
            <section className="panel diagnosis-panel" style={{ "--accent": accentFor(diagnosis.failure_type) }}>
              <div className="diagnosis-title-row">
                <div className="diagnosis-title">
                  <span className="diagnosis-title-icon">✦</span>
                  Latest diagnosis
                </div>
                <div className="ai-badge">✦ Generated using Google Gemini</div>
              </div>

              <div className="diagnosis-main">
                <div className="diagnosis-overview">
                  <div className="diagnosis-status-icon">
                    {diagnosis.failure_type === "healthy" ? "✓" : "◉"}
                  </div>
                  <div>
                    <div className="failure-label">Failure type</div>
                    <div className="failure-type">{diagnosis.failure_type}</div>
                    <p className="failure-summary">{diagnosis.root_cause}</p>
                  </div>
                </div>

                <div className="confidence-box">
                  <div className="confidence-label">Confidence</div>
                  <div className="confidence-value">{diagnosis.confidence}</div>
                  <div className="confidence-bars">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <span key={index} className={index < activeBars ? "confidence-bar active" : "confidence-bar"} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="diagnosis-details">
                <div className="detail-card">
                  <div className="detail-label">Root cause</div>
                  <div className="detail-value">{diagnosis.root_cause}</div>
                </div>
                <div className="detail-card">
                  <div className="detail-label">Suggested fix</div>
                  <div className="detail-value">{diagnosis.suggested_fix}</div>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="history-header">
              <div className="history-title">
                <span className="history-icon">▣</span>
                Incident history
              </div>
              <div className="incident-count">
                {incidents.length} incident{incidents.length === 1 ? "" : "s"}
              </div>
            </div>

            {incidents.length === 0 && <div className="empty-state">No incidents recorded yet.</div>}

            <div className="incident-list-wrapper">
              <ul className="incident-list">
                {incidents.map((i) => (
                  <li key={i.id} className="incident-item" style={{ "--accent": accentFor(i.failure_type) }}>
  <div className="incident-card-top">
    <div className="incident-avatar">
      {i.failure_type === "healthy" ? "✓" : i.failure_type === "unreachable_dependency" ? "i" : "!"}
    </div>
    
  </div>

  <div className="incident-name">{i.container_name}</div>
  <span className="incident-type">{i.failure_type}</span>

  <div className="incident-cause-box">
    <div className="incident-cause-icon">
      {i.failure_type === "healthy" ? "✓" : i.failure_type === "unreachable_dependency" ? "i" : "!"}
    </div>
    <div className="incident-cause">{i.root_cause}</div>
  </div>

  <div className="incident-footer">
    
    <span className="incident-time">{formatTimestamp(i.created_at)}</span>
  </div>
</li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {ciStatus && (
  <aside className="ci-sidebar">
    <div className="panel-label">Latest CI/CD run</div>
    <div className="ci-run-card">
      <div className={`ci-badge ci-${ciStatus.conclusion || "pending"}`}>
        {ciStatus.conclusion === "success" ? "✓" : ciStatus.conclusion === "failure" ? "✕" : "…"}
      </div>
      <div className="ci-title">
        Run #{ciStatus.run_number} · {ciStatus.branch}
      </div>
      <div className="ci-sub">{ciStatus.commit_message}</div>
      <div className="ci-progress-track">
        <div
          className="ci-progress-fill"
          style={{
            width:
              ciStatus.conclusion === "success"
                ? "100%"
                : ciStatus.conclusion === "failure"
                ? "15%"
                : "50%",
          }}
        />
      </div>
      <div className="ci-sidebar-actions">
        <span className={`ci-status-tag ci-${ciStatus.conclusion || "pending"}`}>
          {ciStatus.conclusion || ciStatus.status}
        </span>
        <a href={ciStatus.html_url} target="_blank" rel="noreferrer" className="ci-link">
          View on GitHub ↗
        </a>
      </div>
      <div className="ci-scope-note">
        Reflects the repository's latest pipeline run — independent of the container selected.
      </div>
    </div>

            {ciStatus.jobs?.map((job) => (
              <div key={job.name} className="ci-job">
                <div className="ci-job-name">{job.name}</div>
                <div className="ci-steps">
                  {job.steps.map((step) => (
                    <div key={step.name} className={`ci-step ci-step-${step.conclusion || "pending"}`}>
                      <span className="ci-step-icon">
                        {step.conclusion === "success" ? "✓" : step.conclusion === "failure" ? "✕" : "○"}
                      </span>
                      <span className="ci-step-name">{step.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>

      
    </div>
  );
}

export default App;
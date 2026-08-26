import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8001";

function App() {
  const [containers, setContainers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [diagnosis, setDiagnosis] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchContainers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/containers`);
      setContainers(res.data);
    } catch (err) {
      setError("Failed to fetch containers. Is the Assistant service running?");
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await axios.get(`${API_BASE}/incidents`);
      setIncidents(res.data);
    } catch (err) {
      setError("Failed to fetch incident history.");
    }
  };

  useEffect(() => {
    fetchContainers();
    fetchIncidents();
  }, []);

  const handleDiagnose = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setDiagnosis(null);
    try {
      const res = await axios.get(`${API_BASE}/diagnose/${selectedId}`);
      setDiagnosis(res.data.diagnosis);
      fetchIncidents(); // refresh history after a new diagnosis
    } catch (err) {
      setError("Diagnosis failed. Check that the container ID is valid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 20px" }}>
      <h1>AI Deployment Incident Assistant</h1>

      <section style={{ marginBottom: 30 }}>
        <h2>1. Select a container</h2>
        <button onClick={fetchContainers} style={{ marginBottom: 10 }}>
          Refresh container list
        </button>
        <div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            <option value="">-- choose a container --</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id}) — {c.status}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleDiagnose}
          disabled={!selectedId || loading}
          style={{ marginTop: 10, padding: "8px 16px" }}
        >
          {loading ? "Diagnosing..." : "Diagnose"}
        </button>
      </section>

      {error && (
        <div style={{ color: "red", marginBottom: 20 }}>{error}</div>
      )}

      {diagnosis && (
        <section style={{ marginBottom: 30, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
          <h2>Diagnosis Result</h2>
          <p><strong>Failure type:</strong> {diagnosis.failure_type}</p>
          <p><strong>Root cause:</strong> {diagnosis.root_cause}</p>
          <p><strong>Suggested fix:</strong> {diagnosis.suggested_fix}</p>
          <p><strong>Confidence:</strong> {diagnosis.confidence}</p>
        </section>
      )}

      <section>
        <h2>Incident History</h2>
        {incidents.length === 0 && <p>No incidents recorded yet.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {incidents.map((i) => (
            <li
              key={i.id}
              style={{ padding: 12, marginBottom: 8, border: "1px solid #ddd", borderRadius: 6 }}
            >
              <div><strong>{i.container_name}</strong> — {i.failure_type} ({i.confidence} confidence)</div>
              <div style={{ fontSize: 14, color: "#555" }}>{i.root_cause}</div>
              <div style={{ fontSize: 12, color: "#999" }}>{new Date(i.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
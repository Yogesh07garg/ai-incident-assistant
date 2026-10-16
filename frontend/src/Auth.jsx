import { useEffect, useState } from "react";
import Dashboard from "./App";
import api, { API } from "./api";
import "./Auth.css";

export default function Auth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) setUser(null);
        return Promise.reject(error);
      },
    );
    api
      .get(`${API}/auth/me`, { signal: controller.signal })
      .then((response) => setUser(response.data))
      .catch((error) => {
        if (error.code !== "ERR_CANCELED" && error.response?.status !== 401) {
          setNotice(
            "Unable to connect. Check that the assistant service is running, then try signing in.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => {
      controller.abort();
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  async function logout() {
    try {
      await api.post(`${API}/auth/logout`);
      setNotice("");
      setUser(null);
    } catch {
      setNotice("Could not sign out. Check the connection and try again.");
    }
  }

  if (checking)
    return (
      <div className="auth-loading" role="status">
        Checking your session…
      </div>
    );
  if (user)
    return (
      <>
        {notice && (
          <div className="auth-session-notice" role="alert">
            {notice}
          </div>
        )}
        <Dashboard user={user} onLogout={logout} />
      </>
    );
  return (
    <Login
      notice={notice}
      onLogin={(value) => {
        setNotice("");
        setUser(value);
      }}
    />
  );
}

function Login({ onLogin, notice }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.post(`${API}/auth/login`, {
        username,
        password,
      });
      setPassword("");
      onLogin(response.data);
    } catch (failure) {
      const detail = failure.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Unable to sign in. Check the service connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Incident Assistant">
        <a
          className="login-brand"
          href="/"
          aria-label="Incident Assistant home"
        >
          <span>∿</span>incident
          <span className="login-brand-light">assistant</span>
        </a>
        <div className="login-story-copy">
          <div className="login-kicker">DOCKER + CI/CD INTELLIGENCE</div>
          <h1>
            Your next fix
            <br />
            starts here<span>.</span>
          </h1>
          <p>
            A clearer view of your containers, incidents,
            <br />
            and the evidence behind every diagnosis.
          </p>
          <div className="login-signal" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="login-story-footer">
          Incident Assistant <span>From evidence to answers.</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-kicker">YOUR WORKSPACE</div>
          <h2>Welcome back.</h2>
          <p className="login-intro">
            Sign in to investigate, diagnose, and keep building.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              name="username"
              autoComplete="username"
              required
              maxLength={100}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              disabled={busy}
            />
            <label htmlFor="login-password">Password</label>
            <div className="login-password">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                disabled={busy}
              />
              <button
                type="button"
                aria-controls="login-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {(error || notice) && (
              <div className="login-error" role="alert">
                {error || notice}
              </div>
            )}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-help">
            Use the account configured for this installation.
            <br />
            Need access? Contact the person who manages your workspace.
          </p>
          <div className="login-form-footer">
            One workspace. A clearer picture.
          </div>
        </div>
      </section>
    </main>
  );
}


import { useEffect, useState } from "react";
import { getProfile, login } from "./api/auth";
import RoleDashboard from "./RoleDashboard.jsx";
import "./App.css";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(() =>
    Boolean(
      localStorage.getItem("smartprod_access_token") ||
        sessionStorage.getItem("smartprod_access_token"),
    ),
  );

  useEffect(() => {
    let active = true;
    const token =
      localStorage.getItem("smartprod_access_token") ||
      sessionStorage.getItem("smartprod_access_token");

    if (!token) {
      return () => {
        active = false;
      };
    }

    getProfile(token)
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        localStorage.removeItem("smartprod_access_token");
        sessionStorage.removeItem("smartprod_access_token");
        if (active) setError("Your session has expired. Please sign in again.");
      })
      .finally(() => {
        if (active) setIsCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    setIsLoading(true);
    try {
      const auth = await login({ email: email.trim(), password });
      localStorage.removeItem("smartprod_access_token");
      sessionStorage.removeItem("smartprod_access_token");
      (remember ? localStorage : sessionStorage).setItem(
        "smartprod_access_token",
        auth.access_token,
      );
      setUser(auth.user);
      setPassword("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("smartprod_access_token");
    sessionStorage.removeItem("smartprod_access_token");
    setUser(null);
    setPassword("");
  }

  if (user && !isCheckingSession) {
    return <RoleDashboard user={user} onLogout={handleLogout} />;
  }

  return (
    <main className="portal">
      <section className="visual-side">
        <header className="top-brand">
          <div className="logo-box">
            <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path
                d="M7 39V27h8v12M20 39V17h8v22M33 39V7h8v32"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="m6 18 12-8 8 4L41 3"
                stroke="#36E6B0"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M32 3h9v9"
                stroke="#36E6B0"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="logo-text">
            <span>
              smart<span className="logo-green">prod</span>
            </span>
            <small>INDUSTRIAL INTELLIGENCE</small>
          </div>
        </header>

        <div className="visual-content">
          <div className="live-label">
            <span className="live-dot" />
            PRODUCTION INTELLIGENCE PLATFORM
          </div>

          <h1>
            Every unit
            <br />
            <span>counts.</span>
            <br />
            Every second
            <br />
            <span>matters.</span>
          </h1>

          <p className="visual-description">
            Your factory. Your data. Your decisions. Bring production, machine
            health and quality into one intelligent workspace.
          </p>

          <div className="visual-divider" />

          <div className="mini-heading">
            BUILT FOR BETTER PRODUCTION
          </div>

          <div className="capability-list">
            <div className="capability">
              <span className="capability-icon">↗</span>
              <div>
                <strong>Production visibility</strong>
                <p>Targets, output and shift performance</p>
              </div>
            </div>

            <div className="capability">
              <span className="capability-icon">◷</span>
              <div>
                <strong>Machine intelligence</strong>
                <p>Downtime tracking and status monitoring</p>
              </div>
            </div>

            <div className="capability">
              <span className="capability-icon">✓</span>
              <div>
                <strong>Quality at every stage</strong>
                <p>Defect analysis and efficiency insights</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="visual-footer">
          <span>SMART MANUFACTURING</span>
          <span className="footer-separator">/</span>
          <span>OPERATIONAL EXCELLENCE</span>
          <span className="footer-version">PLATFORM 1.0</span>
        </footer>
      </section>

      <section className="auth-side">
        <div className="auth-decoration decoration-one" />
        <div className="auth-decoration decoration-two" />

        <div className="auth-top">
          <span className="secure-indicator">
            <span>✓</span> SECURE WORKSPACE
          </span>
        </div>

        {isCheckingSession ? (
          <div className="auth-card auth-status" role="status">
            Checking your secure session…
          </div>
        ) : (
        <form className="auth-card" onSubmit={handleSubmit} noValidate>
          <div className="mobile-brand">
            <div className="mobile-logo">S</div>
            <strong>
              smart<span>prod</span>
            </strong>
          </div>

          <div className="welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="auth-eyebrow">
            WELCOME BACK
          </div>

          <h2>
            Sign in<span>.</span>
          </h2>

          <p className="auth-description">
            Enter your credentials to access your production workspace.
          </p>

          <div className="field">
            <label htmlFor="email">WORK EMAIL</label>

            <div className="control">
              <span className="control-icon">@</span>

              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                required
              />
            </div>

          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="password">PASSWORD</label>

              <span className="password-hint">Minimum 8 characters</span>
            </div>

            <div className="control">
              <span className="control-icon">⌑</span>

              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                autoComplete="current-password"
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
              />

              <button
                type="button"
                className="visibility-button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="custom-check">✓</span>
            <span>Keep me signed in</span>
          </label>

          {error && (
            <div className="error-message" role="alert">
              <span>!</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-button" disabled={isLoading}>
            <span>
              {isLoading
                ? "Please wait…"
                : "Access workspace"}
            </span>
            <span className="button-arrow">↗</span>
          </button>

          <div className="auth-separator">
            <span />
            <small>AUTHORIZED ACCESS ONLY</small>
            <span />
          </div>

          <p className="auth-note">
            Your workspace is protected by role-based access controls.
          </p>
        </form>

        )}
        <footer className="auth-footer">
          <span>© 2026 SmartProd</span>
          <span>Production Monitoring &amp; Efficiency</span>
        </footer>
      </section>
    </main>
  );
}

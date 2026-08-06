import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, LogIn } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, ApiRequestError, queryKeys, type AuthenticatedSession } from "../lib/api";

type AuthContextValue = {
  session: AuthenticatedSession;
  logout: () => Promise<void>;
  loggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: api.session,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    const markSignedOut = () => {
      queryClient.setQueryData(queryKeys.session, { authenticated: false });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
    };
    window.addEventListener("mosaiq:unauthorized", markSignedOut);
    return () => window.removeEventListener("mosaiq:unauthorized", markSignedOut);
  }, [queryClient]);

  if (sessionQuery.isPending) return <SessionLoading />;
  if (sessionQuery.isError) return <SessionUnavailable retry={() => void sessionQuery.refetch()} />;
  if (!sessionQuery.data.authenticated) return <SignedOutRoutes />;

  return (
    <SignedInContext session={sessionQuery.data} queryClient={queryClient}>
      {children}
    </SignedInContext>
  );
}

function SignedInContext({
  session,
  queryClient,
  children,
}: {
  session: AuthenticatedSession;
  queryClient: ReturnType<typeof useQueryClient>;
  children: ReactNode;
}) {
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      queryClient.setQueryData(queryKeys.session, { authenticated: false });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
      setLoggingOut(false);
    }
  };
  return (
    <AuthContext.Provider value={{ session, logout, loggingOut }}>{children}</AuthContext.Provider>
  );
}

function SignedOutRoutes() {
  const location = useLocation();
  if (location.pathname === "/login") return <LoginPage />;
  return (
    <Navigate
      replace
      to="/login"
      state={{ from: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside an authenticated Mosaiq view.");
  return value;
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const session = await api.login({ username, password });
      queryClient.setQueryData(queryKeys.session, session);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 429
          ? "Too many attempts. Take a moment, then try again."
          : "That username and password do not match.",
      );
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-story" aria-label="About Mosaiq">
        <BrandLockup />
        <div className="login-story__copy">
          <span className="eyebrow">Your private visual library</span>
          <h1>Keep what catches your eye.</h1>
          <p>A quiet place for images, ideas, and the details worth returning to.</p>
        </div>
        <div className="login-composition" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </section>
      <section className="login-entry">
        <form className="login-card" onSubmit={submit}>
          <span className="login-card__icon" aria-hidden="true">
            <LockKeyhole size={20} />
          </span>
          <span className="eyebrow">Welcome back</span>
          <h2>Open your library</h2>
          <p>Sign in with your Mosaiq owner account.</p>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              autoFocus
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <div className="login-card__error" role="alert">
              {error}
            </div>
          )}
          <button className="button button--primary login-card__submit" disabled={submitting}>
            <LogIn size={17} />
            {submitting ? "Opening…" : "Open Mosaiq"}
          </button>
        </form>
      </section>
    </main>
  );
}

function BrandLockup() {
  return (
    <div className="login-brand">
      <span className="brand__mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand__word">Mosaiq</span>
    </div>
  );
}

function SessionLoading() {
  return (
    <main className="session-gate" aria-label="Opening Mosaiq">
      <BrandLockup />
      <span>Opening your library…</span>
    </main>
  );
}

function SessionUnavailable({ retry }: { retry: () => void }) {
  return (
    <main className="session-gate">
      <BrandLockup />
      <p>Mosaiq could not reach the library service.</p>
      <button className="button button--secondary" onClick={retry}>
        Try again
      </button>
    </main>
  );
}

export function LoginRedirect() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <Navigate replace to={from?.startsWith("/") && !from.startsWith("//") ? from : "/library"} />
  );
}

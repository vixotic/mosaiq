import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { Button, ErrorState, LoadingState, formatBytes } from "../components/ui";
import { api, queryKeys } from "../lib/api";

export function SettingsPage() {
  const query = useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings, staleTime: 0 });
  return (
    <div className="page settings-page">
      <header className="page-heading">
        <span className="eyebrow">Local status</span>
        <h1>Settings</h1>
        <p>A quiet overview of where Mosaiq keeps things and how AI is connected.</p>
      </header>
      {query.isLoading && <LoadingState label="Checking your setup…" />}
      {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
      {query.data && (
        <>
          {query.data.lanExposed && (
            <div className="warning-banner">
              <AlertTriangle size={19} />
              <div>
                <strong>Mosaiq is exposed beyond this device</strong>
                <p>Bind the API to 127.0.0.1 unless LAN access is intentional.</p>
              </div>
            </div>
          )}
          <div className="settings-grid">
            <StatusCard
              icon={<Database size={21} />}
              title="Database"
              healthy={query.data.database.available}
              value={query.data.database.available ? "Connected" : "Unavailable"}
              detail={query.data.database.message || "Metadata and relationships"}
            />
            <StatusCard
              icon={<HardDrive size={21} />}
              title="Local storage"
              healthy={query.data.storage.available}
              value={query.data.storage.available ? "Ready" : "Unavailable"}
              detail={query.data.storage.displayPath}
            />
            <StatusCard
              icon={<Sparkles size={21} />}
              title="AI provider"
              healthy={query.data.provider.available}
              neutral={!query.data.provider.configured}
              value={
                query.data.provider.id === "disabled"
                  ? "Disabled"
                  : query.data.provider.id === "mock"
                    ? "Mock analyser"
                    : query.data.provider.id === "gemini"
                      ? "Gemini cloud"
                      : "Ollama"
              }
              detail={
                query.data.provider.message || query.data.provider.model || "No model selected"
              }
            />
          </div>
          <section className="settings-panel">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Runtime configuration</span>
                <h2>Connection details</h2>
              </div>
              <Button
                variant="secondary"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw className={query.isFetching ? "spin" : ""} size={15} /> Refresh
              </Button>
            </div>
            <dl className="settings-list">
              <div>
                <dt>Active provider</dt>
                <dd>{query.data.provider.id}</dd>
              </div>
              <div>
                <dt>Provider endpoint</dt>
                <dd>{query.data.provider.baseUrl || "Not configured"}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{query.data.provider.model || "Not configured"}</dd>
              </div>
              <div>
                <dt>Storage root</dt>
                <dd>{query.data.storage.displayPath}</dd>
              </div>
              <div>
                <dt>Maximum upload</dt>
                <dd>{formatBytes(query.data.maxUploadBytes)} per image</dd>
              </div>
            </dl>
            <p className="settings-note">
              These values come from the local environment. Storage paths and provider configuration
              are intentionally read-only here.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  healthy,
  neutral,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  healthy: boolean;
  neutral?: boolean;
  value: string;
  detail: string;
}) {
  return (
    <article
      className={`status-card ${healthy ? "status-card--healthy" : neutral ? "status-card--neutral" : "status-card--down"}`}
    >
      <div className="status-card__icon">{icon}</div>
      <span>{title}</span>
      <h2>{value}</h2>
      <p>{detail}</p>
      <div className="status-card__state">
        {healthy ? <CheckCircle2 size={15} /> : <WifiOff size={15} />}
        {healthy ? "Available" : neutral ? "Optional" : "Needs attention"}
      </div>
    </article>
  );
}

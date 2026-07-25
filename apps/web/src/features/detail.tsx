import type { LibraryItemDetail, UpdateLibraryItemInput } from "@mosaiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Heart,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ErrorState,
  Field,
  LoadingState,
  StatusBadge,
  TextInput,
  formatBytes,
  formatDate,
} from "../components/ui";
import { api, mediaUrl, queryKeys } from "../lib/api";

type Draft = {
  title: string;
  titleOverride: boolean;
  description: string;
  descriptionOverride: boolean;
  notes: string;
  sourceUrl: string;
  reasons: string[];
  reasonsOverride: boolean;
};

function toDraft(item: LibraryItemDetail): Draft {
  return {
    title: item.user.title ?? item.activeAnalysis?.result.title ?? "",
    titleOverride: item.user.title !== null,
    description: item.user.description ?? item.activeAnalysis?.result.description ?? "",
    descriptionOverride: item.user.description !== null,
    notes: item.user.notes ?? "",
    sourceUrl: item.sourceUrl ?? "",
    reasons:
      item.user.inspirationReasonsOverride ?? item.activeAnalysis?.result.inspirationReasons ?? [],
    reasonsOverride: item.user.inspirationReasonsOverride !== null,
  };
}

export function LibraryItemPage() {
  const { itemId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.detail(itemId),
    queryFn: () => api.getLibraryItem(itemId),
    enabled: Boolean(itemId),
    refetchInterval: ({ state }) =>
      state.data && ["pending", "processing"].includes(state.data.processing.status) ? 2500 : false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data && !dirty) setDraft(toDraft(query.data));
  }, [query.data, dirty]);

  const update = useMutation({
    mutationFn: (input: UpdateLibraryItemInput) => api.updateLibraryItem(itemId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.detail(itemId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot });
      setDirty(false);
      setDraft(toDraft(data));
    },
  });

  if (query.isLoading || !draft)
    return (
      <div className="page">
        <LoadingState label="Opening this reference…" />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <ErrorState error={query.error} retry={() => query.refetch()} />
      </div>
    );
  const item = query.data;
  if (!item) return null;

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  function save() {
    if (!draft) return;
    update.mutate({
      userTitle: draft.titleOverride ? draft.title : null,
      userDescription: draft.descriptionOverride ? draft.description : null,
      userNotes: draft.notes,
      userInspirationReasons: draft.reasonsOverride ? draft.reasons.filter(Boolean) : null,
      sourceUrl: draft.sourceUrl.trim() || null,
    });
  }

  return (
    <div className="page detail-page">
      <header className="detail-topbar">
        <button className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={17} /> Back
        </button>
        <div className="detail-actions">
          {dirty && <span className="unsaved-dot">Unsaved changes</span>}
          <Button onClick={save} disabled={!dirty || update.isPending}>
            <Save size={16} /> {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="detail-layout">
        <section className="detail-preview">
          <img
            src={mediaUrl(item.asset.originalUrl)}
            alt={item.resolved.title || item.originalFilename}
          />
          <div className="file-facts">
            <span>{item.originalFilename}</span>
            <span>
              {item.asset.width} × {item.asset.height}
            </span>
            <span>{formatBytes(item.asset.fileSize)}</span>
            <span>{formatDate(item.createdAt)}</span>
          </div>
        </section>

        <section className="detail-editor">
          <div className="detail-editor__intro">
            <div>
              <span className="eyebrow">Visual reference</span>
              <h1>{draft.title || "Untitled reference"}</h1>
            </div>
            <ToggleActions item={item} />
          </div>

          {update.isError && <ErrorState error={update.error} />}

          <section className="editor-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Your context</span>
                <h2>What you see in it</h2>
              </div>
              {(draft.titleOverride || draft.descriptionOverride) && (
                <span className="ownership-label">Your overrides</span>
              )}
            </div>
            <Field
              label="Title"
              hint={
                draft.titleOverride
                  ? "Your title takes priority over AI."
                  : "Currently using the AI suggestion."
              }
            >
              <div className="field-with-action">
                <TextInput
                  value={draft.title}
                  onChange={(e) => patchDraft({ title: e.target.value, titleOverride: true })}
                />
                {draft.titleOverride && (
                  <button
                    onClick={() =>
                      patchDraft({
                        title: item.activeAnalysis?.result.title ?? "",
                        titleOverride: false,
                      })
                    }
                  >
                    Use AI
                  </button>
                )}
              </div>
            </Field>
            <Field
              label="Description"
              hint={
                draft.descriptionOverride
                  ? "Your description takes priority over AI."
                  : "Currently using the AI suggestion."
              }
            >
              <div className="field-with-action">
                <textarea
                  className="textarea"
                  rows={4}
                  value={draft.description}
                  onChange={(e) =>
                    patchDraft({ description: e.target.value, descriptionOverride: true })
                  }
                />
                {draft.descriptionOverride && (
                  <button
                    onClick={() =>
                      patchDraft({
                        description: item.activeAnalysis?.result.description ?? "",
                        descriptionOverride: false,
                      })
                    }
                  >
                    Use AI
                  </button>
                )}
              </div>
            </Field>
            <Field label="Notes">
              <textarea
                className="textarea"
                rows={5}
                value={draft.notes}
                onChange={(e) => patchDraft({ notes: e.target.value })}
                placeholder="Add your own thought, application, or reminder…"
              />
            </Field>
            <Field label="Source URL">
              <div className="field-with-action">
                <TextInput
                  type="url"
                  value={draft.sourceUrl}
                  onChange={(e) => patchDraft({ sourceUrl: e.target.value })}
                  placeholder="https://…"
                />
                {draft.sourceUrl && (
                  <a
                    href={draft.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open source"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </Field>
          </section>

          <WhyItMatters item={item} draft={draft} patchDraft={patchDraft} />
          <TagsSection item={item} />
          <AiSection item={item} />
          <CollectionsPicker item={item} />

          <section className="editor-section danger-section">
            <div>
              <h2>Remove reference</h2>
              <p>This hides the library item. The original asset is kept safely on disk.</p>
            </div>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Remove this reference from your library?")) return;
                await api.deleteLibraryItem(item.id);
                await queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot });
                navigate("/library");
              }}
            >
              <Trash2 size={16} /> Remove
            </Button>
          </section>
        </section>
      </div>
    </div>
  );
}

function ToggleActions({ item }: { item: LibraryItemDetail }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: UpdateLibraryItemInput) => api.updateLibraryItem(item.id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.detail(item.id), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot });
    },
  });
  return (
    <div className="toggle-actions">
      <button
        className={item.user.favourite ? "is-active" : ""}
        onClick={() => mutation.mutate({ favourite: !item.user.favourite })}
      >
        <Heart size={17} fill={item.user.favourite ? "currentColor" : "none"} /> Favourite
      </button>
      <button
        className={item.user.reviewed ? "is-active" : ""}
        onClick={() => mutation.mutate({ reviewed: !item.user.reviewed })}
      >
        <Check size={17} /> {item.user.reviewed ? "Reviewed" : "Mark reviewed"}
      </button>
    </div>
  );
}

function WhyItMatters({
  item,
  draft,
  patchDraft,
}: {
  item: LibraryItemDetail;
  draft: Draft;
  patchDraft: (patch: Partial<Draft>) => void;
}) {
  const [next, setNext] = useState("");
  return (
    <section className="editor-section reasons-section">
      <div className="section-heading">
        <div>
          <span className="section-kicker">The heart of it</span>
          <h2>Why this matters</h2>
          <p>Record what made this image worth saving.</p>
        </div>
        {draft.reasonsOverride ? (
          <button
            className="text-action"
            onClick={() =>
              patchDraft({
                reasons: item.activeAnalysis?.result.inspirationReasons ?? [],
                reasonsOverride: false,
              })
            }
          >
            <RotateCcw size={14} /> Use AI suggestions
          </button>
        ) : (
          <span className="ownership-label">
            <Sparkles size={13} /> AI suggestions
          </span>
        )}
      </div>
      <div className="reason-list">
        {draft.reasons.map((reason, index) => (
          <div className="reason-row" key={`${reason}-${index}`}>
            <span>{index + 1}</span>
            <input
              value={reason}
              onChange={(e) => {
                const reasons = [...draft.reasons];
                reasons[index] = e.target.value;
                patchDraft({ reasons, reasonsOverride: true });
              }}
            />
            <button
              aria-label={`Remove ${reason}`}
              onClick={() =>
                patchDraft({
                  reasons: draft.reasons.filter((_, i) => i !== index),
                  reasonsOverride: true,
                })
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {draft.reasons.length === 0 && (
          <p className="muted">Nothing recorded yet. Add the first reason below.</p>
        )}
      </div>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!next.trim()) return;
          patchDraft({ reasons: [...draft.reasons, next.trim()], reasonsOverride: true });
          setNext("");
        }}
      >
        <input
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="e.g. Beautiful balance of type and whitespace"
        />
        <Button variant="secondary" type="submit">
          <Plus size={15} /> Add reason
        </Button>
      </form>
      {draft.reasonsOverride && draft.reasons.length === 0 && (
        <p className="field__hint">
          This intentionally replaces AI suggestions with an empty list.
        </p>
      )}
    </section>
  );
}

function TagsSection({ item }: { item: LibraryItemDetail }) {
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.detail(item.id) });
  const add = useMutation({
    mutationFn: (label: string) => api.addTag(item.id, label),
    onSuccess: () => {
      setTag("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (tagId: string) => api.removeTag(item.id, tagId),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (tagId: string) => api.dismissAiTag(item.id, tagId),
    onSuccess: refresh,
  });
  const aiTags = item.activeAnalysis?.tags.filter((entry) => !entry.dismissed) ?? [];
  return (
    <section className="editor-section">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Find it again</span>
          <h2>Tags</h2>
        </div>
      </div>
      <div className="tag-group">
        <span className="tag-group__label">Yours</span>
        <div className="tags">
          {item.user.tags.map((entry) => (
            <span className="tag tag--user" key={entry.id}>
              {entry.displayLabel}
              <button
                aria-label={`Remove ${entry.displayLabel}`}
                onClick={() => remove.mutate(entry.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {item.user.tags.length === 0 && <span className="muted">No personal tags yet</span>}
        </div>
      </div>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) add.mutate(tag.trim());
        }}
      >
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag…" />
        <Button variant="secondary" type="submit" disabled={add.isPending}>
          <Tag size={15} /> Add
        </Button>
      </form>
      {aiTags.length > 0 && (
        <div className="tag-group">
          <span className="tag-group__label">
            <Sparkles size={12} /> Suggested by AI
          </span>
          <div className="tags">
            {aiTags.map((entry) => (
              <span className="tag tag--ai" key={entry.id}>
                {entry.displayLabel}
                <button
                  aria-label={`Dismiss ${entry.displayLabel}`}
                  onClick={() => dismiss.mutate(entry.id)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AiSection({ item }: { item: LibraryItemDetail }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.detail(item.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot });
  };
  const retry = useMutation({ mutationFn: () => api.retryAnalysis(item.id), onSuccess: refresh });
  const reanalyse = useMutation({ mutationFn: () => api.reanalyse(item.id), onSuccess: refresh });
  const result = item.activeAnalysis?.result;
  const facets = useMemo(
    () =>
      result
        ? ([
            ["Domains", result.domains],
            ["Styles", result.styles],
            ["Colours", result.colours],
            ["Moods", result.moods],
            ["Subjects", result.subjects],
            ["Typography", result.typography],
            ["Composition", result.composition],
            ["Use cases", result.useCases],
          ] as const)
        : [],
    [result],
  );
  return (
    <section className="editor-section ai-section">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Visual understanding</span>
          <h2>AI analysis</h2>
        </div>
        <StatusBadge status={item.processing.status} />
      </div>
      {item.processing.status === "disabled" && (
        <p className="ai-message">
          AI is not configured. Everything else in your library remains fully usable.
        </p>
      )}
      {["pending", "processing"].includes(item.processing.status) && (
        <p className="ai-message">
          <Sparkles size={16} />{" "}
          {result
            ? "A fresh analysis is underway. Your previous result stays visible."
            : "Looking closely at composition, intent, and visual character…"}
        </p>
      )}
      {item.processing.status === "failed" && (
        <div className="ai-error">
          <p>
            {item.processing.lastError || "Analysis could not be completed."}
            {result && " Your previous analysis is still intact."}
          </p>
          {item.processing.canRetry && (
            <Button variant="secondary" onClick={() => retry.mutate()} disabled={retry.isPending}>
              <RefreshCw size={15} /> Retry
            </Button>
          )}
        </div>
      )}
      {result && (
        <>
          <div className="ai-prose">
            <strong>{result.title || "Untitled analysis"}</strong>
            <p>{result.description || "No description was returned."}</p>
          </div>
          <div className="facet-grid">
            {facets
              .filter(([, values]) => values.length > 0)
              .map(([label, values]) => (
                <div className="facet" key={label}>
                  <span>{label}</span>
                  <p>{values.join(" · ")}</p>
                </div>
              ))}
          </div>
          <div className="analysis-meta">
            <span>
              {item.activeAnalysis?.providerId}
              {item.activeAnalysis?.model ? ` · ${item.activeAnalysis.model}` : ""}
            </span>
            {result.confidence !== undefined && (
              <span>Confidence hint {Math.round(result.confidence * 100)}%</span>
            )}
          </div>
        </>
      )}
      {item.processing.canReanalyse && (
        <Button
          variant="ghost"
          onClick={() => reanalyse.mutate()}
          disabled={reanalyse.isPending || item.processing.status === "processing"}
        >
          <RefreshCw size={15} /> Analyse again
        </Button>
      )}
    </section>
  );
}

function CollectionsPicker({ item }: { item: LibraryItemDetail }) {
  const queryClient = useQueryClient();
  const collections = useQuery({ queryKey: queryKeys.collections, queryFn: api.listCollections });
  const current = new Set(item.collections.map((collection) => collection.id));
  const mutation = useMutation({
    mutationFn: ({ collectionId, add }: { collectionId: string; add: boolean }) =>
      add
        ? api.addToCollection(collectionId, item.id)
        : api.removeFromCollection(collectionId, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.detail(item.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
  return (
    <section className="editor-section">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Curate</span>
          <h2>Collections</h2>
        </div>
        <Link className="text-action" to="/collections">
          Manage
        </Link>
      </div>
      {collections.isLoading && <p className="muted">Loading collections…</p>}
      {collections.data?.length === 0 && (
        <p className="muted">Create a collection to gather related references.</p>
      )}
      <div className="collection-checks">
        {collections.data?.map((collection) => (
          <label key={collection.id}>
            <input
              type="checkbox"
              checked={current.has(collection.id)}
              onChange={(e) =>
                mutation.mutate({ collectionId: collection.id, add: e.target.checked })
              }
            />
            <span>{collection.name}</span>
            <small>{collection.imageCount}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

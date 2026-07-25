import type { BatchUploadResponse, LibraryItemSummary } from "@mosaiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Heart,
  ImageOff,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, mediaUrl, queryKeys, type LibraryParams } from "../lib/api";
import { Button, EmptyState, ErrorState, LoadingState, Modal, StatusBadge } from "../components/ui";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 25 * 1024 * 1024;

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") || "1");
  const q = searchParams.get("q") || "";
  const [search, setSearch] = useState(q);
  const params: LibraryParams = {
    page,
    pageSize: 30,
    q,
    sort: searchParams.get("sort") || "newest",
    ...(searchParams.get("favourite") === "true" ? { favourite: true } : {}),
    ...(searchParams.has("reviewed") ? { reviewed: searchParams.get("reviewed") === "true" } : {}),
    ...(searchParams.get("status") ? { processingStatus: searchParams.get("status")! } : {}),
  };
  const query = useQuery({
    queryKey: queryKeys.library(params),
    queryFn: () => api.listLibrary(params),
    refetchInterval: ({ state }) => {
      const data = state.data;
      return data?.items.some((item) => ["pending", "processing"].includes(item.processingStatus))
        ? 2500
        : false;
    },
  });

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!("page" in patch)) next.delete("page");
    setSearchParams(next);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    patchParams({ q: search.trim() || null });
  }

  return (
    <div className="page page--library">
      <header className="page-heading library-heading">
        <div>
          <span className="eyebrow">Your visual memory</span>
          <h1>The library</h1>
          <p>Ideas worth returning to, understood and kept close.</p>
        </div>
        <UploadDropzone compact />
      </header>

      <section className="library-toolbar" aria-label="Library controls">
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles, notes, tags, reasons…"
            aria-label="Search library"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                patchParams({ q: null });
              }}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <select
          aria-label="Sort library"
          value={params.sort}
          onChange={(e) => patchParams({ sort: e.target.value })}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <select
          aria-label="Review filter"
          value={searchParams.get("reviewed") ?? ""}
          onChange={(e) => patchParams({ reviewed: e.target.value || null })}
        >
          <option value="">All references</option>
          <option value="false">Needs review</option>
          <option value="true">Reviewed</option>
        </select>
        <button
          className={`filter-chip ${params.favourite ? "filter-chip--active" : ""}`}
          onClick={() => patchParams({ favourite: params.favourite ? null : "true" })}
        >
          <Heart size={15} fill={params.favourite ? "currentColor" : "none"} /> Favourites
        </button>
      </section>

      {query.isLoading && <GallerySkeleton />}
      {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
      {query.data &&
        query.data.items.length === 0 &&
        (q || searchParams.size > 1 ? (
          <EmptyState
            title="No references found"
            description="Try a different phrase or clear the current filters."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setSearchParams({});
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Begin with an image"
            description="Drop in a few references. They’ll appear here immediately, even while AI is thinking."
            action={<UploadDropzone compact />}
          />
        ))}
      {query.data && query.data.items.length > 0 && (
        <>
          <div className="gallery-meta">
            <span>{query.data.total} references</span>
            {q && <span>Matching “{q}”</span>}
          </div>
          <LibraryGrid items={query.data.items} />
          <Pagination
            page={query.data.page}
            hasNext={query.data.hasNextPage}
            onPage={(next) => patchParams({ page: String(next) })}
          />
        </>
      )}
    </div>
  );
}

export function LibraryGrid({
  items,
  removeFromCollection,
}: {
  items: LibraryItemSummary[];
  removeFromCollection?: (itemId: string) => void;
}) {
  return (
    <div className="image-grid">
      {items.map((item) => (
        <article className="image-card" key={item.id}>
          <Link className="image-card__link" to={`/library/${item.id}`}>
            <div
              className="image-card__visual"
              style={{ aspectRatio: `${item.width}/${item.height}` }}
            >
              <img src={mediaUrl(item.thumbnailUrl)} alt="" loading="lazy" />
              <div className="image-card__badges">
                {item.favourite && (
                  <span className="round-badge" title="Favourite">
                    <Heart size={14} fill="currentColor" />
                  </span>
                )}
                <StatusBadge status={item.processingStatus} />
              </div>
              {item.reviewed && (
                <span className="reviewed-badge">
                  <Check size={13} /> Reviewed
                </span>
              )}
            </div>
            <div className="image-card__caption">
              <strong>{item.resolvedTitle || item.originalFilename}</strong>
              <span>
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </Link>
          {removeFromCollection && (
            <button className="image-card__remove" onClick={() => removeFromCollection(item.id)}>
              Remove
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const mutation = useMutation({
    mutationFn: api.upload,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot });
    },
  });

  function select(files: File[]) {
    const valid: File[] = [];
    const errors: string[] = [];
    files.forEach((file) => {
      if (!ACCEPTED.includes(file.type)) errors.push(`${file.name}: use JPEG, PNG, or WebP`);
      else if (file.size > MAX_SIZE) errors.push(`${file.name}: larger than 25 MB`);
      else valid.push(file);
    });
    setLocalErrors(errors);
    if (valid.length) mutation.mutate(valid);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    select(Array.from(event.dataTransfer.files));
  }

  const trigger = compact ? (
    <Button onClick={() => setOpen(true)}>
      <Upload size={17} /> Import images
    </Button>
  ) : null;

  return (
    <>
      {trigger}
      {open && (
        <Modal title="Bring in inspiration" onClose={() => !mutation.isPending && setOpen(false)}>
          <div
            className={`dropzone ${dragging ? "dropzone--active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <CloudUpload size={34} />
            <h3>Drop images here</h3>
            <p>JPEG, PNG or WebP · up to 25 MB each</p>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => input.current?.click()}
            >
              Choose files
            </Button>
            <input
              ref={input}
              hidden
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => select(Array.from(event.target.files || []))}
            />
          </div>
          {mutation.isPending && <LoadingState label="Saving originals and making thumbnails…" />}
          {localErrors.length > 0 && <UploadMessages messages={localErrors} tone="error" />}
          {mutation.isError && <ErrorState error={mutation.error} />}
          {mutation.data && <UploadResults data={mutation.data} />}
        </Modal>
      )}
    </>
  );
}

function UploadResults({ data }: { data: BatchUploadResponse }) {
  return (
    <div className="upload-results" aria-live="polite">
      <h3>Import summary</h3>
      {data.results.map((result, index) => (
        <div
          className={`upload-result upload-result--${result.status}`}
          key={`${result.filename}-${index}`}
        >
          {result.status === "rejected" ? (
            <ImageOff size={17} />
          ) : result.status === "duplicate" ? (
            <Sparkles size={17} />
          ) : (
            <Check size={17} />
          )}
          <span>
            <strong>{result.filename}</strong>
            {result.status === "rejected"
              ? result.message
              : result.status === "duplicate"
                ? "Already in your library"
                : result.status === "restored"
                  ? "Restored to your library"
                  : "Imported and queued"}
          </span>
          {result.status === "duplicate" && (
            <Link to={`/library/${result.existingItem.id}`}>Open</Link>
          )}
          {(result.status === "created" || result.status === "restored") && (
            <Link to={`/library/${result.libraryItem.id}`}>Open</Link>
          )}
        </div>
      ))}
    </div>
  );
}

function UploadMessages({ messages, tone }: { messages: string[]; tone: string }) {
  return (
    <div className={`upload-messages upload-messages--${tone}`}>
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}

function Pagination({
  page,
  hasNext,
  onPage,
}: {
  page: number;
  hasNext: boolean;
  onPage: (page: number) => void;
}) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="pagination" aria-label="Library pages">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={17} /> Previous
      </Button>
      <span>Page {page}</span>
      <Button variant="ghost" disabled={!hasNext} onClick={() => onPage(page + 1)}>
        Next <ChevronRight size={17} />
      </Button>
    </nav>
  );
}

function GallerySkeleton() {
  return (
    <div className="image-grid" aria-label="Loading library">
      {Array.from({ length: 10 }, (_, index) => (
        <div className="image-card image-card--skeleton" key={index}>
          <div />
        </div>
      ))}
    </div>
  );
}

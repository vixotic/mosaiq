import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FolderHeart, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  TextInput,
} from "../components/ui";
import { api, mediaUrl, queryKeys } from "../lib/api";
import { LibraryGrid } from "./library";

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(
    null,
  );
  const query = useQuery({ queryKey: queryKeys.collections, queryFn: api.listCollections });
  const create = useMutation({
    mutationFn: (input: { name: string; description: string | null }) =>
      api.createCollection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
      setEditing(null);
    },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; name: string; description: string | null }) =>
      api.updateCollection(input.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
  });

  return (
    <div className="page">
      <header className="page-heading page-heading--row">
        <div>
          <span className="eyebrow">Curated threads</span>
          <h1>Collections</h1>
          <p>Gather references that speak to the same idea.</p>
        </div>
        <Button onClick={() => setEditing({ name: "", description: "" })}>
          <Plus size={17} /> New collection
        </Button>
      </header>
      {query.isLoading && <LoadingState label="Gathering your collections…" />}
      {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <EmptyState
          title="Make your first collection"
          description="Create a home for a visual direction, project mood, or recurring motif."
          action={
            <Button onClick={() => setEditing({ name: "", description: "" })}>
              Create collection
            </Button>
          }
        />
      )}
      {query.data && query.data.length > 0 && (
        <div className="collection-grid">
          {query.data.map((collection, index) => (
            <article className="collection-card" key={collection.id}>
              <Link to={`/collections/${collection.id}`} className="collection-card__cover">
                {collection.coverThumbnailUrl ? (
                  <img src={mediaUrl(collection.coverThumbnailUrl)} alt="" />
                ) : (
                  <div className={`collection-placeholder collection-placeholder--${index % 4}`}>
                    <FolderHeart size={28} />
                  </div>
                )}
                <span>
                  {collection.imageCount} {collection.imageCount === 1 ? "image" : "images"}
                </span>
              </Link>
              <div className="collection-card__body">
                <div>
                  <h2>
                    <Link to={`/collections/${collection.id}`}>{collection.name}</Link>
                  </h2>
                  <p>{collection.description || "A growing visual thread."}</p>
                </div>
                <div className="collection-card__actions">
                  <button
                    aria-label={`Edit ${collection.name}`}
                    onClick={() =>
                      setEditing({
                        id: collection.id,
                        name: collection.name,
                        description: collection.description || "",
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Delete ${collection.name}`}
                    onClick={() =>
                      confirm(`Delete “${collection.name}”? Images will remain in your library.`) &&
                      remove.mutate(collection.id)
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <CollectionModal
          draft={editing}
          pending={create.isPending || update.isPending}
          error={create.error || update.error}
          onClose={() => setEditing(null)}
          onSubmit={(value) =>
            editing.id ? update.mutate({ id: editing.id, ...value }) : create.mutate(value)
          }
        />
      )}
    </div>
  );
}

function CollectionModal({
  draft,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  draft: { name: string; description: string };
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (value: { name: string; description: string | null }) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  return (
    <Modal title={draft.name ? "Edit collection" : "New collection"} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit({ name: name.trim(), description: description.trim() || null });
        }}
      >
        <Field label="Name">
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dark editorial websites"
          />
        </Field>
        <Field label="Description">
          <textarea
            className="textarea"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What connects these references?"
          />
        </Field>
        {Boolean(error) && (
          <p className="form-error">
            {error instanceof Error ? error.message : "Could not save collection."}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || pending}>
            {pending ? "Saving…" : "Save collection"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CollectionDetailPage() {
  const { collectionId = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || "1");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.collection(collectionId, page),
    queryFn: () => api.getCollection(collectionId, page),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => api.removeFromCollection(collectionId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });

  if (query.isLoading)
    return (
      <div className="page">
        <LoadingState label="Opening collection…" />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <ErrorState error={query.error} retry={() => query.refetch()} />
      </div>
    );
  const collection = query.data;
  if (!collection) return null;
  return (
    <div className="page page--library">
      <header className="page-heading collection-detail-heading">
        <button className="back-link" onClick={() => navigate("/collections")}>
          <ArrowLeft size={17} /> Collections
        </button>
        <span className="eyebrow">{collection.imageCount} references</span>
        <h1>{collection.name}</h1>
        <p>{collection.description || "A curated visual thread."}</p>
      </header>
      {collection.items.items.length === 0 ? (
        <EmptyState
          title="This collection is ready"
          description="Open any library item to add it here."
          action={<Button onClick={() => navigate("/library")}>Browse library</Button>}
        />
      ) : (
        <>
          <LibraryGrid
            items={collection.items.items}
            removeFromCollection={(id) => remove.mutate(id)}
          />
          {(page > 1 || collection.items.hasNextPage) && (
            <div className="pagination">
              <Button
                variant="ghost"
                disabled={page === 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={!collection.items.hasNextPage}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

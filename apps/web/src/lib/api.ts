import {
  batchUploadResponseSchema,
  libraryItemDetailSchema,
  libraryItemSummarySchema,
  pageResponseSchema,
  settingsStatusSchema,
  type BatchUploadResponse,
  type CollectionSummary,
  type LibraryItemDetail,
  type LibraryItemSummary,
  type SettingsStatus,
  type UpdateLibraryItemInput,
} from "@mosaiq/shared";

const API_ROOT = (import.meta.env.VITE_API_URL || "http://127.0.0.1:3001/api").replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiRequestError(
      message || `Request failed (${response.status})`,
      response.status,
      body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function mediaUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const origin = new URL(API_ROOT).origin;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type LibraryParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  favourite?: boolean;
  reviewed?: boolean;
  processingStatus?: string;
  collectionId?: string;
};

function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export type CollectionDetail = CollectionSummary & {
  items: {
    items: LibraryItemSummary[];
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
};

export const api = {
  async listLibrary(params: LibraryParams) {
    const path = params.q ? "/search" : "/library-items";
    const data = await request<unknown>(
      `${path}${queryString({
        ...params,
        sort: undefined,
        direction: params.sort === "oldest" ? "asc" : "desc",
      })}`,
    );
    return pageResponseSchema(libraryItemSummarySchema).parse(data);
  },

  async getLibraryItem(id: string): Promise<LibraryItemDetail> {
    return libraryItemDetailSchema.parse(await request(`/library-items/${id}`));
  },

  async updateLibraryItem(id: string, input: UpdateLibraryItemInput): Promise<LibraryItemDetail> {
    return libraryItemDetailSchema.parse(
      await request(`/library-items/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    );
  },

  deleteLibraryItem(id: string) {
    return request<void>(`/library-items/${id}`, { method: "DELETE" });
  },

  async upload(files: File[]): Promise<BatchUploadResponse> {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return batchUploadResponseSchema.parse(
      await request("/uploads", { method: "POST", body: form }),
    );
  },

  addTag(id: string, label: string) {
    return request<LibraryItemDetail>(`/library-items/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
  },

  removeTag(id: string, tagId: string) {
    return request<void>(`/library-items/${id}/tags/${tagId}`, { method: "DELETE" });
  },

  dismissAiTag(id: string, tagId: string) {
    return request<void>(`/library-items/${id}/ai-tags/${tagId}`, {
      method: "PATCH",
      body: JSON.stringify({ dismissed: true }),
    });
  },

  retryAnalysis(id: string) {
    return request<void>(`/library-items/${id}/retry-analysis`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  reanalyse(id: string) {
    return request<void>(`/library-items/${id}/reanalyse`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listCollections() {
    return request<CollectionSummary[]>("/collections");
  },

  async getCollection(id: string, page = 1): Promise<CollectionDetail> {
    const [collections, items] = await Promise.all([
      request<CollectionSummary[]>("/collections"),
      request<CollectionDetail["items"]>(
        `/collections/${id}/items${queryString({ page, pageSize: 30 })}`,
      ),
    ]);
    const collection = collections.find((entry) => entry.id === id);
    if (!collection) throw new ApiRequestError("Collection not found.", 404, "NOT_FOUND");
    return { ...collection, items };
  },

  createCollection(input: { name: string; description?: string | null }) {
    return request<CollectionSummary>("/collections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateCollection(id: string, input: { name?: string; description?: string | null }) {
    return request<CollectionSummary>(`/collections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteCollection(id: string) {
    return request<void>(`/collections/${id}`, { method: "DELETE" });
  },

  addToCollection(collectionId: string, itemId: string) {
    return request<void>(`/collections/${collectionId}/items`, {
      method: "POST",
      body: JSON.stringify({ libraryItemIds: [itemId] }),
    });
  },

  removeFromCollection(collectionId: string, itemId: string) {
    return request<void>(`/collections/${collectionId}/items/${itemId}`, { method: "DELETE" });
  },

  async getSettings(): Promise<SettingsStatus> {
    return settingsStatusSchema.parse(await request("/settings/status"));
  },
};

export const queryKeys = {
  library: (params: LibraryParams) => ["library", params] as const,
  libraryRoot: ["library"] as const,
  detail: (id: string) => ["library-item", id] as const,
  collections: ["collections"] as const,
  collection: (id: string, page: number) => ["collection", id, page] as const,
  settings: ["settings"] as const,
};

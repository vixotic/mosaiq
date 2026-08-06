# How Mosaiq works

Mosaiq keeps two things together without confusing them: the image files themselves and everything
that makes those images useful later.

## Private owner access

Mosaiq opens to one configured owner account. A successful login creates an opaque session whose
hash, expiry, and revocation state live in PostgreSQL; the browser receives only a protected
session cookie. Every library, media, metadata, settings, upload, and processing route is private.
State-changing requests must also come from the configured web origin.

There is deliberately no registration or account administration surface. See
[Private owner access](./authentication.md) for setup and operational details.

## A reference enters the library

When an image is imported, Mosaiq:

1. checks that the file is a supported image;
2. calculates a SHA-256 fingerprint to catch exact duplicates;
3. stores the original beneath the configured storage directory;
4. creates a lightweight WebP thumbnail;
5. adds a persistent analysis job; and
6. makes the image available in the library immediately.

Image processing is deliberately modest. Originals are not rewritten, thumbnails can be recreated,
and temporary analysis images are removed after use.

## Personal notes and AI observations remain separate

An analyzer can suggest a title, description, tags, colours, moods, styles, objects, layout
patterns, and reasons a reference may be worth saving. Every analysis is retained as a historical
run.

Personal edits live separately. A handwritten title, description, note, or tag takes precedence
over an AI suggestion and is never overwritten by reanalysis. If a new analysis fails, the most
recent successful result remains active.

## Image storage, relationships in PostgreSQL

Originals and thumbnails can stay on the local filesystem or in a private OCI Object Storage
bucket. PostgreSQL stores metadata, tags, collections, processing jobs, and analysis history.
Mosaiq uses the same opaque storage keys in either mode, and the browser never receives filesystem
paths or cloud credentials.

The upload path is defensive: originals and thumbnails are persisted before their database record
is committed, and partial writes are cleaned up when an operation fails.

## A small background worker

Analysis jobs live in PostgreSQL, so stopping the application does not lose the queue. A single
worker claims pending jobs, records attempts, retries transient failures, and recovers jobs left in
a processing state after an interrupted run. This keeps the personal setup simple and avoids
requiring Redis or another service.

## Replaceable visual analyzers

Gemini, Ollama, and the mock analyzer implement the same internal contract. Provider output is
validated before it reaches the library. Partial model responses are normalized where possible;
malformed or failed responses are recorded without damaging existing metadata.

## Searching the library

Search combines ordinary PostgreSQL text matching with relational filters for tags and collections.
The API contract does not depend on a particular search implementation, leaving room for richer
semantic or visual similarity later without changing how the rest of the application uses search.

## Smart categories

The Smart categories view turns the active AI analysis into a living browse layer. It groups
references by subject/domain, visual style, mood, and likely use case, then links each group back to
the matching library search. Categories update as analyses complete and do not create, move, or
overwrite the user's manual collections.

## Project layout

```text
apps/
  api/       NestJS API, storage, processing, and provider adapters
  web/       React interface
packages/
  database/  Drizzle schema and migrations
  shared/    Validated contracts shared by the API and web app
```

The browser never imports the database package. API responses are mapped through explicit shared
contracts, keeping persistence details and storage paths out of the frontend.

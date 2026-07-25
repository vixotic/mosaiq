# How Mosaiq works

Mosaiq keeps two things together without confusing them: the image files themselves and everything
that makes those images useful later.

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

## Files on disk, relationships in PostgreSQL

Originals and thumbnails stay on the filesystem. PostgreSQL stores metadata, tags, collections,
processing jobs, and analysis history. Mosaiq uses opaque storage keys in its API rather than
revealing machine-specific filesystem paths.

The upload path is defensive: files are written to a controlled temporary location, moved to their
final key, and cleaned up when a database operation fails.

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

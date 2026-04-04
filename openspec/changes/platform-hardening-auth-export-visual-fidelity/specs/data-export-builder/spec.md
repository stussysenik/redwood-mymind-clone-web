## Capability: data-export-builder

Server-side export endpoint with category toggles, multiple formats, and bundled media assets in a self-contained zip archive. Matches the mymind export pattern: `cards.csv` + all media files named by card ID.

## Behavior

### Export Builder UI (Settings → Data)
Replaces the disabled "Export All Data (Coming Soon)" button with a full builder:

**Step 1 — Category Toggles:**
| Category | Fields Included | Default |
|----------|----------------|---------|
| Core | id, type, title, url, tags, createdAt, updatedAt | ON |
| Content | content (notes/extracted text), scrapedTitle, scrapedDescription | ON |
| Media | Images, videos, PDFs downloaded and bundled as files | OFF |
| Metadata | colors, engagement, platform, author, embeddings, extractionMetrics | OFF |

Each category is a toggle card with a brief description and field list preview.

**Step 2 — Format Selection:**
| Format | Extension | Best For |
|--------|-----------|----------|
| CSV | `.csv` | Spreadsheets, simple import |
| JSON | `.json` | Full fidelity, programmatic use |
| JSONL | `.jsonl` | Streaming, data science pipelines |
| Markdown | `.md` | Human-readable, Obsidian/Notion import |

Radio select, one format at a time. Default: JSON.

**Step 3 — Scope Filter (optional):**
- All cards (default)
- Current space only
- Specific tag filter
- Date range
- Exclude archived / Include trash

**Step 4 — Preview & Download:**
- Shows estimated file count and size.
- "Export" button triggers server-side generation.
- Progress bar during generation.
- Download link when ready (served from a temporary signed URL, expires in 1 hour).

### Media Bundling
When Media category is ON:
- For each card with `imageUrl`, download the image and include as `{cardId}.{ext}` in the zip.
- For cards with `metadata.images[]` (carousels), include as `{cardId}_1.{ext}`, `{cardId}_2.{ext}`, etc.
- Respect original file format (jpeg, png, webp, gif, mov, pdf).
- Media subfolder: `media/` inside the zip.
- Structured data file at root: `cards.{format}`.

### Zip Structure (mymind-compatible)
```
export-2026-04-04/
├── cards.json          (or .csv / .jsonl / .md)
├── media/
│   ├── abc123.jpeg
│   ├── def456.png
│   ├── ghi789_1.jpeg   (carousel image 1)
│   ├── ghi789_2.jpeg   (carousel image 2)
│   └── ...
└── manifest.json       (export metadata: date, categories, format, card count)
```

### CSV Format (mymind-compatible columns)
```
id,type,title,url,content,note,tags,created
```
Column mapping from BYOA Card model:
- `id` → `card.id`
- `type` → `card.type`
- `title` → `card.title`
- `url` → `card.url`
- `content` → `card.content` (extracted text / body)
- `note` → `card.metadata.scrapedDescription` or `card.content` if no description (user's personal note context)
- `tags` → `card.tags.join(',')` (comma-separated within field, matching mymind format)
- `created` → `card.createdAt` in ISO 8601 (e.g., `2023-02-14T04:25:27Z`)

When Content category is OFF, `content` and `note` columns are empty strings. Matches the mymind export schema discovered in `/Users/s3nik/Downloads/mymind-original-exports/mymind/cards.csv`.

## Data Model

No new Prisma models. Uses existing `Card` model.

New GraphQL types:

```graphql
input ExportOptions {
  categories: [ExportCategory!]!    # CORE, CONTENT, MEDIA, METADATA
  format: ExportFormat!             # CSV, JSON, JSONL, MARKDOWN
  spaceId: String
  tag: String                     # Exact match against card.tags array (case-insensitive, normalized)
  dateFrom: DateTime
  dateTo: DateTime
  includeArchived: Boolean
  includeTrash: Boolean
}

enum ExportCategory { CORE, CONTENT, MEDIA, METADATA }
enum ExportFormat { CSV, JSON, JSONL, MARKDOWN }

type ExportJob {
  jobId: String!
  status: ExportStatus!
  progress: Int               # 0-100 percentage
  downloadUrl: String
  fileCount: Int
  totalSize: Int
  expiresAt: DateTime
  error: String
}

enum ExportStatus { QUEUED, PROCESSING, COMPLETE, FAILED }

type Mutation {
  startExport(options: ExportOptions!): ExportJob! @requireAuth
}

type Query {
  exportJob(jobId: String!): ExportJob @requireAuth
}
```

The export runs asynchronously:
1. `startExport` mutation creates a job record and returns immediately with `jobId` + `QUEUED` status.
2. A background process (spawned via `setTimeout` / `setImmediate` in the service, or a dedicated worker if scale demands) runs the export pipeline.
3. Frontend polls `exportJob(jobId)` every 2 seconds to update the progress bar.
4. On `COMPLETE`, the `downloadUrl` is a signed Supabase Storage URL (1-hour expiry).
5. On `FAILED`, the `error` field contains a human-readable message.

## API Implementation

- `api/src/services/export/export.ts` — main export orchestrator:
  1. Query all matching cards (paginated, streamed).
  2. Serialize to chosen format with chosen categories.
  3. If Media is ON, download images via server-side fetch (no CORS issues).
  4. Bundle into zip using `archiver` package.
  5. Upload zip to Supabase Storage (temp bucket, 1hr expiry) or serve directly.
  6. Return signed download URL.

## Dependencies

- `archiver@^7` (API side — zip generation)

## Files Changed

| File | Change |
|------|--------|
| `api/src/graphql/export.sdl.ts` | New — ExportOptions input, ExportResult type, exportCards mutation |
| `api/src/services/export/export.ts` | New — export orchestration, format serializers, media downloader |
| `api/src/services/export/formats/csv.ts` | New — CSV serializer (mymind-compatible) |
| `api/src/services/export/formats/json.ts` | New — JSON/JSONL serializer |
| `api/src/services/export/formats/markdown.ts` | New — Markdown serializer |
| `web/src/pages/SettingsPage/SettingsPage.tsx` | Replace disabled export button with builder UI |
| `web/src/components/ExportBuilder/ExportBuilder.tsx` | New — category toggles, format selector, preview, progress |

## Acceptance Criteria

- [ ] Export with Core+Content categories in CSV format produces a file matching mymind's `cards.csv` schema.
- [ ] Export with Media ON downloads and bundles all card images into `media/` folder.
- [ ] Carousel images are numbered (`_1`, `_2`, etc.).
- [ ] Export with Metadata ON includes colors, engagement, platform, author, embeddings.
- [ ] JSON format preserves full type fidelity (arrays, nested objects).
- [ ] JSONL format produces one card per line.
- [ ] Markdown format produces human-readable cards with frontmatter (title, url, tags) and body (content).
- [ ] Zip includes `manifest.json` with export metadata.
- [ ] Download URL expires after 1 hour.
- [ ] Progress indicator shows during generation.
- [ ] Export of 1,922 cards with media completes without timeout (10-minute max).

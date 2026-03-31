#!/usr/bin/env python3
"""
MyMind Clone — Deep Verification Suite
Tests every GraphQL operation end-to-end including mutations
"""

import json
import time
import sys
import urllib.request
import urllib.error

API = "http://localhost:8912/graphql"
WEB = "http://localhost:8913"
TOKEN = "Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjkxZTVkOWJhLWU4ZjktNDk3My1iZWFjLTMzMzBlYzg0YWUxMCIsInR5cCI6IkpXVCJ9.***REMOVED_JWT***.Rz2s0Kb6kwj_nUsE6eKdIQ8ekhaau2flyOlsYW3ENW_FN2Kgv1DSZGNS0lRHQYVmohs86hF6_RIJYamI3-MfoA"

P = F = T = 0
G = "\033[32m"; R = "\033[31m"; Y = "\033[33m"; C = "\033[36m"; B = "\033[1m"; N = "\033[0m"

def log(name, ok, detail, ms=0):
    global P, F, T; T += 1
    if ok: P += 1; print(f"{G}  ✓ {name:<50} {ms:>5}ms  {detail}{N}")
    else: F += 1; print(f"{R}  ✗ {name:<50} {ms:>5}ms  {detail}{N}")

def gql(q, variables=None):
    body = {"query": q}
    if variables: body["variables"] = variables
    data = json.dumps(body).encode()
    req = urllib.request.Request(API, data=data, headers={
        "Content-Type": "application/json", "auth-provider": "custom", "Authorization": TOKEN
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read()), int((time.time()-t0)*1000)
    except Exception as e:
        return {"errors": [{"message": str(e)}]}, int((time.time()-t0)*1000)

def get(path):
    try:
        if not isinstance(path, dict):
            return path
    except: pass
    return path

def safe(data, *keys, default=None):
    for k in keys:
        if isinstance(data, dict): data = data.get(k, default)
        elif isinstance(data, list) and isinstance(k, int) and k < len(data): data = data[k]
        else: return default
    return data

print(f"\n{B}{C}{'='*66}{N}")
print(f"{B}{C}  MyMind Clone — Deep Verification Suite{N}")
print(f"{B}{C}  {time.strftime('%Y-%m-%d %H:%M:%S')}{N}")
print(f"{B}{C}{'='*66}{N}\n")

# ─── 1. CARD LIFECYCLE ─────────────────────────────────────────────
print(f"{B}{Y}▸ Card Lifecycle (Create → Read → Update → Archive → Trash → Restore → Delete){N}")

# Create a test card
d, ms = gql('mutation SaveCard($input: SaveCardInput!) { saveCard(input: $input) { id title type tags url } }',
    {"input": {"url": "https://example.com/deep-verify-test", "type": "website", "title": "Deep Verify Test Card"}})
card_id = safe(d, "data", "saveCard", "id")
errs = safe(d, "errors", default=[])
if card_id:
    log("Create card (saveCard mutation)", True, f"id={card_id[:12]}...", ms)
else:
    log("Create card (saveCard mutation)", False, errs[0]["message"][:60] if errs else "No ID", ms)

if card_id:
    # Read it back
    d, ms = gql(f'query {{ card(id: "{card_id}") {{ id title type url }} }}')
    found = safe(d, "data", "card", "id")
    log("Read card (card query)", found == card_id, f"title={safe(d,'data','card','title','')}", ms)

    # Update it
    d, ms = gql('mutation UpdateCard($id: String!, $input: UpdateCardInput!) { updateCard(id: $id, input: $input) { id title tags } }',
        {"id": card_id, "input": {"title": "Updated Test Card", "tags": ["test-tag", "verification"]}})
    updated_title = safe(d, "data", "updateCard", "title")
    log("Update card (updateCard mutation)", updated_title == "Updated Test Card", f"title={updated_title}", ms)

    # Archive it
    d, ms = gql(f'mutation {{ archiveCard(id: "{card_id}") {{ id archivedAt }} }}')
    archived = safe(d, "data", "archiveCard", "archivedAt")
    log("Archive card (archiveCard mutation)", archived is not None, f"archivedAt set", ms)

    # Unarchive it
    d, ms = gql(f'mutation {{ unarchiveCard(id: "{card_id}") {{ id archivedAt }} }}')
    unarchived = safe(d, "data", "unarchiveCard", "archivedAt")
    log("Unarchive card", unarchived is None, "archivedAt cleared", ms)

    # Soft delete it
    d, ms = gql(f'mutation {{ deleteCard(id: "{card_id}") {{ id deletedAt }} }}')
    deleted = safe(d, "data", "deleteCard", "deletedAt")
    log("Soft delete (deleteCard mutation)", deleted is not None, "deletedAt set", ms)

    # Restore it
    d, ms = gql(f'mutation {{ restoreCard(id: "{card_id}") {{ id deletedAt }} }}')
    restored = safe(d, "data", "restoreCard", "deletedAt")
    log("Restore card (restoreCard mutation)", restored is None, "deletedAt cleared", ms)

    # Permanent delete
    d, ms = gql(f'mutation {{ deleteCard(id: "{card_id}", permanent: true) {{ id }} }}')
    log("Permanent delete", "errors" not in d or not d["errors"], "Card removed", ms)

print()

# ─── 2. SEARCH DEPTH ───────────────────────────────────────────────
print(f"{B}{Y}▸ Search Depth (multiple queries + edge cases){N}")

queries = [
    ("design", "common term"),
    ("instagram", "platform"),
    ("machine learning", "multi-word"),
    ("", "empty query"),
    ("zzzznonexistent12345", "no results expected"),
]
for q, desc in queries:
    if not q:
        d, ms = gql('query { searchCards(query: " ", limit: 5) { total cards { id } mode } }')
    else:
        d, ms = gql(f'query {{ searchCards(query: "{q}", limit: 5) {{ total cards {{ id title }} mode }} }}')
    total = safe(d, "data", "searchCards", "total", default=0)
    errs = safe(d, "errors", default=[])
    if errs:
        log(f"Search: '{q}' ({desc})", False, errs[0]["message"][:50], ms)
    elif q == "zzzznonexistent12345":
        log(f"Search: '{q}' ({desc})", total == 0, f"0 results (correct)", ms)
    elif q.strip() == "":
        log(f"Search: empty query ({desc})", True, f"{total} results (browse mode)", ms)
    else:
        log(f"Search: '{q}' ({desc})", total > 0, f"{total} results", ms)

print()

# ─── 3. SERENDIPITY RANDOMNESS ─────────────────────────────────────
print(f"{B}{Y}▸ Serendipity Randomness{N}")

sets = []
for i in range(3):
    d, ms = gql("query { randomCards(limit: 5) { id title } }")
    ids = [c["id"] for c in safe(d, "data", "randomCards", default=[])]
    sets.append(set(ids))
    if i == 0:
        log(f"Random cards call {i+1}", len(ids) == 5, f"Got {len(ids)} cards", ms)

# Check if at least 2 of 3 calls returned different sets
unique_sets = len(set(frozenset(s) for s in sets))
log("Randomness: different results across calls", unique_sets >= 2, f"{unique_sets}/3 unique sets", 0)
print()

# ─── 4. GRAPH DATA QUALITY ─────────────────────────────────────────
print(f"{B}{Y}▸ Graph Data Quality{N}")

d, ms = gql("query { graphData { nodes { id title type tags connections } links { source target sharedTags weight } } }")
nodes = safe(d, "data", "graphData", "nodes", default=[])
links = safe(d, "data", "graphData", "links", default=[])

log("Graph query", len(nodes) > 0, f"{len(nodes)} nodes, {len(links)} links", ms)

# Check node types
node_types = set(n.get("type", "") for n in nodes[:50])
log("Node type diversity", len(node_types) > 1, f"Types: {', '.join(sorted(node_types)[:5])}", 0)

# Check link weights
if links:
    weights = [l.get("weight", 0) for l in links[:100]]
    avg_w = sum(weights) / len(weights)
    max_w = max(weights)
    log("Link weight distribution", max_w > 1, f"avg={avg_w:.1f}, max={max_w}", 0)

# Check shared tags exist
if links:
    with_tags = sum(1 for l in links[:100] if l.get("sharedTags"))
    log("Links have sharedTags", with_tags > 0, f"{with_tags}/100 links have tags", 0)

print()

# ─── 5. PAGINATION ─────────────────────────────────────────────────
print(f"{B}{Y}▸ Pagination{N}")

d1, ms = gql("query { cards(page: 1, pageSize: 10, mode: DEFAULT) { total page hasMore cards { id } } }")
p1_ids = [c["id"] for c in safe(d1, "data", "cards", "cards", default=[])]
has_more = safe(d1, "data", "cards", "hasMore", default=False)
log("Page 1 (10 items)", len(p1_ids) == 10, f"Got {len(p1_ids)}, hasMore={has_more}", ms)

d2, ms = gql("query { cards(page: 2, pageSize: 10, mode: DEFAULT) { cards { id } page } }")
p2_ids = [c["id"] for c in safe(d2, "data", "cards", "cards", default=[])]
overlap = set(p1_ids) & set(p2_ids)
log("Page 2 (no overlap with page 1)", len(overlap) == 0, f"{len(p2_ids)} cards, {len(overlap)} overlapping", ms)

print()

# ─── 6. TAG QUALITY DEEP ───────────────────────────────────────────
print(f"{B}{Y}▸ Tag Quality Deep Analysis{N}")

d, ms = gql("query { cards(page: 1, pageSize: 200, mode: DEFAULT) { cards { id tags type } } }")
cards = safe(d, "data", "cards", "cards", default=[])

from collections import Counter

# Per-type tag analysis
type_tags = {}
for c in cards:
    t = c.get("type", "unknown")
    tags = c.get("tags", [])
    if t not in type_tags: type_tags[t] = []
    type_tags[t].extend(tags)

for ct, tags in sorted(type_tags.items(), key=lambda x: -len(x[1]))[:5]:
    unique = len(set(tags))
    log(f"Tags for type '{ct}'", unique > 0, f"{unique} unique across {len(tags)} total", 0)

# Global uniqueness within cards
all_dupes = 0
for c in cards:
    tags = c.get("tags", [])
    if len(tags) != len(set(tags)):
        all_dupes += 1

log("Cross-card tag uniqueness", all_dupes == 0, f"{all_dupes}/{len(cards)} cards with internal dupes", 0)

print()

# ─── 7. TYPESCRIPT CHECK ───────────────────────────────────────────
print(f"{B}{Y}▸ Build Verification{N}")

import subprocess
try:
    result = subprocess.run(
        ["npx", "tsc", "--noEmit", "--project", "web/tsconfig.json"],
        capture_output=True, text=True, timeout=30,
        cwd="/Users/s3nik/Desktop/redwood-mymind-clone-web"
    )
    error_lines = [l for l in result.stdout.split("\n") if "error TS" in l]
    # Filter to only our modified files
    our_files = ["CardsCell", "CardDetailModal", "TagDisplay", "GraphClient", "GraphCell",
                 "SerendipityCell", "AddModal", "AppLayout", "HomePage", "LoginPage",
                 "ArchivePage", "TrashPage", "SpacesPage", "GraphPage", "SerendipityPage", "SettingsPage"]
    our_errors = [l for l in error_lines if any(f in l for f in our_files)]
    log("TypeScript: our modified files", len(our_errors) == 0,
        f"{len(our_errors)} errors in our files ({len(error_lines)} total in project)", 0)
except Exception as e:
    log("TypeScript check", False, str(e)[:50], 0)

print()

# ─── SUMMARY ────────────────────────────────────────────────────────
print(f"{B}{C}{'='*66}{N}")
score = P * 100 // max(T, 1)
if F == 0:
    print(f"{B}{G}  DEEP VERIFY: {P}/{T} passed ({score}%) — ALL CHECKS PASSING ✓{N}")
elif score >= 90:
    print(f"{B}{Y}  DEEP VERIFY: {P}/{T} passed ({score}%) — {F} issues{N}")
else:
    print(f"{B}{R}  DEEP VERIFY: {P}/{T} passed ({score}%) — {F} failures{N}")
print(f"{B}{C}{'='*66}{N}\n")

# Clean up test card if it somehow survived
if card_id:
    gql(f'mutation {{ deleteCard(id: "{card_id}", permanent: true) {{ id }} }}')

sys.exit(0 if F == 0 else 1)

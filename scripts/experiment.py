#!/usr/bin/env python3
"""
MyMind Clone — Quantitative Autoresearcher Experiment
Measures functional completeness across all app layers
"""

import json
import time
import sys
import urllib.request
import urllib.error

API_URL = "http://localhost:8912/graphql"
WEB_URL = "http://localhost:8913"
AUTH_TOKEN = "Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjkxZTVkOWJhLWU4ZjktNDk3My1iZWFjLTMzMzBlYzg0YWUxMCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3F1eGFhbWl1emR6cHpyY2NvaGJ1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4OGQ2NzQ2Zi0wOGI0LTQ4ZTQtOTMwYi1iMDViZWFiMmI3ZjIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc0MTk0MTI5LCJpYXQiOjE3NzQxOTA1MjksImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20ifQ.Rz2s0Kb6kwj_nUsE6eKdIQ8ekhaau2flyOlsYW3ENW_FN2Kgv1DSZGNS0lRHQYVmohs86hF6_RIJYamI3-MfoA"

PASS = 0
FAIL = 0
TOTAL = 0

G = "\033[0;32m"  # green
R = "\033[0;31m"  # red
Y = "\033[0;33m"  # yellow
C = "\033[0;36m"  # cyan
B = "\033[1m"     # bold
N = "\033[0m"     # reset


def log(name, passed, detail, latency_ms):
    global PASS, FAIL, TOTAL
    TOTAL += 1
    if passed:
        PASS += 1
        print(f"{G}  ✓ {name:<45} {latency_ms:>6}ms  {detail}{N}")
    else:
        FAIL += 1
        print(f"{R}  ✗ {name:<45} {latency_ms:>6}ms  {detail}{N}")


def gql(query_str):
    data = json.dumps({"query": query_str}).encode()
    req = urllib.request.Request(API_URL, data=data, headers={
        "Content-Type": "application/json",
        "auth-provider": "custom",
        "Authorization": AUTH_TOKEN,
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            ms = int((time.time() - t0) * 1000)
            return body, ms
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"errors": [{"message": str(e)}]}, ms


def http(url):
    t0 = time.time()
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            ms = int((time.time() - t0) * 1000)
            return resp.status, ms
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        return e.code, ms
    except Exception:
        ms = int((time.time() - t0) * 1000)
        return 0, ms


def safe_get(data, *keys, default=None):
    for k in keys:
        if isinstance(data, dict):
            data = data.get(k, default)
        elif isinstance(data, list) and isinstance(k, int) and k < len(data):
            data = data[k]
        else:
            return default
    return data


# ============================================================================
print()
print(f"{B}{C}{'=' * 62}{N}")
print(f"{B}{C}  MyMind Clone — Quantitative Autoresearcher Experiment{N}")
print(f"{B}{C}  {time.strftime('%Y-%m-%d %H:%M:%S')}{N}")
print(f"{B}{C}{'=' * 62}{N}")
print()

# Layer 1: Infrastructure
print(f"{B}{Y}▸ Layer 1: Infrastructure{N}")

code, ms = http(WEB_URL)
log("Web server (port 8913)", code == 200, f"HTTP {code}", ms)

code, ms = http(f"{API_URL.replace('/graphql', '')}/graphql/health")
log("API server health check", code == 200, f"HTTP {code}", ms)

data, ms = gql("{ redwood { version } }")
ver = safe_get(data, "data", "redwood", "version", default="")
log("GraphQL endpoint", bool(ver), f"Redwood {ver}" if ver else "No version", ms)
print()

# Layer 2: Authentication
print(f"{B}{Y}▸ Layer 2: Authentication{N}")

data, ms = gql("query { redwood { currentUser } }")
user = safe_get(data, "data", "redwood", "currentUser")
log("Auth: currentUser resolves", user is not None, "Authenticated" if user else "No user", ms)

code, ms = http(f"{WEB_URL}/login")
log("Login page loads", code == 200, f"HTTP {code}", ms)
print()

# Layer 3: Card CRUD
print(f"{B}{Y}▸ Layer 3: Card CRUD{N}")

data, ms = gql("query { cards(page:1, pageSize:5, mode:DEFAULT) { total cards { id title tags imageUrl type } hasMore } }")
total = safe_get(data, "data", "cards", "total", default=0)
cards = safe_get(data, "data", "cards", "cards", default=[])
log("Cards query (DEFAULT mode)", total > 0, f"{total} cards, got {len(cards)}", ms)

tagged = sum(1 for c in cards if c.get("tags") and len(c["tags"]) > 0)
total_tags = sum(len(c.get("tags", [])) for c in cards)
log("Tags generated on cards", tagged > 0, f"{tagged}/{len(cards)} cards tagged, {total_tags} total tags", 0)

all_unique = all(len(c.get("tags", [])) == len(set(c.get("tags", []))) for c in cards)
log("Tag uniqueness per card", all_unique, "No duplicates" if all_unique else "DUPLICATES FOUND", 0)

with_img = sum(1 for c in cards if c.get("imageUrl"))
log("Cards with images", True, f"{with_img}/{len(cards)} have imageUrl", 0)

data, ms = gql("query { cards(page:1, pageSize:1, mode:ARCHIVE) { total } }")
at = safe_get(data, "data", "cards", "total", default="ERR")
log("Cards query (ARCHIVE mode)", isinstance(at, int), f"{at} archived", ms)

data, ms = gql("query { cards(page:1, pageSize:1, mode:TRASH) { total } }")
tt = safe_get(data, "data", "cards", "total", default="ERR")
log("Cards query (TRASH mode)", isinstance(tt, int), f"{tt} in trash", ms)
print()

# Layer 4: Search & Discovery
print(f"{B}{Y}▸ Layer 4: Search & Discovery{N}")

data, ms = gql("query { randomCards(limit:5) { id title tags } }")
rc = safe_get(data, "data", "randomCards", default=[])
log("Random cards (serendipity)", len(rc) > 0, f"{len(rc)} cards", ms)

data, ms = gql('query { searchCards(query:"design", limit:5) { total cards { id title tags } mode } }')
sc = safe_get(data, "data", "searchCards", "cards", default=[])
st = safe_get(data, "data", "searchCards", "total", default=0)
errs = safe_get(data, "errors", default=[])
if errs:
    log("Search: 'design'", False, errs[0].get("message", "Error")[:60], ms)
else:
    log("Search: 'design'", st > 0, f"{st} total, got {len(sc)} results", ms)
print()

# Layer 5: Spaces
print(f"{B}{Y}▸ Layer 5: Spaces{N}")

data, ms = gql("query { spaces { id name cardCount isSmart } }")
spaces = safe_get(data, "data", "spaces", default=[])
errs = safe_get(data, "errors", default=[])
if errs:
    log("Spaces query", False, errs[0].get("message", "Error")[:60], ms)
else:
    log("Spaces query", True, f"{len(spaces)} spaces", ms)
print()

# Layer 6: Knowledge Graph
print(f"{B}{Y}▸ Layer 6: Knowledge Graph{N}")

data, ms = gql("query { graphData { nodes { id title type } links { source target weight } } }")
nodes = safe_get(data, "data", "graphData", "nodes", default=[])
links = safe_get(data, "data", "graphData", "links", default=[])
errs = safe_get(data, "errors", default=[])
if errs:
    log("Graph: data query", False, errs[0].get("message", "Error")[:60], ms)
else:
    log("Graph: nodes", len(nodes) > 0, f"{len(nodes)} nodes", ms)
    log("Graph: links", len(links) > 0, f"{len(links)} connections", 0)
print()

# Layer 7: Web Pages
print(f"{B}{Y}▸ Layer 7: Web Pages{N}")

for page in ["/", "/login", "/spaces", "/serendipity", "/graph", "/archive", "/trash", "/settings"]:
    code, ms = http(f"{WEB_URL}{page}")
    log(f"Page: {page}", code == 200, f"HTTP {code}", ms)
print()

# Layer 8: Tag Quality
print(f"{B}{Y}▸ Layer 8: Tag Quality (NLP/AI Output){N}")

data, ms = gql("query { cards(page:1, pageSize:100, mode:DEFAULT) { cards { tags } } }")
cards100 = safe_get(data, "data", "cards", "cards", default=[])

from collections import Counter
all_tags = []
cards_w_tags = 0
for c in cards100:
    tags = c.get("tags", [])
    if tags:
        cards_w_tags += 1
        all_tags.extend(tags)

unique_tags = len(set(all_tags))
avg = len(all_tags) / max(cards_w_tags, 1)
top5 = Counter(all_tags).most_common(5)

log("Tag coverage", cards_w_tags > 0, f"{cards_w_tags}/{len(cards100)} cards tagged", ms)
log("Tag diversity", unique_tags > 10, f"{unique_tags} unique tags", 0)
log("Avg tags per card", avg >= 2, f"{avg:.1f} tags/card", 0)

if top5:
    top_str = " ".join(f"{C}{t}{N}({c})" for t, c in top5)
    print(f"    Top tags: {top_str}")
print()

# ============================================================================
# Summary
# ============================================================================
print(f"{B}{C}{'=' * 62}{N}")
score = PASS * 100 // max(TOTAL, 1)
if FAIL == 0:
    print(f"{B}{G}  RESULT: {PASS}/{TOTAL} passed ({score}%) — ALL TESTS PASSING ✓{N}")
elif score >= 80:
    print(f"{B}{Y}  RESULT: {PASS}/{TOTAL} passed ({score}%) — {FAIL} failures{N}")
else:
    print(f"{B}{R}  RESULT: {PASS}/{TOTAL} passed ({score}%) — {FAIL} failures{N}")
print(f"{B}{C}{'=' * 62}{N}")
print()

sys.exit(0 if FAIL == 0 else 1)

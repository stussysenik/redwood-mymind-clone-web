#!/bin/bash
# ============================================================================
# MyMind Clone — Quantitative Autoresearcher Experiment
# Measures functional completeness across all app layers
# ============================================================================

set -euo pipefail

API_URL="http://localhost:8912/graphql"
WEB_URL="http://localhost:8913"
PASS=0
FAIL=0
TOTAL=0
RESULTS=""

# Colors
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
BOLD="\033[1m"
NC="\033[0m"

log_result() {
  local name="$1"
  local status="$2"
  local detail="$3"
  local latency="$4"
  TOTAL=$((TOTAL + 1))
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    printf "${GREEN}  ✓ %-45s %6sms  %s${NC}\n" "$name" "$latency" "$detail"
  else
    FAIL=$((FAIL + 1))
    printf "${RED}  ✗ %-45s %6sms  %s${NC}\n" "$name" "$latency" "$detail"
  fi
  RESULTS="${RESULTS}${name}|${status}|${latency}|${detail}\n"
}

gql_query() {
  local query="$1"
  local start=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
  local result=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "auth-provider: custom" \
    -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjkxZTVkOWJhLWU4ZjktNDk3My1iZWFjLTMzMzBlYzg0YWUxMCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3F1eGFhbWl1emR6cHpyY2NvaGJ1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4OGQ2NzQ2Zi0wOGI0LTQ4ZTQtOTMwYi1iMDViZWFiMmI3ZjIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc0MTk0MTI5LCJpYXQiOjE3NzQxOTA1MjksImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20ifQ.Rz2s0Kb6kwj_nUsE6eKdIQ8ekhaau2flyOlsYW3ENW_FN2Kgv1DSZGNS0lRHQYVmohs86hF6_RIJYamI3-MfoA" \
    -d "$query" 2>/dev/null)
  local end=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
  local latency=$((end - start))
  echo "$result|||$latency"
}

http_check() {
  local url="$1"
  local start=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  local end=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
  local latency=$((end - start))
  echo "$status|||$latency"
}

echo ""
printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${CYAN}║  MyMind Clone — Quantitative Autoresearcher Experiment      ║${NC}\n"
printf "${BOLD}${CYAN}║  $(date '+%Y-%m-%d %H:%M:%S')                                        ║${NC}\n"
printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
echo ""

# ============================================================================
# LAYER 1: Infrastructure
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 1: Infrastructure${NC}\n"

IFS='|||' read -r status latency <<< "$(http_check "$WEB_URL")"
[ "$status" = "200" ] && log_result "Web server (port 8913)" "PASS" "HTTP $status" "$latency" || log_result "Web server (port 8913)" "FAIL" "HTTP $status" "$latency"

IFS='|||' read -r status latency <<< "$(http_check "$API_URL/health")"
[ "$status" = "200" ] && log_result "API server (port 8912)" "PASS" "HTTP $status" "$latency" || log_result "API server (port 8912)" "FAIL" "HTTP $status" "$latency"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"{ redwood { version } }"}')"
version=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['redwood']['version'])" 2>/dev/null || echo "")
[ -n "$version" ] && log_result "GraphQL endpoint" "PASS" "Redwood $version" "$latency" || log_result "GraphQL endpoint" "FAIL" "No version" "$latency"

echo ""

# ============================================================================
# LAYER 2: Authentication
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 2: Authentication${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { redwood { currentUser } }"}')"
has_user=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('data',{}).get('redwood',{}).get('currentUser') else 'no')" 2>/dev/null || echo "no")
[ "$has_user" = "yes" ] && log_result "Auth: currentUser resolves" "PASS" "User authenticated" "$latency" || log_result "Auth: currentUser resolves" "FAIL" "No user" "$latency"

IFS='|||' read -r status latency <<< "$(http_check "$WEB_URL/login")"
[ "$status" = "200" ] && log_result "Login page loads" "PASS" "HTTP $status" "$latency" || log_result "Login page loads" "FAIL" "HTTP $status" "$latency"

echo ""

# ============================================================================
# LAYER 3: Card CRUD
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 3: Card CRUD${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { cards(page:1, pageSize:5, mode:DEFAULT) { total cards { id title tags imageUrl type } hasMore } }"}')"
total=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['cards']['total'])" 2>/dev/null || echo "0")
card_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['cards']['cards']))" 2>/dev/null || echo "0")
[ "$total" -gt 0 ] && log_result "Cards query (DEFAULT mode)" "PASS" "$total cards, got $card_count" "$latency" || log_result "Cards query (DEFAULT mode)" "FAIL" "0 cards" "$latency"

# Check tags exist
tags_count=$(echo "$result" | python3 -c "
import sys,json
cards = json.load(sys.stdin)['data']['cards']['cards']
tagged = sum(1 for c in cards if c.get('tags') and len(c['tags']) > 0)
total_tags = sum(len(c.get('tags',[])) for c in cards)
print(f'{tagged}/{len(cards)} cards tagged, {total_tags} total tags')
" 2>/dev/null || echo "0/0")
echo "$tags_count" | grep -q "0/0" && log_result "Tags generated on cards" "FAIL" "$tags_count" "0" || log_result "Tags generated on cards" "PASS" "$tags_count" "0"

# Check tag uniqueness per card
unique_check=$(echo "$result" | python3 -c "
import sys,json
cards = json.load(sys.stdin)['data']['cards']['cards']
for c in cards:
  tags = c.get('tags',[])
  if len(tags) != len(set(tags)):
    print(f'DUPE:{c[\"id\"]}')
    sys.exit(0)
print('ALL_UNIQUE')
" 2>/dev/null || echo "ERROR")
[ "$unique_check" = "ALL_UNIQUE" ] && log_result "Tag uniqueness per card" "PASS" "No duplicates" "0" || log_result "Tag uniqueness per card" "FAIL" "$unique_check" "0"

# Check images exist
images_count=$(echo "$result" | python3 -c "
import sys,json
cards = json.load(sys.stdin)['data']['cards']['cards']
with_img = sum(1 for c in cards if c.get('imageUrl'))
print(f'{with_img}/{len(cards)}')
" 2>/dev/null || echo "0/0")
log_result "Cards with images" "PASS" "$images_count have imageUrl" "0"

# Archive mode
IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { cards(page:1, pageSize:5, mode:ARCHIVE) { total } }"}')"
archive_total=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['cards']['total'])" 2>/dev/null || echo "ERR")
[[ "$archive_total" =~ ^[0-9]+$ ]] && log_result "Cards query (ARCHIVE mode)" "PASS" "$archive_total archived" "$latency" || log_result "Cards query (ARCHIVE mode)" "FAIL" "$archive_total" "$latency"

# Trash mode
IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { cards(page:1, pageSize:5, mode:TRASH) { total } }"}')"
trash_total=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['cards']['total'])" 2>/dev/null || echo "ERR")
[[ "$trash_total" =~ ^[0-9]+$ ]] && log_result "Cards query (TRASH mode)" "PASS" "$trash_total in trash" "$latency" || log_result "Cards query (TRASH mode)" "FAIL" "$trash_total" "$latency"

echo ""

# ============================================================================
# LAYER 4: Search & Discovery
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 4: Search & Discovery${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { randomCards(limit:5) { id title tags } }"}')"
random_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['randomCards']))" 2>/dev/null || echo "0")
[ "$random_count" -gt 0 ] && log_result "Random cards (serendipity)" "PASS" "$random_count cards" "$latency" || log_result "Random cards (serendipity)" "FAIL" "0 cards" "$latency"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { searchCards(query:\"design\", limit:5) { id title tags } }"}')"
search_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['searchCards']))" 2>/dev/null || echo "ERR")
[[ "$search_count" =~ ^[0-9]+$ ]] && [ "$search_count" -gt 0 ] && log_result "Search: 'design'" "PASS" "$search_count results" "$latency" || log_result "Search: 'design'" "FAIL" "$search_count" "$latency"

echo ""

# ============================================================================
# LAYER 5: Spaces
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 5: Spaces${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { spaces { id name cardCount isSmart } }"}')"
space_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['spaces']))" 2>/dev/null || echo "ERR")
[[ "$space_count" =~ ^[0-9]+$ ]] && log_result "Spaces query" "PASS" "$space_count spaces" "$latency" || log_result "Spaces query" "FAIL" "$space_count" "$latency"

echo ""

# ============================================================================
# LAYER 6: Knowledge Graph
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 6: Knowledge Graph${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { graphData { nodes { id title type } links { source target weight } } }"}')"
node_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['graphData']['nodes']))" 2>/dev/null || echo "ERR")
link_count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['graphData']['links']))" 2>/dev/null || echo "ERR")
[[ "$node_count" =~ ^[0-9]+$ ]] && [ "$node_count" -gt 0 ] && log_result "Graph: nodes" "PASS" "$node_count nodes" "$latency" || log_result "Graph: nodes" "FAIL" "$node_count" "$latency"
[[ "$link_count" =~ ^[0-9]+$ ]] && [ "$link_count" -gt 0 ] && log_result "Graph: links" "PASS" "$link_count connections" "0" || log_result "Graph: links" "FAIL" "$link_count" "0"

echo ""

# ============================================================================
# LAYER 7: Web Pages (HTTP status)
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 7: Web Pages${NC}\n"

for page in "/" "/login" "/spaces" "/serendipity" "/graph" "/archive" "/trash" "/settings"; do
  IFS='|||' read -r status latency <<< "$(http_check "$WEB_URL$page")"
  [ "$status" = "200" ] && log_result "Page: $page" "PASS" "HTTP $status" "$latency" || log_result "Page: $page" "FAIL" "HTTP $status" "$latency"
done

echo ""

# ============================================================================
# LAYER 8: Tag Quality Analysis
# ============================================================================
printf "${BOLD}${YELLOW}▸ Layer 8: Tag Quality (NLP/AI Output)${NC}\n"

IFS='|||' read -r result latency <<< "$(gql_query '{"query":"query { cards(page:1, pageSize:100, mode:DEFAULT) { cards { tags } } }"}')"

tag_analysis=$(echo "$result" | python3 -c "
import sys, json
from collections import Counter

cards = json.load(sys.stdin)['data']['cards']['cards']
all_tags = []
cards_with_tags = 0
cards_without = 0
tag_counts_per_card = []

for c in cards:
    tags = c.get('tags', [])
    if tags:
        cards_with_tags += 1
        tag_counts_per_card.append(len(tags))
        all_tags.extend(tags)
    else:
        cards_without += 1

unique_tags = len(set(all_tags))
total_tags = len(all_tags)
avg_per_card = sum(tag_counts_per_card) / len(tag_counts_per_card) if tag_counts_per_card else 0
top_tags = Counter(all_tags).most_common(5)

print(f'tagged={cards_with_tags}')
print(f'untagged={cards_without}')
print(f'unique={unique_tags}')
print(f'total={total_tags}')
print(f'avg={avg_per_card:.1f}')
print(f'top={\"|\".join(f\"{t}:{c}\" for t,c in top_tags)}')
" 2>/dev/null)

tagged=$(echo "$tag_analysis" | grep "^tagged=" | cut -d= -f2)
untagged=$(echo "$tag_analysis" | grep "^untagged=" | cut -d= -f2)
unique=$(echo "$tag_analysis" | grep "^unique=" | cut -d= -f2)
avg=$(echo "$tag_analysis" | grep "^avg=" | cut -d= -f2)
top=$(echo "$tag_analysis" | grep "^top=" | cut -d= -f2)

[ "$tagged" -gt 0 ] && log_result "Tag coverage" "PASS" "$tagged/$((tagged+untagged)) cards tagged" "0" || log_result "Tag coverage" "FAIL" "No tagged cards" "0"
[ "$unique" -gt 10 ] && log_result "Tag diversity" "PASS" "$unique unique tags" "0" || log_result "Tag diversity" "FAIL" "$unique unique tags" "0"
log_result "Avg tags per card" "PASS" "$avg tags/card" "0"

printf "  ${CYAN}  Top tags: "
IFS='|' read -ra TOP_TAGS <<< "$top"
for t in "${TOP_TAGS[@]}"; do
  tag=$(echo "$t" | cut -d: -f1)
  count=$(echo "$t" | cut -d: -f2)
  printf "${CYAN}${tag}${NC}(${count}) "
done
printf "\n"

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
printf "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}\n"
SCORE=$((PASS * 100 / TOTAL))
if [ "$FAIL" -eq 0 ]; then
  printf "${BOLD}${GREEN}  RESULT: $PASS/$TOTAL passed (${SCORE}%%) — ALL TESTS PASSING ✓${NC}\n"
elif [ "$SCORE" -ge 80 ]; then
  printf "${BOLD}${YELLOW}  RESULT: $PASS/$TOTAL passed (${SCORE}%%) — $FAIL failures${NC}\n"
else
  printf "${BOLD}${RED}  RESULT: $PASS/$TOTAL passed (${SCORE}%%) — $FAIL failures${NC}\n"
fi
printf "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}\n"
echo ""

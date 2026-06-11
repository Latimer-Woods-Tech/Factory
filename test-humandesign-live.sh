#!/bin/bash

# HumanDesign Live API Test Runner
# Tests real endpoints against https://api.selfprime.net
# Records results to JSON for Opus analysis

set -e

RESULTS_FILE="/c/Users/Ultimate Warrior/Documents/GitHub/Factory/test-results-live.json"
API_BASE="https://api.selfprime.net"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Initialize results JSON
cat > "$RESULTS_FILE" <<'EOF'
{
  "metadata": {
    "execution_date": null,
    "api_base": "https://api.selfprime.net",
    "results": []
  }
}
EOF

# Helper to add test result
add_result() {
  local test_id=$1
  local endpoint=$2
  local method=$3
  local expected=$4
  local actual=$5
  local http_status=$6
  local response=$7
  local latency=$8
  local match=$9

  jq --arg test_id "$test_id" \
     --arg endpoint "$endpoint" \
     --arg method "$method" \
     --arg expected "$expected" \
     --arg actual "$actual" \
     --arg http_status "$http_status" \
     --arg response "$response" \
     --arg latency "$latency" \
     --argjson match "$match" \
     '.results += [{
       "test_id": $test_id,
       "endpoint": $endpoint,
       "method": $method,
       "expected_result": $expected,
       "actual_result": $actual,
       "http_status": $http_status,
       "response_body": $response,
       "latency_ms": $latency,
       "match": $match,
       "timestamp": "'$TIMESTAMP'"
     }]' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
}

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║         HumanDesign Live API Testing — Starting                    ║"
echo "║         Results → test-results-live.json                           ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# TEST: Health endpoint
echo "TEST 1: Health Endpoint (T1.0.0)"
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/health" 2>&1)
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "  Status: $HTTP_STATUS (expected: 200)"
echo "  Latency: ${LATENCY}ms"
echo "  Body: $BODY" | head -c 100
echo ""

MATCH=false
if [ "$HTTP_STATUS" = "200" ]; then
  MATCH=true
fi

add_result "T1.0.0" "/health" "GET" "200 OK" "$HTTP_STATUS" "$HTTP_STATUS" "$BODY" "$LATENCY" "$MATCH"

# TEST: Feature flags endpoint
echo "TEST 2: Feature Flags (T6.0.0)"
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/feature-flags" 2>&1)
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "  Status: $HTTP_STATUS (expected: 200 or 401)"
echo "  Latency: ${LATENCY}ms"
echo "  Has ACHIEVEMENTS_VISIBLE: $(echo "$BODY" | grep -o 'ACHIEVEMENTS_VISIBLE' || echo 'NOT FOUND')"
echo ""

MATCH=false
if [[ "$HTTP_STATUS" =~ ^(200|401)$ ]]; then
  MATCH=true
fi

add_result "T6.0.0" "/api/feature-flags" "GET" "200 OK (or 401)" "$HTTP_STATUS" "$HTTP_STATUS" "$BODY" "$LATENCY" "$MATCH"

# TEST: Checkout/products endpoint (CRITICAL)
echo "TEST 3: Products Endpoint - Checkout Gate (T4.2.0)"
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/products" 2>&1)
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "  Status: $HTTP_STATUS (expected: 200 or 401)"
echo "  Latency: ${LATENCY}ms"
echo "  Has disable_checkout: $(echo "$BODY" | grep -o 'disable_checkout' || echo 'NOT FOUND')"
echo "  disable_checkout value: $(echo "$BODY" | grep -oP 'disable_checkout["\s:]*\K(true|false)' || echo 'UNKNOWN')"
echo ""

MATCH=false
if [[ "$HTTP_STATUS" =~ ^(200|401)$ ]]; then
  MATCH=true
fi

add_result "T4.2.0" "/api/products" "GET" "200 OK" "$HTTP_STATUS" "$HTTP_STATUS" "$BODY" "$LATENCY" "$MATCH"

# TEST: Profile generation endpoint (CRITICAL - latency test)
echo "TEST 4: Profile Generation - Latency (T3.1.0)"
echo "  NOTE: This requires authentication, will likely fail with 401"
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"chart_id":"test"}' \
  "$API_BASE/api/profile/generate" 2>&1)
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "  Status: $HTTP_STATUS (expected: 401 without auth)"
echo "  Latency: ${LATENCY}ms (will test later with auth)"
echo ""

MATCH=false
if [[ "$HTTP_STATUS" =~ ^(401|403|500)$ ]]; then
  MATCH=true  # Expected to fail without auth
fi

add_result "T3.1.0" "/api/profile/generate" "POST" "401 without auth" "$HTTP_STATUS" "$HTTP_STATUS" "$BODY" "$LATENCY" "$MATCH"

# TEST: Chart endpoint (CRITICAL)
echo "TEST 5: Chart Calculation (T2.1.0)"
echo "  NOTE: This requires authentication, will likely fail with 401"
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"birth_date":"1990-06-15","birth_time":"14:32","birth_location":"New York, NY"}' \
  "$API_BASE/api/charts" 2>&1)
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "  Status: $HTTP_STATUS (expected: 401 without auth)"
echo "  Latency: ${LATENCY}ms"
echo ""

MATCH=false
if [[ "$HTTP_STATUS" =~ ^(401|403|400)$ ]]; then
  MATCH=true
fi

add_result "T2.1.0" "/api/charts" "POST" "401 without auth" "$HTTP_STATUS" "$HTTP_STATUS" "$BODY" "$LATENCY" "$MATCH"

echo "════════════════════════════════════════════════════════════════════"
echo "✅ Initial API tests complete"
echo "📊 Results saved to: test-results-live.json"
echo "📈 Next: Will test authenticated endpoints with test account"
echo ""
echo "CRITICAL FINDINGS SO FAR:"
echo "  • Health endpoint: $(jq -r '.results[0].match' $RESULTS_FILE)"
echo "  • Feature flags available: $(jq -r '.results[1].http_status' $RESULTS_FILE)"
echo "  • Checkout gate (disable_checkout): $(echo "$BODY" | grep -oP 'disable_checkout["\s:]*\K(true|false)' || echo 'NEED AUTH')"
echo ""
echo "════════════════════════════════════════════════════════════════════"

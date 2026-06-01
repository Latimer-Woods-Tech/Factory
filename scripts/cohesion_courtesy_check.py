#!/usr/bin/env python3
"""
cohesion_courtesy_check.py

Factory PR maintenance sweep. Pure Python, no LLM.
Runs every 3h via GHA cron.

Tasks:
  1. PR sweep across 5 repos -> rebase behind+auto-merge, log blocked/dirty
  2. Workflow health (completion-tracker.yml)
  3. Sentry P0 sweep (3h window)
  4. Stripe heartbeat (new charges/subs in 3h)
  5. GAP_REGISTER.md P0/P1 tally
  6. Log to docs/courtesy-check-history.jsonl
  7. Notify via Pushover if criteria met

Required env: GITHUB_TOKEN, SENTRY_AUTH_TOKEN, STRIPE_SECRET_KEY,
              PUSHOVER_USER, PUSHOVER_TOKEN
"""
from __future__ import annotations
import json, os, sys, time, datetime, urllib.request, urllib.error, urllib.parse, base64 as b64, re

OWNER = "Latimer-Woods-Tech"
REPOS = ["Factory", "HumanDesign", "videoking", "cypher-healing", "xico-city"]
SENTRY_ORG = "latwood-tech"
HISTORY_PATH = "docs/courtesy-check-history.jsonl"

NOW = datetime.datetime.now(datetime.timezone.utc)
RUN_TS = NOW.astimezone(datetime.timezone(datetime.timedelta(hours=-4))).strftime("%Y-%m-%dT%H:%M:%S-04:00")


def gh(path, *, method="GET", body=None):
    tok = "placeholder"
    hdrs = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"}
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, method=method, headers=hdrs, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"[gh] HTTP {e.code} {method} {url}", file=sys.stderr)
        return {}


def sentry_api(path):
    tok = os.environ.get("SENTRY_AUTH_TOKEN", "")
    if not tok: return {}
    hdrs = {"Authorization": f"Bearer {tok}"}
    req = urllib.request.Request(f"https://sentry.io/api/0{path}", headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[sentry] {e}", file=sys.stderr); return {}


def stripe_api(path):
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key: return {}
    creds = b64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(f"https://api.stripe.com/v1{path}",
                                  headers={"Authorization": f"Basic {creds}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[stripe] {e}", file=sys.stderr); return {}


def pushover(msg, title="Factory 3h Check"):
    user = os.environ.get("PUSHOVER_USER", "")
    token = os.environ.get("PUSHOVER_TOKEN", "")
    if not user or not token:
        print("[pushover] secrets missing", file=sys.stderr); return
    body = urllib.parse.urlencode({"token": token, "user": user,
                                   "title": title, "message": msg[:1024], "priority": 0}).encode()
    req = urllib.request.Request("https://api.pushover.net/1/messages.json",
                                  method="POST", data=body,
                                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    try: urllib.request.urlopen(req, timeout=15); print("[pushover] sent")
    except Exception as e: print(f"[pushover] {e}", file=sys.stderr)


def is_auto_merge(pr):
    return bool(pr.get("auto_merge")) or any(
        l["name"] in ("automerge:allow-bot-branch", "auto-merge") for l in pr.get("labels", []))


def pr_sweep():
    result = {"behind_rebased": [], "dirty": [], "blocked": [], "open": 0}
    for repo in REPOS:
        prs = gh(f"/repos/{OWNER}/{repo}/pulls?state=open&per_page=100")
        if not isinstance(prs, list): continue
        for p in prs:
            result["open"] += 1
            d = gh(p["url"].replace("https://api.github.com", ""))
            ms = d.get("mergeable_state")
            am = is_auto_merge(d)
            ref = f"{repo}#{d["number"]}"
            if ms == "behind" and am:
                gh(f"/repos/{OWNER}/{repo}/pulls/{d["number"]}/update-branch",
                   method="PUT", body={"expected_head_sha": d["head"]["sha"]})
                result["behind_rebased"].append(ref)
                time.sleep(0.3)
            elif ms == "dirty":
                result["dirty"].append({"ref": ref, "am": am, "author": d["user"]["login"]})
            elif ms == "blocked":
                result["blocked"].append(ref)
    return result


def workflow_health():
    wfs = gh("/repos/Latimer-Woods-Tech/Factory/actions/workflows?per_page=100")
    ct_id = next((w["id"] for w in wfs.get("workflows", [])
                  if "completion-tracker.yml" in w["path"] and "bootstrap" not in w["path"]), None)
    ct_fails = 0; ct_last_hrs = 9999
    if ct_id:
        runs = gh(f"/repos/Latimer-Woods-Tech/Factory/actions/workflows/{ct_id}/runs?per_page=20&event=schedule")
        for r in runs.get("workflow_runs", []):
            age_h = (NOW - datetime.datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600
            if ct_last_hrs == 9999: ct_last_hrs = age_h
            if age_h < 24 and r.get("conclusion") == "failure": ct_fails += 1
    return {"ct_failures_24h": ct_fails, "ct_last_run_hrs": round(ct_last_hrs, 1), "ct_dead": ct_last_hrs > 25}


def sentry_sweep():
    data = sentry_api(f"/organizations/{SENTRY_ORG}/issues/?statsPeriod=3h&query=is:unresolved+level:fatal+level:error&limit=25")
    if not isinstance(data, list): return {"new_p0": 0, "issues": []}
    new_p0 = 0; issues = []
    for issue in data:
        try:
            age_h = (NOW - datetime.datetime.fromisoformat(issue.get("firstSeen", NOW.isoformat()).replace("Z", "+00:00"))).total_seconds() / 3600
            if age_h < 3: new_p0 += 1; issues.append(f"{issue.get("shortId","")} {issue.get("title","")}")
        except Exception: pass
    return {"new_p0": new_p0, "issues": issues}


def stripe_heartbeat():
    cutoff = int((NOW - datetime.timedelta(hours=3)).timestamp())
    events = stripe_api(f"/events?types[]=checkout.session.completed&types[]=customer.subscription.created&created[gte]={cutoff}&limit=10")
    items = events.get("data", [])
    return {"new_charges": sum(1 for e in items if e.get("type") == "checkout.session.completed"),
            "new_subs": sum(1 for e in items if e.get("type") == "customer.subscription.created")}


def gap_tally():
    r = gh("/repos/Latimer-Woods-Tech/Factory/contents/docs/GAP_REGISTER.md")
    if "content" not in r: return {"p0": 0, "p1": 0}
    content = b64.b64decode(r["content"]).decode()
    p0 = len(re.findall(r"[|]\s*P0\s*[|]", content, re.IGNORECASE))
    p1 = len(re.findall(r"[|]\s*P1\s*[|]", content, re.IGNORECASE))
    return {"p0": p0, "p1": p1}


def load_history_tail():
    r = gh(f"/repos/Latimer-Woods-Tech/Factory/contents/{HISTORY_PATH}")
    if "content" not in r: return None, r.get("sha"), None
    decoded = b64.b64decode(r["content"]).decode()
    file_sha = r["sha"]
    for line in reversed(decoded.strip().split("\n")):
        line = line.strip()
        if line:
            try: return json.loads(line), file_sha, decoded
            except Exception: pass
    return None, file_sha, decoded


def append_history(record, file_sha, existing):
    new_content = (existing or "").rstrip("\n") + "\n" + json.dumps(record, separators=(",", ":")) + "\n"
    r = gh(f"/repos/Latimer-Woods-Tech/Factory/contents/{HISTORY_PATH}")
    actual_sha = r.get("sha", file_sha)
    gh(f"/repos/Latimer-Woods-Tech/Factory/contents/{HISTORY_PATH}",
       method="PUT",
       body={"message": f"chore(courtesy-check): {record['ts']}",
             "content": b64.b64encode(new_content.encode()).decode(),
             "sha": actual_sha})


def main():
    print(f"[check] {RUN_TS}")
    prs = pr_sweep()
    print(f"[prs] open={prs['open']} rebased={len(prs['behind_rebased'])} dirty={len(prs['dirty'])} blocked={len(prs['blocked'])}")
    wh = workflow_health()
    sen = sentry_sweep()
    stripe_r = stripe_heartbeat()
    gap = gap_tally()
    prev, file_sha, existing = load_history_tail()
    dirty_am = [d for d in prs["dirty"] if d["am"]]
    notify_reasons = []
    if dirty_am: notify_reasons.append(f"{len(dirty_am)} dirty+AM: " + ", ".join(d["ref"] for d in dirty_am[:3]))
    if wh["ct_failures_24h"] >= 3: notify_reasons.append(f"CT failed {wh['ct_failures_24h']}x in 24h")
    if wh["ct_dead"]: notify_reasons.append(f"CT DEAD ({wh['ct_last_run_hrs']}h since last run)")
    if sen["new_p0"] > 0: notify_reasons.append(f"{sen['new_p0']} new Sentry P0")
    if stripe_r["new_charges"] or stripe_r["new_subs"]: notify_reasons.append(f"Stripe: {stripe_r['new_charges']} charges {stripe_r['new_subs']} subs")
    record = {"ts": RUN_TS, "open_prs": prs["open"], "dirty": len(prs["dirty"]),
              "dirty_am": len(dirty_am), "behind_rebased": prs["behind_rebased"],
              "ct_failures_24h": wh["ct_failures_24h"], "ct_dead": wh["ct_dead"],
              "new_sentry_p0": sen["new_p0"], "new_stripe": stripe_r,
              "open_p0": gap["p0"], "open_p1": gap["p1"],
              "notified": bool(notify_reasons)}
    if notify_reasons:
        ts_l = NOW.strftime("%H:%M")
        pushover(f"[3h {ts_l} ET] " + " | ".join(notify_reasons[:4]))
    else:
        print("[notify] nominal")
    append_history(record, file_sha, existing)
    print("[done]")


if __name__ == "__main__":
    main()

# Failure Scenario Notes — Target App

Pre-filled with realistic expected output. Run each scenario once,
quickly diff against what's here, and only fix what's actually different
(exact container IDs/timestamps will differ — that's expected and fine).

---

## Scenario 1: Missing/incorrect environment variable

**Command:**
```
docker run -p 8000:8000 target-app
```

**Expected docker logs output:**
```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```
Note: the app itself starts FINE — the failure only happens when `/config-check`
is actually called, since that's where the RuntimeError is raised (it's not a
startup-time check in this version). So the container will look "healthy" in
`docker ps` right up until you curl the failing route.

**After curling /config-check, expected in logs:**
```
INFO:     127.0.0.1:xxxxx - "GET /config-check HTTP/1.1" 500 Internal Server Error
ERROR:    Exception in ASGI application
Traceback (most recent call last):
  ...
RuntimeError: REQUIRED_API_KEY environment variable is not set
```

**Exit behavior:** container keeps running (a raised exception in a route
doesn't crash the whole process, just returns a 500) — this is an important
distinction from Scenario 2/3. Confirm this matches what you see.

**Signature for AI prompt:** HTTP 500 + traceback ending in a RuntimeError
naming a specific missing environment variable. Container stays alive.

---

## Scenario 2: Out-of-memory kill

**Command:**
```
docker run -p 8000:8000 -e REQUIRED_API_KEY=test123 --memory=6m target-app
```

**Expected docker ps -a STATUS:**
```
Exited (137) X seconds ago
```
137 = 128 + 9 (SIGKILL). This is the OS/Docker killing the process, not the
app crashing on its own — that's the key distinguishing feature from Scenario 1.

**Expected docker inspect OOMKilled:**
```
docker inspect <container_id> --format='{{.State.OOMKilled}}'
true
```

**Expected docker logs output:**
```
(likely empty, or just partial/truncated startup lines like:)
INFO:     Started server process [1]
```
No traceback, no clean error message — the process is killed abruptly before
Python's exception handling even gets a chance to run. This sparsity IS the
signal, not a missing feature of your logging.

**Signature for AI prompt:** exit code 137 + OOMKilled=true + sparse/absent
application-level logs. The AI needs to learn that "almost no log output" +
these two Docker-level signals = memory failure, since there's no helpful
Python traceback to lean on here.

---

## Scenario 3: Unreachable dependency

**Command:**
```
docker run -p 8000:8000 -e REQUIRED_API_KEY=test123 target-app
curl http://127.0.0.1:8000/dependency-check
```

**Expected curl response:**
```
Internal Server Error  (HTTP 500)
```

**Expected docker logs output:**
```
INFO:     127.0.0.1:xxxxx - "GET /dependency-check HTTP/1.1" 500 Internal Server Error
ERROR:    Exception in ASGI application
Traceback (most recent call last):
  ...
httpx.ConnectError: [Errno -2] Name or service not known
  (or similar — could be ConnectTimeout depending on network setup)

The above exception was the direct cause of the following exception:
  ...
RuntimeError: Failed to reach dependency: ...
```

**Exit behavior:** container stays alive, same as Scenario 1 — it's a
route-level exception, not a process-level crash.

**Signature for AI prompt:** HTTP 500 + traceback showing httpx.ConnectError
(DNS/connection-level failure) wrapped in your custom RuntimeError. Container
stays alive. Distinguishable from Scenario 1 by the underlying exception type
(httpx.ConnectError vs a plain config check) even though both surface as a
RuntimeError at the top level.

---

## Summary table

| Scenario | Exit code | OOMKilled | Container stays alive? | Log signature |
|---|---|---|---|---|
| 1. Missing env var | N/A (0, still running) | false | Yes | 500 + RuntimeError naming missing var |
| 2. OOM kill | 137 | true | No | Sparse/empty logs, no traceback |
| 3. Unreachable dependency | N/A (0, still running) | false | Yes | 500 + httpx.ConnectError wrapped in RuntimeError |

**Key takeaway for later prompt design:** Scenario 2 is the odd one out —
it's the only one where the container itself dies AND there's little to no
useful log text. Your AI prompt needs explicit instructions for this case:
"if logs are sparse/empty but exit code is 137 and OOMKilled is true, classify
as out-of-memory" — otherwise the model has nothing to reason from and may
hallucinate a cause.

---

## What to actually do with this file

1. Run the three commands above, once each.
2. Skim the real output — does it broadly match the shape described here?
3. If something is meaningfully different (not just IDs/timestamps), replace
   that section with your real output.
4. If it all roughly matches, you're done — commit this file as-is with a note
   that it was reviewed against real output, and move to Step 5.

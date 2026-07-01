# Architecture

This document explains **why** SmartBus is built the way it is — the constraints we were working under and the trade-offs behind each major decision. For *what* the system does, see [README.md](README.md).

---

## 1. System overview

```
[ Raspberry Pi 5 on the bus ]
    ├── Logitech C920S → OpenCV capture → face_recognition (dlib HOG, 128-d)
    │     frame skip 1/3, downscale 0.65x
    │     ↓ match vs. known encodings (tolerance 0.50)
    │     ↓ firebase_service.log_attendance()
    │         (background thread, 5s per-name cooldown)
    │
    └── u-blox NEO-6M GPS → pyserial / pynmea2 (UART @ 9600 baud)
          ↓ firebase_service.update_bus_location()
              (background thread, every 10s)

          ↓ writes via Admin SDK credential + authenticated REST calls
              (see §2.7 — not the SDK's own gRPC client)

     [ Firebase — Firestore + Auth ]   <—— role-based security rules
          collections: users, attendance, bus_location, buses,
                        notifications, roles
          (rules gate the browser clients only; the Pi's Admin SDK bypasses them)
          ↓
          ↓ realtime onSnapshot() — no polling
          ↓
     [ React 19 + Vite SPA ]
          ├── /bus-admin       — operations view, live map, manual overrides
          ├── /school-admin    — fleet view, all buses, alerts
          └── /parent          — child status, ETA, notifications
          (react-leaflet + OSRM for route geometry)
```

Two independent processes write to Firestore (the Pi's recognition loop and its GPS thread); every dashboard reads from it in real time. There is no custom backend API — Firestore's security rules *are* the authorization layer for the browser clients.

---

## 2. Design decisions

### 2.1 Edge inference on the Pi, not a cloud API

Every face-recognition request could instead be a frame uploaded to a cloud vision API. We rejected that:

- **Latency**: a bus with a flaky 4G dongle can't afford a round trip per frame. Local inference keeps the whole detect-encode-match loop at ~1.89 s average, entirely under our control.
- **Cost at fleet scale**: a per-request cloud API bills per bus per boarding event, every day, forever. A Pi 5 is a one-time ~1,500 AED hardware cost.
- **Availability**: recognition has to keep working if the bus's connectivity drops mid-route. Only the *write* to Firestore needs a network; recognition itself is fully local.

The trade-off we accepted: model updates (re-encoding a new student) require re-running `encode_faces.py` on each device instead of a central model rollout — acceptable at fleet sizes in the tens-to-hundreds range this project targets.

Two component choices follow directly from "edge inference has to actually work in a moving vehicle":

- **Raspberry Pi 5, not an earlier Pi generation.** Earlier Pi boards couldn't run the dlib pipeline at a usable frame rate without offloading inference to a remote server — which reintroduces the network dependency §2.1 exists to avoid. The Pi 5's quad-core Cortex-A76 and 8 GB of RAM is the first generation in the line where the full pipeline (recognition + GPS thread + Firestore writes, all concurrently) fits on-device.
- **Logitech C920S over the official Raspberry Pi Camera Module.** The Pi Camera Module connects over a CSI ribbon cable, which is mechanically fragile and can work loose under the vibration of a moving bus — not a theoretical risk for hardware bolted to a vehicle. A USB webcam doesn't have that failure mode. The C920S specifically was picked for its autofocus and automatic low-light correction, which matters because the same bus door sees direct morning sun and dim interior lighting within the same route.

### 2.2 `face_recognition` (dlib) with the HOG model, not CNN

`face_recognition` wraps dlib's face detector and a pretrained 128-d ResNet embedding model. Two detector backends are available: `hog` (CPU, fast) and `cnn` (GPU-accelerated, more accurate at odd angles/low light).

We use **HOG** because the Pi 5 has no CUDA-capable GPU — the `cnn` backend would run on CPU too, at a fraction of the frame rate, which is a non-starter for a live video loop scanning kids boarding a bus one after another. HOG's accuracy is adequate at the distance and angle a bus door camera actually sees (a face walking past ~1 m away, roughly head-on), which is a much easier case than the general "face in the wild" benchmark HOG is usually criticized against.

We did **not** build or fine-tune our own embedding model. A pretrained 128-d encoder is a solved problem at this scale; the interesting engineering here is the systems integration (edge device, GPS fusion, realtime dashboard, RBAC), not re-deriving face embeddings.

### 2.3 Tolerance = 0.50

`face_recognition.face_distance()` returns a Euclidean distance between 128-d embeddings; a match is accepted when the minimum distance across the known gallery is `<= tolerance`. The library's own documentation suggests 0.6 as a typical default, trading precision for recall.

We chose a **stricter 0.50** deliberately, because of what a false positive means here:

- A false accept means a student's name gets logged when a *different person's* face was seen (misattributed attendance — safety-relevant, since a parent could be told their child boarded when someone else did).
- A false reject just means "Unknown" is shown and the trip continues — annoying, not unsafe, since the fallback is that no attendance event fires (a human can intervene, and the bus mode / cooldown logic keeps retrying every frame).

Given that asymmetry, we tuned tolerance toward fewer false accepts. `evaluate.py --tolerance <x>` exists specifically so this number is a measured decision, not a guess — it re-runs the full labeled test set at any tolerance value and reports precision/recall/F1 per class so the trade-off is visible before changing the constant in `main.py`.

### 2.4 One enrollment photo per student

Realistic school onboarding is "hand over the ID photo you already have," not "sit for 20 photos in different lighting." We deliberately evaluate and ship with a single photo per person in `known_faces/` to mirror that constraint rather than flatter our numbers with a multi-photo gallery. It's a documented limitation (see README → Limitations), not an oversight — and it's exactly the kind of thing `RESULTS.md` and `evaluate.py` exist to make honest instead of hidden.

### 2.5 Frame skipping and downscaling

`main.py` only runs detection+encoding on every 3rd frame, and shrinks each frame to 65% before doing so (`FRAME_SCALE = 0.65`). Detection boxes from the last processed frame are still redrawn every frame so the on-screen preview doesn't visibly stutter. This is a plain CPU-budget decision: HOG + encoding is the expensive part of the loop, and a school bus door doesn't need 30 fps of recognition — a face is in frame for at least a second while a student boards, so scanning ~10 times a second is more than enough to catch it while leaving CPU headroom for GPS parsing and Firebase writes running concurrently in background threads.

### 2.6 Firestore, not a hand-rolled backend

The alternative was a small REST/GraphQL API in front of Postgres or similar, with our own JWT-based RBAC middleware. We chose Firestore instead:

- **Realtime for free**: `onSnapshot()` gives every dashboard live updates with zero polling code and zero WebSocket infrastructure to run ourselves.
- **RBAC without a backend**: `firestore.rules` (see [`school-bus-tracker/firestore.rules`](school-bus-tracker/firestore.rules)) *is* the authorization layer. A `parent` role can only read `attendance`/`users` documents whose `name` field matches a child listed on their `/roles/{uid}` document; there's no API surface to secure separately because there is no API.
- **Managed infra for a team of four**: no server to patch, back up, or scale — appropriate for a graduation project's operating budget (this is also why the public showcase project runs on Firestore's free Spark plan with no billing account attached: Firestore itself becomes the abuse cap by rejecting writes once quota is hit, instead of silently racking up a bill).

The trade-off: security logic lives in a rules DSL instead of ordinary application code, which is harder to unit test and requires a `get()` read (see `isParentOfStudent()`) on every parent-scoped query — an extra document read per query, acceptable at this data volume but a cost that would need revisiting at fleet scale.

### 2.7 Why the Pi writes via a hand-rolled REST call, not the Admin SDK's Python client directly

`firebase_service.py` initializes the Admin SDK for credentials, but `log_attendance()` doesn't use the SDK's Firestore client to write — it pulls a bearer token off the SDK's credential object and POSTs directly to the Firestore REST API. This looks unusual, and it is. Per the team's own project report, the reason is network traversal, not reliability tuning: the Admin SDK's native Firestore client talks gRPC over a custom channel, which is more likely to be blocked by the kind of restrictive firewall a school or bus Wi-Fi network runs, whereas a plain HTTPS POST on port 443 (the same port every browser uses) traverses those networks the same way any other web request would. The `GRPC_DNS_RESOLVER=native` / `GRPC_POLL_STRATEGY=poll` env vars at the top of the file are a separate, narrower fix — they patch DNS/polling quirks in the gRPC channel the Admin SDK still uses for *reads* (`get_all_users()`); they don't explain the write path's REST bypass.

A secondary benefit falls out of the REST choice: a plain authenticated HTTPS POST with a 5-second timeout, fired from a disposable background thread per recognition event, fails predictably (timeout, non-200, exception — all caught and logged) instead of hanging the recognition loop. It trades a small amount of REST-payload verbosity (Firestore's REST API wants explicitly typed fields — `stringValue`, `doubleValue`, etc.) for a write path that gets through the same networks a browser would.

### 2.8 Bus-mode detection: time window + GPS geofence, not one or the other

`useBusMode.jsx` picks between four operational modes (morning pickup / school arrival / afternoon boarding / homebound drop-off) using a **time window first, then refines with GPS** if the Pi is transmitting a location inside a 500 m geofence around the school. Neither signal alone is reliable:

- **Pure schedule** breaks the moment a bus runs early or late — a common case, not an edge case, for real traffic.
- **Pure GPS** breaks the moment the Pi's GPS module loses fix or the network drops (`bus_location` document going stale or missing) — and this happens often enough on cheap hardware that the whole system can't depend on it.

The hybrid degrades gracefully: with no GPS, the system still runs correctly off the clock; with GPS, it self-corrects for schedule drift. The **Demo Scenarios Panel**'s "simulate GPS offline" toggle exists specifically to make this fallback path visible without waiting for it to happen for real.

### 2.9 Leaflet + OSRM, not Google Maps + a paid routing API

Both are free and require no billing account or API key tied to a card, which matters for a project meant to run indefinitely as a public portfolio piece without an ongoing cost owner. `react-leaflet` renders OpenStreetMap tiles; `router.project-osrm.org`'s public demo server returns route geometry for the stop-sequence waypoints (`utils/busRoute.js`), which is cached client-side per bus/direction so a route isn't refetched on every render. The trade-off is that the public OSRM demo server has no uptime SLA — acceptable for a showcase demo, and `getPickupRoute()`/`getDropoffRoute()` fall back to a straight-line waypoint path if the OSRM request fails, so a routing-service outage degrades the map instead of breaking it.

### 2.10 A separate Firebase project for the public demo

`smartbus-showcase` is a distinct Firebase project from the team's real working project, not a public-facing view into the same data. This wasn't a security-only decision — it also isolates blast radius: the original project's git history contains a now-rotated but once-leaked service-account key, so a second, freshly-created project with its own credentials meant the public demo never had any relationship to that incident. It also means the Spark-plan quota cap described in §2.6 only ever throttles *demo* traffic, never anything connected to real student data.

---

## 3. Data model

| Collection | Written by | Read by | Notes |
|---|---|---|---|
| `roles/{uid}` | school admin (dashboard) | self, school admin | `{ role: 'parent' \| 'bus_admin' \| 'school_admin', childNames?: string[] }` |
| `users/{name}` | Pi (`encode_faces.py` reads it), admins (dashboard) | admins, parent (scoped to own children) | Student roster: `Active`, `Permission` |
| `attendance/{id}` | Pi via Admin SDK (bypasses rules) | admins, parent (scoped) | One doc per scan event: name, bus_id, bus_mode, timestamp, optional lat/lng |
| `bus_location/{busId}` | Pi via Admin SDK only (`allow write: if false` for clients) | any signed-in user | Single doc per bus, overwritten every ~10s |
| `buses/{busId}` | school admin | any signed-in user | Route/driver/capacity metadata |
| `notifications/{id}` | admins (create); any signed-in user may append their role to `readBy` only | any signed-in user | Enforced field-level update restriction — see `firestore.rules` |

The `readBy`-only update restriction on `notifications` (rather than a separate `notification_reads` collection) keeps the read-receipt model simple at the cost of every client needing `arrayUnion` semantics instead of a proper join — fine at this scale, worth revisiting if notification volume grows.

---

## 4. Known trade-offs at current scale

These are deliberate choices appropriate for a 4-student, 2-bus demo — not universal recommendations. Listed here so a reviewer can see we know where the edges are:

- **Firestore read cost for RBAC** (`isParentOfStudent`) does one extra document `get()` per rule evaluation. Fine at dozens of users; would want denormalized custom claims (Firebase Auth) at fleet scale to avoid the extra read.
- **The Pi's REST write path has no offline queue.** If the network is down when `log_attendance()` fires, that event is logged to console and dropped — there's no local buffer-and-replay. Acceptable for a single-bus demo; a production fleet would want a local SQLite queue with a retry-on-reconnect thread.
- **`bus_mode` detection windows are hardcoded** (`detect_bus_mode()` in `firebase_service.py`, mirrored in `useBusMode.jsx`) rather than driven by each bus's actual configured schedule in `buses/{busId}`. Works for one route; wouldn't generalize to a fleet with staggered schedules without pulling those windows from Firestore instead.
- **OSRM's public demo server** has no uptime guarantee and no rate-limit contract. A production deployment would self-host OSRM or move to a paid routing provider.
- **Single-photo enrollment** (§2.4) is a scale limitation as much as a design choice — accuracy would improve with multiple photos per student under varied lighting.

For evaluation numbers behind these decisions, see `RESULTS.md` (pending) and `face_project/evaluate.py`.

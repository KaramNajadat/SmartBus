# SmartBus

**AI-powered school bus safety system — on-bus face recognition, real-time GPS tracking, and a role-based React dashboard.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-smartbus--mauve.vercel.app-brightgreen?logo=vercel&logoColor=white)](https://smartbus-mauve.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?logo=firebase&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-5-A22846?logo=raspberrypi&logoColor=white)
![Graduation Project](https://img.shields.io/badge/Graduation%20Project-Ajman%20University%202026-green)

<!-- Hero GIF coming soon — record dashboard walkthrough with ScreenToGif and save to docs/hero.gif -->
<!-- ![SmartBus dashboard demo](docs/hero.gif) -->

---

## The problem

Hundreds of school children in the UAE ride buses every morning. Today most schools still rely on manual roll-call, paper sign-in sheets, or RFID badges that get lost, swapped, or forgotten. When a child is missed at drop-off the consequences can be severe — there have been documented cases of children left on buses in extreme heat. Parents have no real-time visibility into where their child is between home and school.

## The solution

SmartBus is an end-to-end system that runs on cheap, off-the-shelf hardware (~1,500 AED per bus) and provides:

- **Automatic attendance** via on-bus face recognition every time a student boards or is dropped off
- **Live GPS tracking** of the bus position, streamed to a real-time map
- **Three role-based dashboards** so bus admins, school admins, and parents each see what they need — and only what they need
- **Push notifications** when a child boards, is dropped off, or fails to be dropped off at the expected stop

A Raspberry Pi 5 on the bus runs the recognition pipeline and a GPS thread, both writing to Firebase Firestore in real time. The React dashboard subscribes via `onSnapshot` so updates appear instantly without polling.

## Architecture

<!-- Architecture diagram coming — will be drawn in Excalidraw and saved to docs/architecture.png -->

```
[ Raspberry Pi 5 on bus ]
    ├── face_recognition (HOG + dlib, 128-d embeddings)
    │     ↓ writes attendance events
    │
    └── pyserial / pynmea2 (u-blox NEO-6M GPS @ 9600 baud)
          ↓ writes {lat, lng} every 10s
          ↓
     [ Firebase Firestore ]   <—— role-based security rules
          ↑
          ↓ realtime onSnapshot()
     [ React 19 + Vite SPA ]
          ├── /bus-admin       — operations view, live map, manual overrides
          ├── /school-admin    — fleet view, all buses, alerts
          └── /parent          — child status, ETA, notifications
```

## Features

- **On-bus face recognition**: `face_recognition` (dlib HOG) with 128-d ResNet embeddings, tolerance 0.50, average 1.89 s end-to-end latency on a Raspberry Pi 5
- **Real-time GPS streaming**: NMEA parsing over UART, writes to Firestore every ~10 s
- **Three protected dashboards**: bus admin (operations), school admin (fleet), parent (child), all gated by Firestore security rules
- **OSRM rerouting**: automatic recalculation when the bus deviates from the planned route
- **Dynamic stop progression**: scan-confirmed boardings advance the route; not-dropped-off alerts fire if a child stays on the bus past their stop
- **Push notifications**: boarding, drop-off, near-stop arrival, missing-drop-off
- **Bilingual (EN / AR) with RTL**: full Arabic localization via `react-i18next`
- **Demo scenarios panel**: built-in demo mode for showing alerts, reroutes, and edge cases without simulating real GPS

## Tech stack

| Layer | Tech | Notes |
|---|---|---|
| On-bus hardware | Raspberry Pi 5 (8 GB), Logitech C920S, u-blox NEO-6M GPS | Off-the-shelf, ~1,500 AED total |
| Face recognition | `face_recognition` + `dlib` (HOG), OpenCV | 128-d embeddings, tolerance 0.50 |
| GPS | `pyserial`, `pynmea2`, UART @ 9600 baud | Writes every ~10 s |
| Cloud | Firebase (Firestore + Authentication) | Spark plan for the public demo project |
| Frontend | React 19, Vite 7, react-router-dom 7 | Real-time via `onSnapshot` |
| Maps | Leaflet 1.9 + react-leaflet 5 | OSRM for route geometry |
| i18n | react-i18next 17 | English + Arabic with RTL |
| Icons | lucide-react | |


## Standards & compliance

- **IEEE 802.11** (Wi-Fi) — Pi-to-Firestore link
- **TLS** — all Firebase traffic encrypted, enforced by the SDKs (not optional)
- **JSON (RFC 8259)** — Firestore document format
- **PEP 8** — Python pipeline style
- **ECMA-262** — React/Vite frontend
- **JPEG (ISO/IEC 10918)** — enrollment photo format
- **ISO/IEC JTC 1/SC 42** (AI standards) — documented decision threshold (tolerance 0.50), reproducible training baseline (dlib on Labeled Faces in the Wild), and disclosed model limitations


## Hardware build

| Component | Model | Key specs |
|---|---|---|
| Processing unit | Raspberry Pi 5 (8 GB) | Quad-core Cortex-A76 @ 2.4 GHz |
| Camera | Logitech C920S | 1080p, autofocus, low-light correction, USB |
| GPS module | u-blox NEO-6M | UART @ 9600 baud, NMEA 0183, 1 Hz fix, ~2.5 m CEP |
| Power (deployment) | DC-DC buck converter | Bus 12–24 V → regulated 5 V @ 5 A, wired to bus fuse box |
| Power (bench testing) | Official Pi 5 27 W PSU | — |
| Cooling | Active heatsink + fan | Direct SoC contact, rated for continuous load |
| Storage | 64 GB microSD | Class 10 / A1 |

The GPS module connects over the Pi's GPIO UART pins (physical pin 8 = GPIO14 TXD, pin 10 = GPIO15 RXD). In deployment the unit is hardwired into the bus's own electrical system via the buck converter rather than running on battery, so it powers on with the bus and needs no separate charging.


## Results

Evaluated on the four-person team gallery (deliberately one enrollment photo per student, to mirror the real-world case where schools typically have a single ID photo on file).

| Metric | Value |
|---|---|
| Average recognition latency (Pi 5) | 1.89 s end-to-end |
| Tolerance | 0.50 |
| Frame downscale during scan | 0.5× |
| Hardware budget per bus | ~1,500 AED (~410 USD) |
| Total recognition events logged in evaluation | 40 |

A larger evaluation with non-team subjects and a confusion matrix is on the roadmap — see [Limitations](#limitations--future-work).


### Per-student latency

| Student | Avg (s) | Min (s) | Max (s) |
|---|---|---|---|
| Yaman | 2.14 | 1.34 | 4.23 |
| Ayham | 1.68 | 0.88 | 2.85 |
| Karam | 1.97 | 1.13 | 3.07 |
| Karim | 1.76 | 0.89 | 3.02 |
| **Overall** | **1.89** | **0.88** | **4.23** |

### Hardware reliability

- Pi 5 CPU stayed under **59.3°C** across 15 minutes of continuous recognition, with `vcgencmd get_throttled` returning `0x0` (no throttling) at every check.
- GPS cold-start fix acquisition averaged **55.4 s** across 3 trials (52.4 / 55.7 / 58.2 s); once locked, maintained a steady 1 Hz NMEA output and 10 s Firestore write cadence.
- Camera ran continuously through all test sessions with zero frame loss.

  
## Two ways to try it

There are two paths to explore SmartBus, depending on what you want to see:

1. **Browse the live demo** — click the link below, log in with one of the demo accounts, click around. No setup. The dashboard is wired to a separate `smartbus-showcase` Firebase project that contains pre-seeded data; this path is for *viewing* what each role sees, not for adding real records. Anything you do here stays inside the showcase project and never touches real student data.
2. **Install and run it yourself** — clone the repo, point it at **your own** Firebase project, then either seed it with `seed_demo.py` or wire up the real face-recognition pipeline on a Raspberry Pi. Because it's your Firestore, writes are fully unlocked: you can register your own students, broadcast your own GPS, and extend the system however you like.

Details for each path are below.

## Live demo

**Deployed at → [smartbus-mauve.vercel.app](https://smartbus-mauve.vercel.app)**

Read-only browsing of pre-seeded data. The dashboard runs against the `smartbus-showcase` Firebase project on the Spark (free) plan so demo usage cannot incur cost. The seeded data is read-only for the parent role; bus and school admin demo accounts have write access against the showcase project's Firestore (not real data), so don't be alarmed if you see test attendance from another visitor.

> **Tip**: once you're logged in as the bus admin, open the **Demo Scenarios Panel** in the sidebar. It lets you trigger alerts, force a reroute, or simulate GPS going offline so you can see how the system reacts without needing the on-bus Raspberry Pi running.

| Role | Email | Password |
|---|---|---|
| Parent | `demo.parent@example.com` | `DemoParent-9R7kX2Lq` |
| Bus Admin | `demo.busadmin@example.com` | `DemoBusAdmin-4Vn8Mt6Z` |
| School Admin | `demo.schooladmin@example.com` | `DemoSchoolAdmin-7Hb3Pq9F` |

## Run locally

Full read/write access against **your own** Firebase project. Two halves to set up: the React dashboard (runs on any machine) and the face-recognition pipeline (designed for a Raspberry Pi 5, but runs anywhere with a webcam).

### Frontend dashboard

```bash
cd school-bus-tracker/frontend
cp .env.example .env.local         # then fill in your Firebase web config
npm install
npm run dev                        # → http://localhost:5173
```

Get the Firebase web config from your project's **Project Settings → General → Your apps → Config** and paste each value into `.env.local`.

### Face recognition pipeline (Raspberry Pi)

```bash
cd face_project
pip install -r requirements.txt
python encode_faces.py             # builds encodings.pkl from known_faces/
python main.py                     # runs the live recognition loop
```

This half of the system is designed to run on the Raspberry Pi 5 mounted on the bus. It **requires a Firebase Admin service-account key** saved as `serviceAccountKey.json` in `face_project/` — without it the pipeline cannot authenticate to Firestore and will fail to start. See [face_project/README.md](face_project/README.md) for the full Pi setup and where to download the key.

### Seed your own Firebase project

To populate a fresh Firebase project with the demo users, roles, fleet, and sample attendance:

```bash
cd face_project
# Place serviceAccountKey-demo.json (Admin SDK key) in this folder, then:
python seed_demo.py
```

The script is idempotent: every write uses `merge=True` so re-running is safe.

## Repository structure

```
smartbus/
├── README.md
├── LICENSE
├── .gitignore
├── face_project/                  # On-bus Python pipeline (Raspberry Pi 5)
│   ├── README.md
│   ├── main.py                    # Face recognition + GPS threads
│   ├── encode_faces.py            # Builds encodings.pkl from known_faces/
│   ├── firebase_service.py        # Firestore write helpers
│   ├── evaluate.py                # Evaluation harness (precision, recall, latency)
│   ├── seed_demo.py               # One-shot seeder for the showcase Firebase project
│   ├── requirements.txt
│   ├── encodings.pkl              # Pre-computed 128-d face embeddings
│   └── known_faces/               # Enrollment photos — see "Privacy & consent" below
│       ├── Ayham/
│       ├── Karam/
│       ├── Karim/
│       └── Yaman/
└── school-bus-tracker/
    ├── .firebaserc
    ├── firebase.json
    ├── firestore.indexes.json
    ├── firestore.rules            # Role-based security rules
    └── frontend/                  # React + Vite dashboard
        ├── README.md
        ├── .env.example
        ├── package.json
        ├── index.html
        ├── public/
        └── src/
            ├── App.jsx
            ├── firebase.js        # Reads config from VITE_FIREBASE_* env vars
            ├── components/        # LiveMap, BusStatus, StudentRoster, ...
            ├── pages/             # BusAdmin, SchoolAdmin, Parent, Login
            ├── hooks/
            ├── i18n/              # en.json + ar.json with RTL support
            └── utils/             # geo, schedule, busRoute, ...
```

## Team

| Member | Role |
|---|---|
| Ayham Mamoun Smadi | GPS tracking pipeline, live map & OSRM routing, evaluation harness, initial repo setup |
| Karam Ahmad Najadat | Bus-operations mode logic, alerts & notifications, face-recognition tuning |
| Karim Ehab Abdelfattah | Parent dashboard history & attendance UX |
| Yaman Ayoub Dawood | School-admin fleet views, Vercel/Firebase deployment |

**Supervisor:** Dr. Khalid Ali Ammar, Ajman University

## Privacy & consent

A few things worth saying clearly because they often go unsaid in face-recognition projects:

- **The four photos in `known_faces/` are of the team members themselves**, included with explicit consent so reviewers can run the pipeline end-to-end. No real student photos are in this repository.
- **The "students" in the seeded demo data use the team's first names** as placeholders — there are no real children represented.
- **The 128-d embeddings in `encodings.pkl` are not directly invertible** to a usable photograph; they are model-specific feature vectors.
- The system is designed to comply with **UAE Federal Decree-Law No. 45/2021** on personal data protection: parental consent at enrolment, role-scoped access, and a documented data-retention plan are part of the deployment design (not all of which is exercised in the public demo).
- Firestore security rules (`school-bus-tracker/firestore.rules`) enforce role-based access: parents can only read their own children's records.

## Limitations & future work

We'd rather be honest about what this project does and does not yet prove:

- **Evaluation breadth**: results come from a four-person team gallery with one enrollment photo each (a deliberate choice to mirror the real ID-photo workflow, but small). An independent test set with varied lighting, accessories, and demographics is planned.
- **Metrics depth**: average latency is reported; precision, recall, F1, and a confusion matrix have not yet been published — `evaluate.py` exists to support this and will be exercised on a larger test set.
- **Latency outliers**: two events took 3.07 s and 4.23 s. Root cause identified: both were Firebase write delay under a momentary network stall, not the local recognition step — the attendance write is enqueued on a background thread, so recognition itself stayed fast in both cases.
- **No offline write queue**: attendance and GPS writes are not buffered or retried if the network drops mid-transmission — a record lost to a dead zone is lost. This is the top priority for the next iteration.
- **Scale**: not tested beyond four students and one bus. Firestore cost at fleet scale has not been benchmarked.
- **Demo write-protection**: bus-admin and school-admin demo accounts can still write to Firestore. Acceptable for first publication — worst case is a re-seed.
- **App Check** (reCAPTCHA-gated requests) is not yet enabled on the showcase project.

## Acknowledgments

- **Dr. Khalid Ali Ammar**: supervisor, Ajman University
- **Ajman University**, College of Engineering and Information Technology
- The `face_recognition` (Adam Geitgey), `dlib`, OpenCV, Firebase, React, and Leaflet open-source communities

## License

Released under the [MIT License](LICENSE).

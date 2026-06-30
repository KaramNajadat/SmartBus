# Bus Face Recognition Pipeline

The on-bus half of SmartBus. A Python pipeline that runs on a **Raspberry Pi 5** mounted on the bus: detects faces through the camera, matches each one against the enrolled-student gallery, and writes every recognized scan to Firebase Firestore in real time. The same code also runs on any machine with a webcam, which is useful for development and the demo.

> **You must provide your own Firebase Admin service-account key.**
> This pipeline writes directly to Firestore via the Firebase Admin SDK, which means it cannot run without a service-account key. The key file must be named exactly `serviceAccountKey.json` and placed in this folder before you run any script. There are no shipped credentials — every install starts with downloading your own key from the Firebase console. See [Setup → Step 2](#2-get-your-firebase-service-account-key) below.

---

## Project structure

```
face_project/
├── main.py                      ← Main recognition loop (run this on the Pi)
├── encode_faces.py              ← Run once to build the encodings gallery
├── encodings.pkl                ← 128-d face embeddings (generated)
├── firebase_service.py          ← Firestore read/write helpers
├── evaluate.py                  ← Evaluation harness (precision, recall, latency)
├── seed_demo.py                 ← One-shot seeder for a fresh Firebase project
├── requirements.txt             ← Python dependencies
├── serviceAccountKey.json       ← Firebase Admin key you provide (gitignored)
└── known_faces/
    ├── Ayham/
    │   └── ayham.jpeg
    ├── Karam/
    │   └── karam.jpeg
    ├── Karim/
    │   └── karim.jpeg
    └── Yaman/
        └── yaman.jpeg
```

> **Each subfolder name must exactly match the Firestore document ID.**
> Folder `Ayham/` corresponds to the `users/Ayham` document. The folder name is what `main.py` displays on screen when that face is recognized.

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

On some systems you also need CMake and dlib:

```bash
pip install cmake dlib
```

On a Raspberry Pi, dlib compilation can take 20+ minutes; this is normal. Make sure you're on a Pi 5 (8 GB) for acceptable runtime performance.

### 2. Get your Firebase service-account key

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Open your project, then click **Project Settings → Service Accounts**.
3. Click **Generate New Private Key**. Confirm in the dialog. A JSON file downloads.
4. Rename the downloaded file to `serviceAccountKey.json` (the filename is hardcoded; the pipeline will not find it under any other name).
5. Place it in this `face_project/` folder.

The file is gitignored (`**/*serviceAccount*.json`) so you cannot accidentally commit it. Never share this file: it grants full admin access to your Firestore.

### 3. Add face photos

Each enrolled person needs their own subfolder under `known_faces/` containing at least one clear, frontal photo:

```
known_faces/
├── Ayham/
│   └── ayham.jpeg
├── Karam/
│   └── karam.jpeg
...
```

- Use clear, well-lit, frontal photos.
- More photos per person improves accuracy. The shipped enrollment uses one photo per person to mirror the realistic school ID-photo workflow; you can add more.
- JPG, JPEG, or PNG.

### 4. Encode the gallery (run once per change)

```bash
python encode_faces.py
```

This reads `known_faces/` and your Firestore `users/` documents and writes the 128-d embeddings to `encodings.pkl`. Re-run whenever you add students or photos.

### 5. Run the pipeline

```bash
python main.py
```

The recognition loop opens the camera and begins scanning. Press **Q** to quit.

---

## What gets logged to Firebase

Every recognized student creates a document in the `attendance` collection:

```
attendance/{auto-id}
├── name:        "Ayham"
├── permission:  "Student"
├── active:      true
├── timestamp:   "2026-03-06T08:32:11"
├── date:        "2026-03-06"
└── time:        "08:32:11"
```

---

## What you see on screen

| Face detected | Box color | Message |
|---|---|---|
| Registered, active student | Green | Name + permission |
| Registered but inactive | Yellow | Name + "Inactive: not registered" |
| Unknown face | Red | "Unknown: not registered in this bus" |

---

## Tuning

In `main.py`, adjust these constants:

| Setting | Default | Notes |
|---|---|---|
| `TOLERANCE` | `0.5` | Lower = stricter. Try `0.45` if false matches occur. |
| `COOLDOWN_SEC` | `5` | Seconds between re-logging the same person. |
| `FRAME_SCALE` | `0.5` | `0.25` for faster CPU, `0.75` for better accuracy. |

---

## Demo seeding (optional)

If you want a Firebase project pre-loaded with the showcase demo accounts, roles, fleet, and sample attendance, see `seed_demo.py`. It uses a separate key (`serviceAccountKey-demo.json`) so it can target the `smartbus-showcase` project without clobbering your real one.

```bash
python seed_demo.py
```

Idempotent: every write uses `merge=True` so re-running is safe.

---

## Evaluation

`evaluate.py` measures precision, recall, F1, and end-to-end latency against a labeled scan log. The shipped numbers (1.89 s avg latency, tolerance 0.50, 40 events) come from running this against the four-person team gallery; see [RESULTS.md](../RESULTS.md) when it lands.

---

## Troubleshooting

**`No face found in photo`**: use a clear, front-facing photo with good lighting.

**`dlib` install fails**: install CMake first (`pip install cmake`), then retry.

**Firebase permission denied**: verify your Firestore security rules allow the writes the pipeline is making, and that the service-account key is for the right project.

**Wrong person identified**: add more photos per student and lower `TOLERANCE` to `0.45`.

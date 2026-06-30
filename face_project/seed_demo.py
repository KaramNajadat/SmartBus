"""
seed_demo.py
============
One-shot seeder for the SmartBus public showcase Firebase project
(`smartbus-showcase`). Run this ONCE after creating the project to set up:

  - 3 demo auth users (parent, bus admin, school admin) with strong-ish creds
  - 3 fake students assigned to the demo parent
  - 1 demo bus with route metadata
  - A static bus_location so the live map renders on first load
  - 2 sample attendance records for today so dashboards have content

Idempotent: every write uses set(..., merge=True) or update-or-create patterns,
so re-running won't duplicate or break anything.

Usage:
    cd face_project
    python seed_demo.py

Requires `serviceAccountKey-demo.json` in this folder (download from the
smartbus-showcase Firebase Console: Project Settings -> Service accounts ->
Generate new private key). This file MUST stay gitignored.

Uses the Admin SDK, so it bypasses Firestore security rules.
"""

import sys
import io
from datetime import datetime, timezone

# Windows console UTF-8 fix
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import firebase_admin
from firebase_admin import credentials, auth, firestore

SERVICE_ACCOUNT = "serviceAccountKey-demo.json"

# ── Demo credentials ──────────────────────────────────────────────────────────
# These will be published in the public README. Strong-ish to deter drive-by
# bots, not Fort Knox. Edit before first run if you want different values.
DEMO_PARENT = {
    "email":        "demo.parent@example.com",
    "password":     "DemoParent-9R7kX2Lq",
    "display_name": "Demo Parent",
}
DEMO_BUS_ADMIN = {
    "email":        "demo.busadmin@example.com",
    "password":     "DemoBusAdmin-4Vn8Mt6Z",
    "display_name": "Demo Bus Admin",
}
DEMO_SCHOOL_ADMIN = {
    "email":        "demo.schooladmin@example.com",
    "password":     "DemoSchoolAdmin-7Hb3Pq9F",
    "display_name": "Demo School Admin",
}

# ── Demo fleet & students ─────────────────────────────────────────────────────
DEMO_BUS = {
    "id":         "DEMO_BUS",
    "route":      "Demo Route — Ajman University",
    "driver":     "Demo Driver",
    "supervisor": "Demo Supervisor",
    "capacity":   20,
    "color":      "#F59E0B",
}

DEMO_STUDENTS = ["Karam", "Ayham", "Yaman", "Karim"]

DEMO_DROPOFF = "Ajman University — Main Gate"

# A reasonable static GPS pin (Ajman University, near main campus).
DEMO_BUS_LOCATION = {"lat": 25.4052, "lng": 55.5136}


def ensure_user(email, password, display_name):
    """Create or update an auth user. Returns the uid."""
    try:
        user = auth.get_user_by_email(email)
        auth.update_user(user.uid, password=password, display_name=display_name)
        print(f"   [OK] auth user exists, refreshed: {email} -> {user.uid}")
    except auth.UserNotFoundError:
        user = auth.create_user(email=email, password=password, display_name=display_name)
        print(f"   [NEW] created auth user: {email} -> {user.uid}")
    return user.uid


def main():
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("=" * 60)
    print("  SmartBus showcase demo seed")
    print("=" * 60)

    # 1. Auth users
    print("\n1) Auth users")
    parent_uid       = ensure_user(**DEMO_PARENT)
    bus_admin_uid    = ensure_user(**DEMO_BUS_ADMIN)
    school_admin_uid = ensure_user(**DEMO_SCHOOL_ADMIN)

    # 2. Role docs
    print("\n2) Role docs (/roles)")
    db.collection("roles").document(parent_uid).set({
        "role": "parent",
        "busId": DEMO_BUS["id"],
        "childNames": DEMO_STUDENTS,
        "dropOffLocation": DEMO_DROPOFF,
    }, merge=True)
    print(f"   [OK] roles/{parent_uid} (parent)")

    db.collection("roles").document(bus_admin_uid).set({
        "role": "bus_admin",
        "busId": DEMO_BUS["id"],
    }, merge=True)
    print(f"   [OK] roles/{bus_admin_uid} (bus_admin)")

    db.collection("roles").document(school_admin_uid).set({
        "role": "school_admin",
    }, merge=True)
    print(f"   [OK] roles/{school_admin_uid} (school_admin)")

    # 3. Bus fleet
    print("\n3) Fleet (/buses)")
    bus_data = {k: v for k, v in DEMO_BUS.items() if k != "id"}
    db.collection("buses").document(DEMO_BUS["id"]).set(bus_data, merge=True)
    print(f"   [OK] buses/{DEMO_BUS['id']}")

    # 4. Students
    print("\n4) Students (/users)")
    for name in DEMO_STUDENTS:
        db.collection("users").document(name).set({
            "Name": name,
            "name": name,
            "bus": DEMO_BUS["id"],
        }, merge=True)
        print(f"   [OK] users/{name}")

    # 5. Bus location (static pin so the live map renders)
    print("\n5) Bus location (/bus_location)")
    db.collection("bus_location").document(DEMO_BUS["id"]).set({
        **DEMO_BUS_LOCATION,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    print(f"   [OK] bus_location/{DEMO_BUS['id']}")

    # 6. Sample attendance for today (idempotent via deterministic doc ids)
    print("\n6) Sample attendance (/attendance)")
    sample_events = [
        (DEMO_STUDENTS[0], "boarded",     "07:32"),
        (DEMO_STUDENTS[1], "boarded",     "07:34"),
        (DEMO_STUDENTS[2], "boarded",     "07:38"),
        (DEMO_STUDENTS[3], "dropped_off", "14:45"),
    ]
    for name, event, time_str in sample_events:
        doc_id = f"{today}_{name.replace(' ', '_')}_{event}"
        db.collection("attendance").document(doc_id).set({
            "name": name,
            "bus": DEMO_BUS["id"],
            "date": today,
            "time": time_str,
            "event": event,
            "confidence": 0.97,
        }, merge=True)
        print(f"   [OK] attendance/{doc_id}")

    # Summary
    print("\n" + "=" * 60)
    print("  Done. Demo credentials for the public README:")
    print("=" * 60)
    for label, acct in (
        ("Parent",       DEMO_PARENT),
        ("Bus Admin",    DEMO_BUS_ADMIN),
        ("School Admin", DEMO_SCHOOL_ADMIN),
    ):
        print(f"  {label:13s}  email: {acct['email']}")
        print(f"  {'':13s}  password: {acct['password']}")
    print()
    print(f"  Demo bus:  {DEMO_BUS['id']} ({DEMO_BUS['route']})")
    print(f"  Students:  {', '.join(DEMO_STUDENTS)}")
    print()


if __name__ == "__main__":
    main()

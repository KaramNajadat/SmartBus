"""
Firebase Service
=================
Handles all Firestore reads and writes for the bus recognition system.
"""

import os
import json
import requests
os.environ["GRPC_DNS_RESOLVER"] = "native"
os.environ["GRPC_POLL_STRATEGY"] = "poll"

import firebase_admin
from firebase_admin import credentials, firestore
import google.auth.transport.requests
from datetime import datetime


class FirebaseService:
    def __init__(self, key_path="serviceAccountKey.json"):
        """
        Initializes the Firebase Admin SDK.
        key_path: path to your downloaded serviceAccountKey.json
        """
        if not firebase_admin._apps:
            self.cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(self.cred)
        else:
            self.cred = firebase_admin.get_app().credential

        self.db = firestore.client()
        self.key_path = key_path
        
        # --- NEW: Setup the Token Generator for our REST Bypass ---
        self.google_cred = self.cred.get_credential()
        self.auth_request = google.auth.transport.requests.Request()

        with open(key_path, "r") as f:
            self.project_id = json.load(f)["project_id"]

    # ── Read ────────────────────────────────────────────────────────────────

    def get_all_users(self) -> dict:
        users = {}
        docs = self.db.collection("users").stream()
        for doc in docs:
            users[doc.id] = doc.to_dict()
        return users

    def get_user(self, name: str):
        doc = self.db.collection("users").document(name).get()
        return doc.to_dict() if doc.exists else None

    # ── Write (The Authenticated REST API Bypass) ───────────────────────────

    @staticmethod
    def detect_bus_mode():
        """Auto-detect the current bus operations mode based on time of day."""
        now = datetime.now()
        total_minutes = now.hour * 60 + now.minute

        if total_minutes < 450:            # before 7:30
            return "morning_pickup"
        elif total_minutes < 510:         # 7:30 – 8:29
            return "school_arrival"
        elif total_minutes < 850:         # 8:30 – 14:09
            return "afternoon_boarding"
        else:                             # 14:10+
            return "homebound_dropoff"

    def log_attendance(self, name, permission, active, bus_id="BUS_01", bus_mode=None, lat=None, lon=None):
        try:
            # Auto-detect mode if not provided
            if bus_mode is None:
                bus_mode = self.detect_bus_mode()

            # 1. Refresh our VIP admin token if it expired
            if not self.google_cred.valid:
                self.google_cred.refresh(self.auth_request)

            # 2. Build the URL and staple the Admin Token to the Headers
            url = f"https://firestore.googleapis.com/v1/projects/{self.project_id}/databases/(default)/documents/attendance"
            headers = {
                "Authorization": f"Bearer {self.google_cred.token}",
                "Content-Type": "application/json"
            }

            # 4. Format the payload perfectly (Matches Schema expected by React Dashboard)
            now = datetime.now()
            payload = {
                "fields": {
                    "name": {"stringValue": name},
                    "permission": {"stringValue": permission},
                    "active": {"booleanValue": active},
                    "bus_id": {"stringValue": bus_id},
                    "bus_mode": {"stringValue": bus_mode},
                    "date": {"stringValue": now.strftime("%Y-%m-%d")},
                    "time": {"stringValue": now.strftime("%H:%M:%S")},
                    "timestamp": {"stringValue": now.isoformat()}
                }
            }
            
            # Include GPS coordinates if available
            if lat is not None and lon is not None:
                payload["fields"]["latitude"] = {"doubleValue": float(lat)}
                payload["fields"]["longitude"] = {"doubleValue": float(lon)}

            # 5. Fire the unblockable, authenticated web request
            response = requests.post(url, headers=headers, json=payload, timeout=5.0)

            if response.status_code == 200:
                print(f"  [LOG] Successfully logged {name} (mode: {bus_mode})")
            else:
                print(f"  [WARN] REST API Error for {name}: {response.text}")

        except Exception as e:
            # This line will now print the EXACT reason Python failed!
            print(f"  [WARN] Firebase Error for {name}: {repr(e)}")

    def mark_user_active(self, name: str, active: bool):
        self.db.collection("users").document(name).update({"Active": active})

    def update_bus_location(self, bus_id, lat, lon):
        try:
            now = datetime.now()
            doc_ref = self.db.collection("bus_location").document(bus_id)
            doc_ref.set({
                "busId": bus_id,
                "lat": lat,
                "lng": lon,
                "busStatus": self.detect_bus_mode(),
                "last_updated": now.isoformat(),
            }, merge=True)
        except Exception as e:
            print(f"  [WARN] Failed to update bus location: {repr(e)}")

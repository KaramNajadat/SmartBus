"""
encode_faces.py
================
Run this ONCE after adding new photos to known_faces/.
It encodes all faces and saves them to 'encodings.pkl' so the main
system loads instantly without re-processing images every time.

Usage:
    python encode_faces.py
"""

import face_recognition
import os
import pickle
from firebase_service import FirebaseService

KNOWN_FACES_DIR = "known_faces"
OUTPUT_FILE     = "encodings.pkl"


def encode_all_faces():
    print("\n==================================")
    print("      Face Encoding Generator     ")
    print("==================================\n")

    firebase = FirebaseService()
    users    = firebase.get_all_users()

    all_encodings = []
    all_metadata  = []

    if not os.path.isdir(KNOWN_FACES_DIR):
        print(f"[ERROR] '{KNOWN_FACES_DIR}' folder not found.")
        print("Create it and add subfolders named after each student.")
        return

    for person_name in sorted(os.listdir(KNOWN_FACES_DIR)):
        person_dir = os.path.join(KNOWN_FACES_DIR, person_name)
        if not os.path.isdir(person_dir):
            continue

        fb_data = users.get(person_name, {})
        count   = 0

        for img_file in os.listdir(person_dir):
            if not img_file.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            img_path = os.path.join(person_dir, img_file)
            print(f"  Processing: {img_path}")

            image  = face_recognition.load_image_file(img_path)
            faces  = face_recognition.face_encodings(image)

            if not faces:
                print(f"  [WARN] No face detected in {img_file} - skipping.")
                continue

            # Use the first face found (photos should have only one person)
            all_encodings.append(faces[0])
            all_metadata.append({
                "name":       person_name,
                "active":     fb_data.get("Active", True),
                "permission": fb_data.get("Permission", "Unknown"),
            })
            count += 1

        print(f"  [*] {person_name}: {count} encoding(s) saved\n")

    with open(OUTPUT_FILE, "wb") as f:
        pickle.dump({"encodings": all_encodings, "metadata": all_metadata}, f)

    print(f"[*] Saved {len(all_encodings)} total encodings -> {OUTPUT_FILE}")
    print("  Run main.py to start recognition.\n")


if __name__ == "__main__":
    encode_all_faces()

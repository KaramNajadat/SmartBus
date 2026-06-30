"""
"""

import cv2
import face_recognition
import numpy as np
import sys
import numpy.core.multiarray
sys.modules['numpy._core'] = sys.modules['numpy.core']
sys.modules['numpy._core.multiarray'] = sys.modules['numpy.core.multiarray']

import os
import time
import pickle
import threading
import serial
import pynmea2
from datetime import datetime
from firebase_service import FirebaseService

TOLERANCE    = 0.5
FRAME_SCALE  = 0.65  # Lowered for massive performance boost
COOLDOWN_SEC = 5
BUS_ID       = "BUS_01"

GREEN  = (0, 200, 80)
RED    = (0, 60, 220)
YELLOW = (0, 200, 255)
WHITE  = (255, 255, 255)
GRAY   = (160, 160, 160)

# Global GPS state
current_gps = {"lat": None, "lon": None}

def gps_loop():
    """Reads from Neo-6M GPS via serial port and parses NMEA sentences."""
    try:
        ser = serial.Serial('/dev/ttyAMA0', baudrate=9600, timeout=1)
        print("[GPS] Serial port opened successfully")
        while True:
            try:
                line = ser.readline().decode('ascii', errors='replace').strip()
                if not line:
                    continue
                if line.startswith('$'):
                    print(f"[RAW] {line}")
                if line.startswith('$GPRMC') or line.startswith('$GPGGA') or \
                   line.startswith('$GNRMC') or line.startswith('$GNGGA'):
                    msg = pynmea2.parse(line)
                    if hasattr(msg, 'latitude') and hasattr(msg, 'longitude'):
                        if msg.latitude != 0.0 and msg.longitude != 0.0:
                            current_gps["lat"] = msg.latitude
                            current_gps["lon"] = msg.longitude
                            print(f"[GPS] Fix: lat={msg.latitude:.6f}, lon={msg.longitude:.6f}")
                        else:
                            print("[GPS] Sentence parsed but no fix yet (0.0, 0.0)")
            except pynmea2.ParseError:
                pass
            except Exception as e:
                print(f"[WARN] GPS Parse Error: {e}")
                time.sleep(1)
    except Exception as e:
        print(f"[WARN] GPS Setup Error (Check /dev/serial0): {e}")

def location_updater_loop(firebase, bus_id):
    """Pushes the current GPS location to Firebase every 10 seconds."""
    while True:
        lat = current_gps["lat"]
        lon = current_gps["lon"]
        if lat is not None and lon is not None:
            firebase.update_bus_location(bus_id, lat, lon)
            print(f"[GPS->Firebase] Pushed lat={lat:.6f}, lon={lon:.6f}")
        else:
            print("[GPS->Firebase] No GPS fix yet, skipping update")
        time.sleep(10)

def find_webcam(ip_url=None):
    """Try IP webcam URL first, then camera indices 0-4."""
    if ip_url:
        print(f"Attempting to connect to IP webcam: {ip_url}")
        cap = cv2.VideoCapture(ip_url)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                print(f"[*] Successfully connected to IP webcam")
                return cap
        print(f"[WARN] Failed to connect to IP webcam at {ip_url}, falling back to USB cameras.")
        
    use_dshow = sys.platform == "win32"
    for index in range(5):
        if use_dshow:
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    print(f"[*] Found webcam at index {index} (DirectShow)")
                    return cap
                cap.release()
        cap = cv2.VideoCapture(index)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                print(f"[*] Found webcam at index {index}")
                return cap
            cap.release()
    return None


def draw_overlay(frame, box, label_lines, color):
    top, right, bottom, left = box
    cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
    card_h = 28 * len(label_lines) + 10
    cv2.rectangle(frame, (left, bottom), (right, bottom + card_h), color, -1)
    for i, line in enumerate(label_lines):
        y = bottom + 22 + i * 28
        cv2.putText(frame, line, (left + 6, y),
                    cv2.FONT_HERSHEY_DUPLEX, 0.65, WHITE, 1, cv2.LINE_AA)


def draw_status_bar(frame, text, color):
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 50), color, -1)
    cv2.addWeighted(overlay, 0.45, frame, 0.55, 0, frame)
    cv2.putText(frame, text, (14, 34),
                cv2.FONT_HERSHEY_DUPLEX, 0.9, WHITE, 1, cv2.LINE_AA)


def main():
    print("\n==================================")
    print("   Bus Face Recognition System   ")
    print("==================================\n")

    # Mode labels for display
    MODE_LABELS = {
        "morning_pickup": "Morning Pickup",
        "school_arrival": "School Arrival",
        "afternoon_boarding": "Afternoon Boarding",
        "homebound_dropoff": "Homebound Drop-off",
    }

    # 1. Load encodings
    if not os.path.exists("encodings.pkl"):
        print("[ERROR] encodings.pkl not found!")
        return

    with open("encodings.pkl", "rb") as f:
        data = pickle.load(f)
    known_encodings = data["encodings"]
    known_metadata  = data["metadata"]
    print(f"[*] Loaded {len(known_encodings)} face encodings\n")

    # 2. Connect to Firebase
    try:
        firebase = FirebaseService()
        print("[*] Connected to Firebase\n")
        use_firebase = True
    except Exception as e:
        print(f"[WARN] Firebase not connected: {e}")
        use_firebase = False

    # Start GPS parsing thread
    threading.Thread(target=gps_loop, daemon=True).start()
    
    # Start periodic location updater if Firebase is connected
    if use_firebase:
        threading.Thread(target=location_updater_loop, args=(firebase, BUS_ID), daemon=True).start()

    # 3. Handle Headless Environments (e.g. Raspberry Pi via SSH)
    headless_mode = os.environ.get("HEADLESS", "0") == "1"
    if headless_mode:
        print("[*] Running in headless mode (no video preview).")

    # 4. Find and open webcam automatically
    print("Searching for USB webcam...")
    
    cap = find_webcam(ip_url=None)
    
    if cap is None:
        print("[ERROR] No webcam found. Please connect a camera and retry.")
        return

    # --- C920s HARDWARE OPTIMIZATIONS ---
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    print("Press Q or Ctrl+C to quit.\n")

    last_logged = {}
    error_count = 0
    
    # --- Variables for Frame Skipping ---
    frame_count = 0
    current_locations = []
    current_names = []
    current_statuses = []
    current_colors = []

    try:
        while True:
            ret, frame = cap.read()

            if not ret or frame is None:
                error_count += 1
                if error_count > 30:
                    print("[ERROR] Webcam stopped sending frames.")
                    break
                time.sleep(0.05)
                continue

            error_count = 0

            if frame.dtype != np.uint8:
                frame = np.clip(frame, 0, 255).astype(np.uint8)

            small = cv2.resize(frame, (0, 0), fx=FRAME_SCALE, fy=FRAME_SCALE)
            rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

            frame_count += 1

            # ONLY DO HEAVY AI MATH EVERY 3 FRAMES
            if frame_count % 3 == 0:
                current_locations = face_recognition.face_locations(rgb, model="hog")
                encodings = face_recognition.face_encodings(rgb, current_locations)

                # Reset arrays for this frame
                current_names = []
                current_statuses = []
                current_colors = []

                for enc in encodings:
                    distances = face_recognition.face_distance(known_encodings, enc)

                    if len(distances) == 0 or np.min(distances) > TOLERANCE:
                        current_names.append("Unknown")
                        current_statuses.append("Not registered in this bus")
                        current_colors.append(RED)
                    else:
                        idx    = np.argmin(distances)
                        person = known_metadata[idx]
                        name   = person["name"]
                        perm   = person["permission"]
                        active = person["active"]

                        color  = GREEN if active else YELLOW
                        status = perm if active else "Inactive - not registered"

                        current_names.append(name)
                        current_statuses.append(status)
                        current_colors.append(color)

                        # --- BACKGROUND THREADING LOGIC ---
                        now = time.time()
                        if use_firebase and (name not in last_logged or (now - last_logged[name]) > COOLDOWN_SEC):
                            last_logged[name] = now
                            current_mode = FirebaseService.detect_bus_mode()
                            print(f"  [LOG] Sending {name} to Firebase (mode: {current_mode})...")
                            
                            threading.Thread(
                                target=firebase.log_attendance, 
                                args=(name, perm, active, BUS_ID, current_mode), 
                                daemon=True
                            ).start()

            # ALWAYS DRAW THE BOXES (using data saved from the last successful AI scan)
            for loc, name, status, color in zip(current_locations, current_names, current_statuses, current_colors):
                top, right, bottom, left = [int(v / FRAME_SCALE) for v in loc]
                box = (top, right, bottom, left)
                draw_overlay(frame, box, [name, status], color)

            # Display correct UI status bar using the cached lists
            bus_mode = FirebaseService.detect_bus_mode() if use_firebase else "unknown"
            mode_label = MODE_LABELS.get(bus_mode, bus_mode)
            if not current_locations:
                draw_status_bar(frame, f"[{mode_label}] Scanning for faces...", GRAY)
            else:
                people   = ", ".join(n for n in current_names if n != "Unknown")
                unknowns = current_names.count("Unknown")
                parts    = []
                if people:   parts.append(people)
                if unknowns: parts.append(f"{unknowns} unknown")
                draw_status_bar(frame, "Detected: " + " | ".join(parts), GREEN)

            # Draw camera feed (happens every single frame, no stuttering)
            if not headless_mode:
                cv2.imshow("Bus Recognition System - Press Q to quit", frame)

            if not headless_mode:
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            else:
                time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n[*] Caught KeyboardInterrupt, stopping system...")
    
    finally:
        cap.release()
        if not headless_mode:
            cv2.destroyAllWindows()
        print("\n[*] System stopped.")


if __name__ == "__main__":
    main()

"""
evaluate.py
===========
Runs a proper evaluation of the face recognition system against a labeled
test dataset. Computes precision, recall, F1, accuracy, confusion matrix,
and per-image latency statistics.

Test dataset structure:
    test_faces/
    ├── Ayham/          # Test photos of Ayham (ground truth = "Ayham")
    ├── Karam/          # Test photos of Karam
    ├── Karim/          # Test photos of Karim
    ├── Yaman/          # Test photos of Yaman
    └── Unknown/        # Photos of people NOT enrolled (ground truth = "Unknown")

Usage:
    python evaluate.py                          # uses default test_faces/ dir
    python evaluate.py --test-dir my_test_set   # custom test directory
    python evaluate.py --tolerance 0.45         # override tolerance
"""

import argparse
import csv
import face_recognition
import json
import numpy as np
import os
import pickle
import time
from collections import defaultdict
from datetime import datetime


def load_encodings(path="encodings.pkl"):
    with open(path, "rb") as f:
        data = pickle.load(f)
    return data["encodings"], data["metadata"]


def recognize_face(image_path, known_encodings, known_metadata, tolerance):
    image = face_recognition.load_image_file(image_path)

    t0 = time.perf_counter()
    locations = face_recognition.face_locations(image, model="hog")
    encodings = face_recognition.face_encodings(image, locations)
    elapsed = time.perf_counter() - t0

    if not encodings:
        return None, elapsed  # no face detected

    enc = encodings[0]
    distances = face_recognition.face_distance(known_encodings, enc)

    if len(distances) == 0 or np.min(distances) > tolerance:
        return "Unknown", elapsed

    idx = np.argmin(distances)
    return known_metadata[idx]["name"], elapsed


def run_evaluation(test_dir, known_encodings, known_metadata, tolerance):
    results = []
    labels = set()

    for person_name in sorted(os.listdir(test_dir)):
        person_dir = os.path.join(test_dir, person_name)
        if not os.path.isdir(person_dir):
            continue

        labels.add(person_name)

        for img_file in sorted(os.listdir(person_dir)):
            if not img_file.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            img_path = os.path.join(person_dir, img_file)
            predicted, latency = recognize_face(
                img_path, known_encodings, known_metadata, tolerance
            )

            if predicted is None:
                predicted = "No Face Detected"

            correct = predicted == person_name
            results.append({
                "ground_truth": person_name,
                "predicted": predicted,
                "correct": correct,
                "latency_s": round(latency, 4),
                "file": img_path,
            })

            symbol = "OK" if correct else "MISS"
            print(f"  [{symbol}] {img_file:30s}  truth={person_name:10s}  pred={predicted:10s}  {latency:.3f}s")

    return results, sorted(labels)


def compute_metrics(results, labels):
    all_labels = sorted(set(labels) | {"Unknown", "No Face Detected"})

    matrix = defaultdict(lambda: defaultdict(int))
    for r in results:
        matrix[r["ground_truth"]][r["predicted"]] += 1

    per_class = {}
    for label in labels:
        tp = matrix[label].get(label, 0)
        fp = sum(matrix[other].get(label, 0) for other in all_labels if other != label)
        fn = sum(matrix[label].get(other, 0) for other in all_labels if other != label)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        per_class[label] = {
            "tp": tp, "fp": fp, "fn": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }

    total = len(results)
    correct = sum(1 for r in results if r["correct"])
    accuracy = correct / total if total > 0 else 0.0

    latencies = [r["latency_s"] for r in results]

    return {
        "total_images": total,
        "correct": correct,
        "accuracy": round(accuracy, 4),
        "per_class": per_class,
        "latency": {
            "mean": round(np.mean(latencies), 4),
            "median": round(np.median(latencies), 4),
            "min": round(np.min(latencies), 4),
            "max": round(np.max(latencies), 4),
            "std": round(np.std(latencies), 4),
        },
        "confusion_matrix": {gt: dict(preds) for gt, preds in matrix.items()},
    }


def print_report(metrics, labels, tolerance):
    print("\n" + "=" * 60)
    print("       FACE RECOGNITION EVALUATION REPORT")
    print("=" * 60)
    print(f"  Date:       {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Tolerance:  {tolerance}")
    print(f"  Model:      HOG (dlib)")
    print(f"  Images:     {metrics['total_images']}")
    print(f"  Correct:    {metrics['correct']}")
    print(f"  Accuracy:   {metrics['accuracy'] * 100:.1f}%")

    print("\n--- Per-Class Metrics ---")
    print(f"  {'Class':15s} {'TP':>4s} {'FP':>4s} {'FN':>4s} {'Prec':>7s} {'Recall':>7s} {'F1':>7s}")
    print("  " + "-" * 52)
    for label in labels:
        m = metrics["per_class"].get(label)
        if m:
            print(f"  {label:15s} {m['tp']:4d} {m['fp']:4d} {m['fn']:4d} {m['precision']:7.2%} {m['recall']:7.2%} {m['f1']:7.2%}")

    macro_p = np.mean([m["precision"] for m in metrics["per_class"].values()])
    macro_r = np.mean([m["recall"] for m in metrics["per_class"].values()])
    macro_f1 = np.mean([m["f1"] for m in metrics["per_class"].values()])
    print("  " + "-" * 52)
    print(f"  {'Macro Avg':15s} {'':4s} {'':4s} {'':4s} {macro_p:7.2%} {macro_r:7.2%} {macro_f1:7.2%}")

    print("\n--- Latency (seconds) ---")
    lat = metrics["latency"]
    print(f"  Mean:   {lat['mean']:.4f}s")
    print(f"  Median: {lat['median']:.4f}s")
    print(f"  Min:    {lat['min']:.4f}s")
    print(f"  Max:    {lat['max']:.4f}s")
    print(f"  Std:    {lat['std']:.4f}s")

    print("\n--- Confusion Matrix ---")
    all_preds = sorted(set(
        pred for row in metrics["confusion_matrix"].values() for pred in row
    ))
    header = f"  {'Truth \\ Pred':15s}" + "".join(f"{p:>12s}" for p in all_preds)
    print(header)
    print("  " + "-" * (15 + 12 * len(all_preds)))
    for gt in labels:
        row = metrics["confusion_matrix"].get(gt, {})
        cells = "".join(f"{row.get(p, 0):12d}" for p in all_preds)
        print(f"  {gt:15s}{cells}")

    print("\n" + "=" * 60)


def save_results(results, metrics, output_dir="eval_results"):
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    csv_path = os.path.join(output_dir, f"eval_{timestamp}.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "ground_truth", "predicted", "correct", "latency_s"])
        writer.writeheader()
        writer.writerows(results)

    json_path = os.path.join(output_dir, f"eval_{timestamp}.json")
    with open(json_path, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\n  Results saved to:")
    print(f"    {csv_path}")
    print(f"    {json_path}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate face recognition accuracy")
    parser.add_argument("--test-dir", default="test_faces", help="Path to labeled test images")
    parser.add_argument("--encodings", default="encodings.pkl", help="Path to encodings file")
    parser.add_argument("--tolerance", type=float, default=0.50, help="Face distance tolerance")
    parser.add_argument("--no-save", action="store_true", help="Skip saving results to disk")
    args = parser.parse_args()

    if not os.path.isdir(args.test_dir):
        print(f"[ERROR] Test directory '{args.test_dir}' not found.")
        print(f"\nCreate it with this structure:")
        print(f"  {args.test_dir}/")
        print(f"  ├── Ayham/      (test photos of Ayham)")
        print(f"  ├── Karam/      (test photos of Karam)")
        print(f"  ├── Karim/      (test photos of Karim)")
        print(f"  ├── Yaman/      (test photos of Yaman)")
        print(f"  └── Unknown/    (photos of non-enrolled people)")
        return

    if not os.path.exists(args.encodings):
        print(f"[ERROR] Encodings file '{args.encodings}' not found. Run encode_faces.py first.")
        return

    known_encodings, known_metadata = load_encodings(args.encodings)
    print(f"[*] Loaded {len(known_encodings)} enrolled face encodings")
    print(f"[*] Tolerance: {args.tolerance}")
    print(f"[*] Test dir: {args.test_dir}\n")

    results, labels = run_evaluation(args.test_dir, known_encodings, known_metadata, args.tolerance)

    if not results:
        print("[ERROR] No test images found.")
        return

    metrics = compute_metrics(results, labels)
    print_report(metrics, labels, args.tolerance)

    if not args.no_save:
        save_results(results, metrics)


if __name__ == "__main__":
    main()

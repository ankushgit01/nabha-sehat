"""
Train the on-device symptom → urgency classifier.

    python ml/train.py                       # synthetic bootstrap data (see labeling_rules.py)
    python ml/train.py --data cases.csv      # real clinician-labelled data (preferred)

Outputs
  src/assets/models/triage_mlp_v<N>.json  — weights for the pure-TypeScript runtime (default engine)
  src/assets/models/triage_mlp_v<N>.tflite — same network as TFLite, ONLY if `tensorflow` is installed
  ml/report.json                           — metrics incl. emergency recall (the number that matters most)

Architecture: one-hot symptoms + 4 modifiers → Dense(32, relu) → Dense(4, softmax).
Tiny on purpose: ~1.3k parameters, <1 ms inference on a 2 GB Android phone, ~15 KB on disk.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

sys.path.insert(0, str(Path(__file__).parent))
from labeling_rules import TIERS, T, label_case  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
VOCAB = json.loads((ROOT / "src/features/triage/symptoms.json").read_text(encoding="utf-8"))
SYMPTOMS = [s["id"] for s in VOCAB["symptoms"]]
MODIFIERS = VOCAB["modifiers"]
FEATURES = SYMPTOMS + MODIFIERS
BASE = {s["id"]: T[s["tier"]] for s in VOCAB["symptoms"]}
MODEL_VERSION = 1

# Rough prior on how often each symptom is reported in rural OPD (common first). Tunable.
COMMON = {"fever": 8, "cough": 6, "cold": 6, "body_ache": 5, "headache": 5, "weakness": 4, "stomach_pain": 4,
          "diarrhea": 3, "vomiting": 3, "rash": 3, "high_fever": 2, "dizziness": 2, "burning_urine": 2,
          "wound_minor": 2, "breathlessness": 1.5, "chest_pain": 1.2}


def encode(symptoms: set[str], child: bool, elderly: bool, pregnant: bool, long_dur: bool) -> list[float]:
    v = [1.0 if s in symptoms else 0.0 for s in SYMPTOMS]
    return v + [float(child), float(elderly), float(pregnant), float(long_dur)]


def synthesise(n: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = random.Random(seed)
    weights = [COMMON.get(s, 0.6) for s in SYMPTOMS]
    X, y = [], []
    for _ in range(n):
        k = rng.choices([1, 2, 3, 4, 5], weights=[30, 35, 20, 10, 5])[0]
        picked: set[str] = set()
        while len(picked) < k:
            picked.add(rng.choices(SYMPTOMS, weights=weights)[0])
        age = rng.choices(["child", "adult", "elderly"], weights=[25, 55, 20])[0]
        child, elderly = age == "child", age == "elderly"
        pregnant = (not child) and (not elderly) and rng.random() < 0.08
        if not pregnant:
            picked -= {"preg_bleeding", "labour_pain"}
            if not picked:
                picked = {"fever"}
        long_dur = rng.random() < 0.2
        label = label_case(picked, BASE, child, elderly, pregnant, long_dur)
        # 2% annotator noise, but NEVER relabel a true emergency downward: that would teach under-triage.
        if label != T["emergency"] and rng.random() < 0.02:
            label = max(0, min(2, label + rng.choice([-1, 1])))
        X.append(encode(picked, child, elderly, pregnant, long_dur))
        y.append(label)
    return np.array(X, dtype=np.float32), np.array(y)


def load_csv(path: Path) -> tuple[np.ndarray, np.ndarray]:
    X, y = [], []
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            syms = {s for s in row["symptoms"].split(";") if s in SYMPTOMS}
            X.append(encode(syms, row["age_group"] == "child", row["age_group"] == "elderly",
                            row["pregnant"] in ("1", "true"), float(row["duration_days"] or 0) > 7))
            y.append(T[row["urgency"]])
    return np.array(X, dtype=np.float32), np.array(y)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path)
    ap.add_argument("--n", type=int, default=40000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    X, y = load_csv(args.data) if args.data else synthesise(args.n, args.seed)
    source = str(args.data) if args.data else "SYNTHETIC (labeling_rules.py) — not clinically validated"
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=args.seed, stratify=y)

    # Class weights: up-weight emergency so the model errs toward over-triage.
    counts = np.bincount(ytr, minlength=4)
    sw = np.array([1.0, 1.0, 1.5, 3.0])[ytr] * (len(ytr) / (4 * counts[ytr]))
    clf = MLPClassifier(hidden_layer_sizes=(32,), activation="relu", max_iter=400, random_state=args.seed,
                        early_stopping=True, alpha=1e-4)
    try:
        clf.fit(Xtr, ytr, sample_weight=sw)  # sklearn >= 1.7 supports sample_weight for MLP
    except TypeError:
        clf.fit(Xtr, ytr)

    pred = clf.predict(Xte)
    cm = confusion_matrix(yte, pred, labels=[0, 1, 2, 3])
    emerg_recall = cm[3, 3] / max(1, cm[3].sum())
    under_triage = sum(cm[i, j] for i in range(4) for j in range(4) if j < i) / len(yte)
    report = {
        "model_version": MODEL_VERSION,
        "data_source": source,
        "n_train": int(len(ytr)),
        "n_test": int(len(yte)),
        "accuracy": float((pred == yte).mean()),
        "emergency_recall": float(emerg_recall),
        "under_triage_rate": float(under_triage),
        "confusion_matrix(rows=true,cols=pred)": cm.tolist(),
        "tiers": TIERS,
        "per_class": classification_report(yte, pred, target_names=TIERS, output_dict=True, zero_division=0),
    }
    (ROOT / "ml/report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("accuracy", "emergency_recall", "under_triage_rate")}, indent=2))

    r = lambda a: np.round(a, 5).tolist()  # noqa: E731
    out = {
        "format": "nabha-mlp-v1",
        "model_version": f"triage-mlp-{MODEL_VERSION}",
        "vocab_version": VOCAB["version"],
        "data_source": source,
        "features": FEATURES,
        "tiers": TIERS,
        "layers": [
            {"W": r(clf.coefs_[0]), "b": r(clf.intercepts_[0]), "activation": "relu"},
            {"W": r(clf.coefs_[1]), "b": r(clf.intercepts_[1]), "activation": "softmax"},
        ],
        "metrics": {k: report[k] for k in ("accuracy", "emergency_recall", "under_triage_rate")},
    }
    models = ROOT / "src/assets/models"
    models.mkdir(parents=True, exist_ok=True)
    json_path = models / f"triage_mlp_v{MODEL_VERSION}.json"
    json_path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {json_path} ({json_path.stat().st_size} bytes)")

    export_tflite(clf, models / f"triage_mlp_v{MODEL_VERSION}.tflite", X[:200])


def export_tflite(clf: MLPClassifier, path: Path, sample: np.ndarray) -> None:
    """Rebuild the identical network in Keras and convert. Skipped if TensorFlow is absent."""
    try:
        import tensorflow as tf  # type: ignore
    except ImportError:
        print("tensorflow not installed — skipping .tflite export (JSON engine is the default anyway)")
        return
    m = tf.keras.Sequential([
        tf.keras.Input(shape=(len(FEATURES),)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(4, activation="softmax"),
    ])
    m.layers[0].set_weights([clf.coefs_[0], clf.intercepts_[0]])
    m.layers[1].set_weights([clf.coefs_[1], clf.intercepts_[1]])
    assert np.allclose(m.predict(sample, verbose=0), clf.predict_proba(sample), atol=1e-4)
    conv = tf.lite.TFLiteConverter.from_keras_model(m)
    path.write_bytes(conv.convert())
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

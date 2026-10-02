"""
Clinician-editable labelling rules used to BOOTSTRAP training data.

!!! THIS IS NOT A VALIDATED CLINICAL DATASET !!!
No suitable open, labelled, Punjab-specific symptom→urgency dataset was available
when this was written, so ml/train.py synthesises cases and labels them with the
rules below. The resulting model therefore can only be as good as these rules.
Before any real deployment:
  1. A qualified medical advisor must review/sign off every rule here.
  2. Replace or augment the synthetic data with real, de-identified triage records
     labelled by clinicians (e.g. from the Nabha Civil Hospital OPD/emergency register),
     loaded via `--data path/to/cases.csv` (columns: symptoms;age_group;pregnant;duration_days;urgency).
Tiers are ordinal: 0 self_care, 1 routine, 2 urgent, 3 emergency.
"""
from __future__ import annotations

TIERS = ["self_care", "routine", "urgent", "emergency"]
T = {name: i for i, name in enumerate(TIERS)}


def label_case(symptoms: set[str], base_tier: dict[str, int], child: bool, elderly: bool,
               pregnant: bool, long_duration: bool) -> int:
    tier = max((base_tier[s] for s in symptoms), default=0)
    s = symptoms

    def has(*xs: str) -> bool:
        return all(x in s for x in xs)

    def any_of(*xs: str) -> bool:
        return any(x in s for x in xs)

    # --- Emergency combinations (also enforced at runtime by redFlags.ts) ---
    if has("chest_pain", "breathlessness"):
        tier = max(tier, T["emergency"])
    if has("breathlessness", "swelling_face"):  # possible anaphylaxis
        tier = max(tier, T["emergency"])
    if any_of("fever", "high_fever") and "confusion" in s:  # possible meningitis/sepsis/cerebral malaria
        tier = max(tier, T["emergency"])
    if "chest_pain" in s and elderly:
        tier = max(tier, T["emergency"])
    if "confusion" in s and elderly and "weakness" in s:  # possible stroke
        tier = max(tier, T["emergency"])
    if "breathlessness" in s and child and any_of("fever", "high_fever"):  # possible pneumonia in child
        tier = max(tier, T["emergency"])

    # --- Urgent combinations ---
    if "high_fever" in s and (child or elderly or pregnant):
        tier = max(tier, T["urgent"])
    if "dehydration" in s and (child or elderly):
        tier = max(tier, T["urgent"])
    if any_of("diarrhea", "vomiting") and "dehydration" in s:
        tier = max(tier, T["urgent"])
    if has("stomach_pain", "vomiting", "high_fever"):
        tier = max(tier, T["urgent"])
    if pregnant and any_of("stomach_pain", "high_fever", "dizziness", "headache", "swelling_face"):
        tier = max(tier, T["urgent"])
    if "high_fever" in s and long_duration:
        tier = max(tier, T["urgent"])
    if "breathlessness" in s and elderly:
        tier = max(tier, T["urgent"])

    # --- Routine (needs a doctor, not immediately) ---
    if long_duration and any_of("fever", "cough", "weakness", "headache", "stomach_pain", "diarrhea"):
        tier = max(tier, T["routine"])  # e.g. cough > 2 weeks → TB screening
    if child and any_of("fever", "diarrhea", "vomiting"):
        tier = max(tier, T["routine"])
    if elderly and any_of("fever", "dizziness", "weakness"):
        tier = max(tier, T["routine"])
    if len(s) >= 4:
        tier = max(tier, T["routine"])
    return tier

#!/usr/bin/env python3
"""Build the SQE1 daily drill schedule.

Regenerate at any time with:  python3 build_schedule.py
Everything downstream reads schedule.json, so edit syllabus.json or the
constants below and re-run rather than hand-editing the schedule.
"""
import json, os
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))

START        = date(2026, 8, 28)   # first drill day
FIRSTPASS_END= date(2027, 4, 30)   # last day of new material
EXAM_FLK1    = date(2027, 7, 12)
EXAM_FLK2    = date(2027, 7, 19)
TAPER_START  = date(2027, 7, 5)    # no new drills, review only
DRILL_WEEKDAYS = {0,1,2,3,4,5}     # Mon-Sat; Sunday off
SPACING = [3, 10, 30, 75]          # days after first exposure to resurface

# Subject order: interleaves FLK1 and FLK2 so neither paper goes stale,
# pairs conceptually linked subjects, and puts foundations first.
ORDER = [
    ("FLK1", "Legal System and Constitutional Law"),
    ("FLK1", "Contract"),
    ("FLK1", "Tort"),
    ("FLK2", "Land Law"),
    ("FLK2", "Property Practice"),
    ("FLK1", "Business Law and Practice"),
    ("FLK2", "Trusts"),
    ("FLK2", "Wills and the Administration of Estates"),
    ("FLK1", "Dispute Resolution"),
    ("FLK2", "Criminal Liability"),
    ("FLK2", "Criminal Law and Practice"),
    ("FLK1", "Legal Services"),
    ("FLK2", "Solicitors Accounts"),
]

def drill_days(a, b):
    out, d = [], a
    while d <= b:
        if d.weekday() in DRILL_WEEKDAYS:
            out.append(d)
        d += timedelta(days=1)
    return out

syl = json.load(open(os.path.join(HERE, "syllabus.json")))

topics = []
for paper, subject in ORDER:
    for t in syl[paper][subject]:
        topics.append({"paper": paper, "subject": subject, "topic": t})

days = drill_days(START, FIRSTPASS_END)
n_days, n_top = len(days), len(topics)

# Distribute topics across days as evenly as possible (1 or 2 per day).
base, extra = divmod(n_top, n_days)
counts = [base + (1 if i < extra else 0) for i in range(n_days)]

schedule, idx, topic_first_day = [], 0, {}
for i, d in enumerate(days):
    todays = topics[idx: idx + counts[i]]
    idx += counts[i]
    for t in todays:
        topic_first_day[t["topic"]] = d
    schedule.append({
        "date": d.isoformat(),
        "day_index": i + 1,
        "phase": "first_pass",
        "new_topics": todays,
        "review_topics": [],
    })

# Spaced resurfacing: a topic introduced on day D comes back at D+3, +10, +30, +75.
by_date = {s["date"]: s for s in schedule}
consolidation_days = drill_days(FIRSTPASS_END + timedelta(days=1), TAPER_START - timedelta(days=1))
for d in consolidation_days:
    s = {"date": d.isoformat(), "day_index": None, "phase": "consolidation",
         "new_topics": [], "review_topics": []}
    schedule.append(s); by_date[d.isoformat()] = s

for t in topics:
    d0 = topic_first_day[t["topic"]]
    for gap in SPACING:
        d = d0 + timedelta(days=gap)
        while d.weekday() not in DRILL_WEEKDAYS:
            d += timedelta(days=1)
        k = d.isoformat()
        if k in by_date:
            by_date[k]["review_topics"].append(t)

# Consolidation days with no scheduled review get a mixed cumulative set.
for s in schedule:
    if s["phase"] == "consolidation" and not s["review_topics"]:
        s["review_topics"] = "MIXED_CUMULATIVE"

# Taper: review only, no new questions.
for d in drill_days(TAPER_START, EXAM_FLK2):
    schedule.append({"date": d.isoformat(), "day_index": None, "phase": "taper",
                     "new_topics": [], "review_topics": "WEAK_AREAS_ONLY"})

schedule.sort(key=lambda s: s["date"])
out = {
    "generated_for": "SQE1 July 2027",
    "exam_flk1": EXAM_FLK1.isoformat(),
    "exam_flk2": EXAM_FLK2.isoformat(),
    "first_pass_start": START.isoformat(),
    "first_pass_end": FIRSTPASS_END.isoformat(),
    "total_topics": n_top,
    "first_pass_days": n_days,
    "topics_per_day": f"{min(counts)}-{max(counts)}",
    "schedule": schedule,
}
json.dump(out, open(os.path.join(HERE, "schedule.json"), "w"), indent=1)

print(f"topics            : {n_top}")
print(f"first-pass days   : {n_days} ({min(counts)}-{max(counts)} topics/day)")
print(f"consolidation days: {len(consolidation_days)}")
print(f"total drill days  : {len(schedule)}")
print(f"first pass        : {START} -> {FIRSTPASS_END}")
print(f"consolidation     : {FIRSTPASS_END + timedelta(days=1)} -> {TAPER_START - timedelta(days=1)}")
print(f"taper             : {TAPER_START} -> {EXAM_FLK2}")

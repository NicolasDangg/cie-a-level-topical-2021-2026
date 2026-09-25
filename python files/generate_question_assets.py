#!/usr/bin/env python3
"""Build topical question crops and manifest.json from downloaded CIE PDFs."""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import pdfplumber
import pypdfium2 as pdfium

import export_data

ROOT = Path(__file__).resolve().parent.parent
TODAY = "2026-09-24"

TOPICS = {
    "9702": [
        (12, "Motion in a circle", "motion-in-a-circle"),
        (13, "Gravitational fields", "gravitational-fields"),
        (14, "Temperature", "temperature"),
        (15, "Ideal gases", "ideal-gases"),
        (16, "Thermodynamics", "thermodynamics"),
        (17, "Oscillations", "oscillations"),
        (18, "Electric fields", "electric-fields"),
        (19, "Capacitance", "capacitance"),
        (20, "Magnetic fields", "magnetic-fields"),
        (21, "Alternating currents", "alternating-currents"),
        (22, "Quantum physics", "quantum-physics"),
        (23, "Nuclear physics", "nuclear-physics"),
        (24, "Medical physics", "medical-physics"),
        (25, "Astronomy and cosmology", "astronomy-and-cosmology"),
    ],
    "9618": [
        (13, "Data representation", "data-representation"),
        (14, "Communication and internet technologies", "communication-and-internet-technologies"),
        (15, "Hardware and virtual machines", "hardware-and-virtual-machines"),
        (16, "System software", "system-software"),
        (17, "Security", "security"),
        (18, "Artificial intelligence (AI)", "artificial-intelligence"),
        (19, "Computational thinking and problem-solving", "computational-thinking-and-problem-solving"),
        (20, "Further programming", "further-programming"),
    ],
    "9990": [
        (1, "Clinical Psychology", "clinical-psychology"),
        (2, "Consumer Psychology", "consumer-psychology"),
        (3, "Health Psychology", "health-psychology"),
        (4, "Organisational Psychology", "organisational-psychology"),
    ],
}
SUBJECTS = {
    "9702": {
        "name": "Physics",
        "allowed": {"41", "42", "43", "51", "52", "53"},
        "sessions": {"m": "March", "s": "May/June", "w": "Oct/Nov"},
        "slug": "Physics-9702",
        "syllabus_url": "https://www.cambridgeinternational.org/Images/664565-2025-2027-syllabus.pdf",
        "expected_questions": {"4": 12, "5": 2},
        "bucket": ("practical-skills", "Practical skills"),
    },
    "9618": {
        "name": "Computer Science",
        "allowed": {"31", "32", "33", "41", "42", "43"},
        "sessions": {"s": "May/June", "w": "Oct/Nov"},
        "slug": "Computer Science (for first examination in 2021) (9618)",
        "syllabus_url": "https://www.cambridgeinternational.org/Images/697372-2026-syllabus.pdf",
        "expected_questions": {"3": 9, "4": 3},
        "bucket": ("practical-programming", "Practical programming"),
    },
    "9990": {
        "name": "Psychology",
        "allowed": {"31", "32", "33", "41", "42", "43"},
        "sessions": {"m": "March", "s": "May/June", "w": "Oct/Nov"},
        "slug": "Psychology-9990",
        "syllabus_url": "https://www.cambridgeinternational.org/Images/634461-2024-2026-syllabus.pdf",
        "expected_questions": {"3": 16, "4": 12},
        "bucket": None,
    },
}

PHYSICS_TOPIC_OVERRIDES = {
    **{qid: 12 for qid in (
        "9702-2023-mj-41-q02", "9702-2023-mj-43-q02",
    )},
    **{qid: 13 for qid in (
        "9702-2022-on-42-q01", "9702-2023-m-42-q01",
        "9702-2023-on-41-q01", "9702-2023-on-42-q02", "9702-2023-on-43-q01",
    )},
    **{qid: 15 for qid in (
        "9702-2022-on-42-q03", "9702-2023-mj-42-q02",
        "9702-2025-on-41-q04", "9702-2025-on-43-q04",
    )},
    **{qid: 18 for qid in (
        "9702-2022-on-41-q04", "9702-2022-on-43-q04",
        "9702-2025-mj-41-q02", "9702-2025-mj-43-q02",
    )},
    **{qid: 20 for qid in (
        "9702-2021-on-41-q09", "9702-2021-on-43-q09",
    )},
    **{qid: 21 for qid in (
        "9702-2023-on-41-q07", "9702-2023-on-43-q07",
        "9702-2024-mj-41-q07", "9702-2024-mj-43-q07",
    )},
    "9702-2022-mj-42-q08": 22,
    "9702-2025-m-42-q09": 23,
    **{qid: 24 for qid in (
        "9702-2022-m-42-q10", "9702-2023-m-42-q09",
    )},
}

def topic_defs(subject):
    defs = [(n, label, f"{subject}-topic-{n:02d}-{slug}") for n, label, slug in TOPICS[subject]]
    if SUBJECTS[subject]["bucket"]:
        slug, label = SUBJECTS[subject]["bucket"]
        defs.append((None, label, f"{subject}-{slug}"))
    return defs

def normalize_session(code):
    return {"m": ("m", "March"), "s": ("mj", "May/June"), "w": ("on", "Oct/Nov")}[code]

def parse_pdf(path):
    m = re.search(r"(9702|9618|9990)_([msw])(\d{2})_qp_(\d{2})\.pdf$", path.name)
    if not m:
        return None
    subject, raw_session, yy, variant = m.groups()
    if variant not in SUBJECTS[subject]["allowed"]:
        return None
    session_code, session = normalize_session(raw_session)
    return {
        "subject": subject, "year": 2000 + int(yy), "raw_session": raw_session,
        "session_code": session_code, "session": session, "variant": variant,
        "paper": int(variant[0]), "path": path,
    }

def expected_question_count(meta):
    if meta["subject"] == "9990":
        return 8 if meta["paper"] == 3 and meta["year"] < 2024 else SUBJECTS["9990"]["expected_questions"][str(meta["paper"])]
    return SUBJECTS[meta["subject"]]["expected_questions"][str(meta["paper"])]

def detect_starts(meta):
    candidates = []
    with pdfplumber.open(meta["path"]) as doc:
        for page_no, page in enumerate(doc.pages, 1):
            for word in page.extract_words(x_tolerance=2, y_tolerance=2):
                text, x0 = word["text"].strip(), float(word["x0"])
                if 40 <= x0 <= 70 and text.isdigit() and 1 <= int(text) <= 20:
                    candidates.append((page_no, float(word["top"]), int(text)))
    starts, wanted = [], 1
    for page_no, top, number in candidates:
        if number == wanted:
            starts.append({"question_number": wanted, "page": page_no, "top": top})
            wanted += 1
    assert len(starts) >= 2, f"{meta['path'].name}: could not find the printed question sequence; {candidates}"
    return starts

def extract_range(page, top, bottom):
    words = [w for w in page.extract_words(x_tolerance=2, y_tolerance=2)
             if float(w["bottom"]) >= top - 3 and float(w["top"]) <= bottom + 3]
    words.sort(key=lambda w: (float(w["top"]), float(w["x0"])))
    lines, line, last_top = [], [], None
    for word in words:
        y = float(word["top"])
        if last_top is not None and abs(y - last_top) > 3:
            if line:
                lines.append(" ".join(line))
            line = []
        line.append(word["text"])
        last_top = y
    if line:
        lines.append(" ".join(line))
    return "\n".join(lines)

def question_spans(meta, starts):
    spans = []
    with pdfplumber.open(meta["path"]) as doc:
        for i, start in enumerate(starts):
            nxt = starts[i + 1] if i + 1 < len(starts) else None
            first, last = start["page"], nxt["page"] if nxt else len(doc.pages)
            ranges, text_parts, marks = [], [], 0
            for page_no in range(first, last + 1):
                page = doc.pages[page_no - 1]
                top = start["top"] - 7 if page_no == first else 42
                bottom = nxt["top"] - 8 if nxt and page_no == nxt["page"] else float(page.height) - 38
                bottom = max(top + 10, bottom)
                if bottom - top < 40:
                    continue
                text = extract_range(page, top, bottom)
                ranges.append({"page": page_no, "top": top, "bottom": bottom})
                text_parts.append(text)
                marks += sum(int(n) for n in re.findall(r"\[(\d+)\]", text))
            spans.append({
                "question_number": start["question_number"],
                "page_ranges": ranges,
                "text": "\n".join(text_parts).strip(),
                "marks": marks or None,
            })
    return spans

def classify(subject, paper, text, question_id=None):
    if subject == "9702" and paper == 5:
        return None, "Practical skills", "9702-practical-skills"
    if subject == "9618" and paper == 4:
        return None, "Practical programming", "9618-practical-programming"
    if subject == "9990":
        year_match = re.search(r"9990-(\d{4})-", question_id or "")
        question_match = re.search(r"-q(\d{2})$", question_id or "")
        if not year_match or not question_match:
            raise ValueError(f"Cannot determine Psychology topic for {question_id!r}")
        year, question_number = int(year_match.group(1)), int(question_match.group(1))
        limit = 8 if paper == 3 and year < 2024 else 16 if paper == 3 else 12
        if not 1 <= question_number <= limit:
            raise ValueError(f"Question {question_number} is outside Psychology Paper {paper}")
        if paper == 3:
            option = (question_number - 1) // (2 if year < 2024 else 4)
        elif paper == 4:
            option = (question_number - 1) % 4
        else:
            raise ValueError(f"Unexpected Psychology paper: {paper}")
        label, slug = TOPICS["9990"][option][1:]
        return option + 1, label, f"9990-topic-0{option + 1}-{slug}"
    t = text.lower()
    if subject == "9702":
        # Use specific syllabus language and explicit precedence for questions
        # that mention more than one area. The old catch-all sent every
        # unmatched question to topic 12.
        result = {
            12: ("Motion in a circle", "motion-in-a-circle"),
            13: ("Gravitational fields", "gravitational-fields"),
            14: ("Temperature", "temperature"),
            15: ("Ideal gases", "ideal-gases"),
            16: ("Thermodynamics", "thermodynamics"),
            17: ("Oscillations", "oscillations"),
            18: ("Electric fields", "electric-fields"),
            19: ("Capacitance", "capacitance"),
            20: ("Magnetic fields", "magnetic-fields"),
            21: ("Alternating currents", "alternating-currents"),
            22: ("Quantum physics", "quantum-physics"),
            23: ("Nuclear physics", "nuclear-physics"),
            24: ("Medical physics", "medical-physics"),
            25: ("Astronomy and cosmology", "astronomy-and-cosmology"),
        }

        def choose(number):
            label, slug = result[number]
            return number, label, f"9702-topic-{number:02d}-{slug}"

        if question_id in PHYSICS_TOPIC_OVERRIDES:
            return choose(PHYSICS_TOPIC_OVERRIDES[question_id])

        # These are deliberately ordered from the most distinctive concepts
        # to the most general ones. Multi-topic stems are assigned by their
        # defining application (for example PET is medical, not nuclear).
        priority = [
            (25, ["hubble", "redshift", "luminosity", "wien's displacement", "galaxy", "universe", "cosmolog"]),
            (24, ["positron emission tomography", "pet scanning", "pet scan", "computed tomography", "ct scanning", "ct scan", "mri", "ultrasound", "specific acoustic impedance", "x-ray", "x ray", "radiotherap", "medical diagnosis", "diagnostic information", "tracer"]),
            (23, ["radioactive", "half-life", "half life", "binding energy", "mass defect", "fission", "fusion", "alpha-particle", "beta-plus", "beta minus", "nuclide", "nucleus", "nuclear", "decay", "activity of", "spontaneous"]),
            (22, ["photoelectric", "work function", "de broglie", "photon", "electron diffraction", "energy level", "laser", "particulate nature", "emission spectrum", "quantum"]),
            (21, ["amplitude modulation", "frequency modulation", "carrier wave", "operational amplifier", "op-amp", "rectification", "rectifier", "transformer", "alternating current", "alternating voltage", "reactance", "impedance", "analogue-to-digital", "digital-to-analogue", "sampling", "quantisation"]),
            (20, ["velocity selector", "magnetic flux density", "flux linkage", "electromagnetic induction", "faraday", "lenz", "motor effect", "force on a current", "magnetic field", "solenoid", "tesla"]),
            (19, ["capacitor", "capacitance", "dielectric", "time constant", "charge and discharge", "charging", "discharging"]),
            (18, ["electric field strength", "electric potential", "coulomb", "point charge", "electric field", "field line", "electric potential energy"]),
            (17, ["simple harmonic", "s.h.m", "oscillat", "resonance", "damping", "pendulum", "spring", "vibration"]),
            (16, ["first law of thermodynamics", "second law of thermodynamics", "internal energy", "entropy", "heat engine", "thermal efficiency", "work done by a gas", "isothermal", "adiabatic"]),
            (15, ["ideal gas", "kinetic theory", "kinetic model of a gas", "equation of state", "mean-square", "root-mean-square speed", "r.m.s. speed", "r.m.s speed", "molecular movement", "avogadro constant"]),
            (14, ["specific heat capacity", "specific latent heat", "thermal equilibrium", "absolute zero", "thermistor", "thermometric", "thermal expansion", "temperature scale", "thermometer", "kinetic model of matter"]),
            (13, ["gravitational field strength", "gravitational field", "gravitational potential", "law of gravitation", "gravitation", "escape velocity", "geostationary", "kepler", "satellite", "orbit"]),
            (12, ["centripetal", "circular motion", "angular velocity", "angular speed", "radian", "moves in a circle", "travels in a circle", "horizontal circle", "tangential"]),
        ]

        # Explicit stems that otherwise contain a competing keyword.
        if "thermistor" in t:
            return choose(14)
        if "similarity between the gravitational field lines" in t and "electric field lines" in t:
            return choose(18)
        if "simple harmonic" in t or "s.h.m" in t:
            return choose(17)
        if any(keyword in t for keyword in ("first law of thermodynamics", "internal energy", "entropy", "heat engine")):
            return choose(16)
        if any(keyword in t for keyword in ("specific heat capacity", "specific latent heat", "thermal equilibrium", "absolute zero", "kinetic model of matter")):
            return choose(14)
        if "positron emission tomography" in t or "pet scanning" in t or "pet scan" in t:
            return choose(24)
        if "emission spectrum" in t and ("star" in t or "galaxy" in t or "redshift" in t):
            return choose(25)
        if ("r.m.s" in t or "root-mean-square" in t) and ("speed" in t or "molecules" in t or "gas" in t):
            return choose(15)

        for number, keywords in priority:
            if any(keyword in t for keyword in keywords):
                return choose(number)

        # Keep every record inside the official A2 map, but never use motion
        # in a circle as a generic fallback.
        return choose(14)
    else:
        result = {
            13: ("Data representation", "data-representation"),
            14: ("Communication and internet technologies", "communication-and-internet-technologies"),
            15: ("Hardware and virtual machines", "hardware-and-virtual-machines"),
            16: ("System software", "system-software"),
            17: ("Security", "security"),
            18: ("Artificial intelligence (AI)", "artificial-intelligence"),
            19: ("Computational thinking and problem-solving", "computational-thinking-and-problem-solving"),
            20: ("Further programming", "further-programming"),
        }

        def choose(number):
            label, slug = result[number]
            return number, label, f"9618-topic-{number:02d}-{slug}"

        # Resolve distinctive syllabus phrases before the broad keyword list.
        # The same stem can mention several concepts, especially in code and
        # data-structure questions, so the assessed skill takes precedence.
        if (
            "file handling" in t
            or "file-handling" in t
            or ("random file is" in t and "new stock item" in t)
        ):
            return choose(20)
        if any(keyword in t for keyword in (
            "programming paradigm", "object-oriented", "object oriented", "(oop)",
            "declarative", "imperative", "exception handling", "what is meant by an exception",
        )):
            return choose(20)
        if (
            "class diagram" in t
            or (re.search(r"\bclass\b", t) and any(keyword in t for keyword in ("attribute", "method", "object")))
        ):
            return choose(20)
        if "binary tree" in t or "linked list" in t or "abstract data type" in t:
            return choose(19)
        if any(keyword in t for keyword in (
            "data types can be defined", "user-defined data type", "enumerated data",
            "pointer data", "composite data type", "non-composite data type",
            "data type set", "data type record",
        )) or re.search(r"\b(enumerated|composite|non-composite)\b", t):
            return choose(13)
        if any(keyword in t for keyword in (
            "file organisation", "file organization", "method of file access", "direct access",
            "random access file", "serial file", "sequential file", "hashing algorithm",
        )):
            return choose(13)
        if "dijkstra" in t or "a* algorithm" in t:
            return choose(18)
        if any(keyword in t for keyword in (
            "risc", "cisc", "virtual machine", "massively parallel", "sisd", "simd", "misd", "mimd",
        )):
            return choose(15)
        if "user interface" in t:
            return choose(16)

        priority = [
            (18, ["artificial intelligence", "machine learning", "neural network", "supervised learning", "unsupervised learning", "reinforcement learning", "expert system", "fuzzy logic"]),
            (17, ["digital certificate", "digital signature", "asymmetric encryption", "symmetric encryption", "public key", "private key", "quantum cryptography", "ssl", "tls", "encryption", "authentication", "firewall", "malware", "phishing", "cyber"]),
            (16, ["operating system", "process management", "multi-tasking", "scheduling", "scheduler", "interrupt", "virtual memory", "paging", "segmentation", "compiler", "interpreter", "lexical analysis", "syntax analysis", "code generation", "optimisation", "syntax diagram", "backus-naur", "reverse polish", "rpn"]),
            (15, ["risc", "cisc", "processor", "cpu", "register", "cache", "pipelining", "computer architecture", "sisd", "simd", "misd", "mimd", "virtual machine", "logic circuit", "truth table", "karnaugh", "k-map", "boolean algebra", "de morgan", "flip-flop", "half adder", "full adder", "assembly language"]),
            (14, ["tcp/ip", "tcp", "udp", "protocol", "packet switching", "circuit switching", "http", "ftp", "smtp", "pop3", "imap", "bittorrent", "dns", "ip address", "router", "network layer", "transport layer", "internet layer", "application layer", "link layer", "internet", "network", "transmission"]),
            (13, ["floating-point", "floating point", "two's complement", "two’s complement", "hexadecimal", "unicode", "ascii", "character set", "bitmap", "pixel", "sampling", "compression", "data representation"]),
            (19, ["dijkstra", "shortest path", "big o", "complexity", "time complexity", "space complexity", "binary search", "linear search", "sorting algorithm", "searching algorithm", "hashing algorithm", "stack", "queue", "linked list", "binary tree", "tree", "graph", "recursion", "algorithm"]),
            (20, ["object-oriented", "object oriented", "inheritance", "polymorphism", "encapsulation", "declarative language", "imperative programming", "programming paradigm", "programming language", "exception handling", "exception", "file organisation", "file organization", "serial file", "sequential file", "random access", "random file", "pseudocode", "class", "object", "recursion"]),
        ]
        for number, keywords in priority:
            if any(keyword in t for keyword in keywords):
                return choose(number)
        return choose(20)

def render_crop(pdf_doc, page_no, top, bottom, target):
    page = pdf_doc[page_no - 1]
    scale = 120 / 72
    image = page.render(scale=scale, rotation=0, optimize_mode="print").to_pil().convert("RGB")
    width, _ = page.get_size()
    left, right = int(42 * scale), min(image.width, int((width - 42) * scale))
    y0, y1 = max(0, int(top * scale)), min(image.height, int(bottom * scale))
    image.crop((left, y0, right, max(y0 + 20, y1))).save(target, format="PNG", optimize=True)

def source_url(meta, kind="qp"):
    folder = {"m": f"{meta['year']}-March", "s": f"{meta['year']}-May-June", "w": f"{meta['year']}-Oct-Nov"}[meta["raw_session"]]
    if meta["raw_session"] == "m" and meta["year"] == 2022:
        folder = "2022-Feb-March"
    filename = f"{meta['subject']}_{meta['raw_session']}{str(meta['year'])[2:]}_{kind}_{meta['variant']}.pdf"
    slug = SUBJECTS[meta["subject"]]["slug"]
    return "https://pastpapers.co/api/file/caie/A-Level/" + "/".join(quote(x, safe="") for x in [slug, folder, filename]) + "?download=true"

def build_subject(subject):
    subject_dir, config, defs = ROOT / subject, SUBJECTS[subject], topic_defs(subject)
    subject_dir.mkdir(parents=True, exist_ok=True)
    for _, _, slug in defs:
        (subject_dir / slug / "assets").mkdir(parents=True, exist_ok=True)
    metas = []
    for path in sorted((subject_dir / "_source-pdfs").glob("*/qp/*.pdf")):
        meta = parse_pdf(path)
        if meta:
            metas.append(meta)
    available = {(m["year"], m["raw_session"], m["variant"]) for m in metas}
    grouped, papers, records = defaultdict(list), [], []
    for meta in metas:
        starts, spans = detect_starts(meta), None
        spans = question_spans(meta, starts)
        doc = pdfium.PdfDocument(str(meta["path"]))
        papers.append({
            "year": meta["year"], "session": meta["session"], "session_code": meta["session_code"],
            "variant": meta["variant"], "paper": meta["paper"], "question_count": len(spans),
            "source_pdf": source_url(meta), "local_path": str(meta["path"].relative_to(subject_dir)),
        })
        for span in spans:
            qid = f"{subject}-{meta['year']}-{meta['session_code']}-{meta['variant']}-q{span['question_number']:02d}"
            number, label, slug = classify(subject, meta["paper"], span["text"], qid)
            images = []
            for part, pr in enumerate(span["page_ranges"], 1):
                filename = f"{qid}-p{part:02d}.png"
                target = subject_dir / slug / "assets" / filename
                render_crop(doc, pr["page"], pr["top"], pr["bottom"], target)
                images.append(f"{slug}/assets/{filename}")
            record = {
                "id": qid, "subject": subject, "year": meta["year"], "session": meta["session"],
                "session_code": meta["session_code"], "paper": meta["paper"], "variant": meta["variant"],
                "question_number": span["question_number"], "topic_number": number, "topic": label,
                "topic_slug": slug, "marks": span["marks"], "source_pdf": source_url(meta),
                "source_pages": [x["page"] for x in span["page_ranges"]],
                "local_pdf": str(meta["path"].relative_to(subject_dir)), "image_paths": images,
                "answer": {"status": "pending", "id": qid, "html": f"{slug}/answers.html"},
                "text_excerpt": span["text"][:3000],
            }
            grouped[slug].append(record)
            records.append(record)
        doc.close()
    missing = []
    for year in range(2021, 2027):
        for raw_session, session in config["sessions"].items():
            variants = sorted(config["allowed"])
            if subject == "9990":
                if (year < 2024 and raw_session == "m") or (year == 2026 and raw_session == "w"):
                    continue
                if raw_session == "m":
                    variants = ["32", "42"]
            for variant in variants:
                if (year, raw_session, variant) not in available:
                    reason = "unpublished as of 2026-09-24" if year == 2026 and subject != "9990" else "not available from the local downloader/source search"
                    temp = {"subject": subject, "year": year, "raw_session": raw_session, "variant": variant, "paper": int(variant[0])}
                    missing.append({"year": year, "session": session, "variant": variant, "source_pdf": source_url(temp), "reason": reason})
    for values in grouped.values():
        values.sort(key=lambda r: (r["year"], r["session_code"], r["variant"], r["question_number"]))
    papers.sort(key=lambda p: (p["year"], p["session_code"], p["variant"]))
    manifest = {
        "schema": "cie-topical-past-papers/v1", "subject": subject, "subject_name": config["name"],
        "syllabus_url": config["syllabus_url"], "generated": TODAY,
        "coverage": {
            "years": list(range(2021, 2027)), "sessions": list(config["sessions"].values()),
            "papers": sorted(config["allowed"]), "available_papers": len(papers), "missing_papers": missing,
        },
        "topics": [{"number": n, "label": label, "slug": slug, "questions_html": f"{slug}/questions.html", "answers_html": f"{slug}/answers.html"} for n, label, slug in defs],
        "papers": papers, "records": records,
    }
    (subject_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"subject": subject, "papers": len(papers), "records": len(records), "missing": len(missing), "topics": {k: len(v) for k, v in grouped.items()}}

if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    print(json.dumps([build_subject("9702"), build_subject("9618"), build_subject("9990")], indent=2))
    export_data.main()

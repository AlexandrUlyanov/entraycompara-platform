#!/usr/bin/env python3
"""
Weekly evaluation scaffold for invoice extraction quality.

Reads Firestore proposal_data documents where operators corrected the extraction,
compares ai_extracted_data against manual_corrected_data, and prints a JSON report.
"""
import json
from collections import defaultdict

from google.cloud import firestore

FIRESTORE_COLLECTION = "applications"
FIELDS = [
    "cups",
    "client_type",
    "access_tariff",
    "start_date",
    "end_date",
    "equipment_rental",
    "invoice_amount_with_vat",
    "retailer",
    "billed_power_p1",
    "billed_power_p2",
    "consumption_p1",
    "consumption_p2",
    "consumption_p3",
]


def values_match(left, right) -> bool:
    if left in (None, "", []) and right in (None, "", []):
        return True
    if isinstance(left, (int, float)) or isinstance(right, (int, float)):
        try:
            return abs(float(left) - float(right)) < 0.01
        except (TypeError, ValueError):
            return False
    return str(left).strip() == str(right).strip()


def main():
    client = firestore.Client()
    apps = client.collection(FIRESTORE_COLLECTION).stream()

    field_stats = {field: {"matched": 0, "mismatched": 0} for field in FIELDS}
    provider_stats = defaultdict(lambda: {"documents": 0, "mismatches": 0})
    reviewed_documents = 0

    for app in apps:
        proposal_doc = app.reference.collection("proposal_data").document("data").get()
        if not proposal_doc.exists:
            continue

        data = proposal_doc.to_dict() or {}
        ai_data = data.get("ai_extracted_data")
        manual_data = data.get("manual_corrected_data")
        if not ai_data or not manual_data:
            continue

        reviewed_documents += 1
        provider = manual_data.get("retailer") or ai_data.get("retailer") or "UNKNOWN"
        provider_stats[provider]["documents"] += 1

        doc_mismatch = False
        for field in FIELDS:
            if values_match(ai_data.get(field), manual_data.get(field)):
                field_stats[field]["matched"] += 1
            else:
                field_stats[field]["mismatched"] += 1
                doc_mismatch = True

        if doc_mismatch:
            provider_stats[provider]["mismatches"] += 1

    report = {
        "reviewed_documents": reviewed_documents,
        "field_accuracy": {
            field: {
                "matched": stats["matched"],
                "mismatched": stats["mismatched"],
                "accuracy": round(
                    stats["matched"] / (stats["matched"] + stats["mismatched"]), 4
                ) if (stats["matched"] + stats["mismatched"]) else None,
            }
            for field, stats in field_stats.items()
        },
        "provider_stats": {
            provider: {
                "documents": stats["documents"],
                "documents_with_any_mismatch": stats["mismatches"],
                "document_error_rate": round(stats["mismatches"] / stats["documents"], 4) if stats["documents"] else None,
            }
            for provider, stats in sorted(provider_stats.items())
        },
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

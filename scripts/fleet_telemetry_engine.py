#!/usr/bin/env python3
"""
fleet_telemetry_engine.py
─────────────────────────
Fetches real-world Argo float telemetry from IFREMER ERDDAP.

Date Resolution:
  - If --date is omitted or "latest", fetches the most recent dive.
  - If --date is provided, finds the exact time match.
  - If no exact match, falls back to the nearest available dive and flags the offset.

Depth Resolution:
  - Within the resolved dive, scans all pressure readings and returns the
    sensor row closest to the user's requested depth.

Output: Strict JSON to stdout (consumed by Node.js Express via execFile).
"""

import sys
import json
import warnings
import argparse
import requests
import urllib3
from datetime import datetime, timezone

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore")


def emit_json(payload):
    """Print strict JSON to stdout and exit cleanly."""
    print(json.dumps(payload, default=str))
    sys.exit(0)


def emit_error(message, status=500):
    """Print an error JSON and exit with code 1."""
    print(json.dumps({"success": False, "error": message, "status": status}))
    sys.exit(1)


def fetch_float_data(platform_number):
    """
    Fetches ALL historical dives for a given Argo float from IFREMER ERDDAP.
    Returns a list of dive dicts grouped by time, or raises on failure.
    """
    url = (
        "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json"
        "?time,latitude,longitude,pres,temp,psal,doxy,chla"
        f"&platform_number=%22{platform_number}%22"
        "&orderBy(%22time,pres%22)"
    )

    try:
        res = requests.get(url, timeout=30, verify=False)
        if res.status_code != 200:
            emit_error(f"ERDDAP returned HTTP {res.status_code}", 502)

        data = res.json()
        rows = data.get("table", {}).get("rows", [])
        if not rows:
            emit_error(
                f"No telemetry data found for platform {platform_number}. "
                "The float may not exist or may have no recent profiles.",
                404,
            )

        # Group rows into dives by timestamp
        dives = {}
        for row in rows:
            time_val, lat, lon, pres, temp, psal, doxy, chla = row
            if time_val not in dives:
                dives[time_val] = {
                    "time": time_val,
                    "lat": lat,
                    "lon": lon,
                    "readings": [],
                }
            if pres is not None and temp is not None:
                dives[time_val]["readings"].append({
                    "pressure_dbar": pres,
                    "temperature_c": temp,
                    "salinity_psu": psal,
                    "dissolved_oxygen_umol_kg": doxy,
                    "chlorophyll_a_mg_m3": chla,
                })

        # Filter out empty dives
        valid_dives = [d for d in dives.values() if d["readings"]]
        if not valid_dives:
            emit_error("Float has profile data but no valid sensor readings.", 404)

        return valid_dives

    except requests.exceptions.RequestException as e:
        emit_error(f"Failed to connect to ERDDAP: {str(e)}", 502)


def resolve_dive_by_date(dives, date_str):
    """
    Resolves which dive to use based on the user's date input.

    Returns: (dive_dict, match_type, time_offset_seconds)
      match_type: "real_time" | "exact_match" | "nearest_historical"
    """
    if not date_str or date_str.lower() in ("latest", "none", ""):
        # ── REAL-TIME: return the most recent dive ──
        latest = max(dives, key=lambda d: d["time"])
        return latest, "real_time", 0

    # Parse the user-supplied date
    try:
        # Handle multiple date formats
        for fmt in (
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%d",
        ):
            try:
                target_dt = datetime.strptime(date_str, fmt).replace(
                    tzinfo=timezone.utc
                )
                break
            except ValueError:
                continue
        else:
            emit_error(
                f"Invalid date format: '{date_str}'. "
                "Expected ISO-8601 (e.g. 2024-09-23T10:00:00Z or 2024-09-23).",
                400,
            )
    except Exception:
        emit_error(f"Could not parse date: '{date_str}'", 400)

    # Search for exact or nearest match
    best_dive = None
    best_diff = float("inf")

    for dive in dives:
        try:
            dive_dt = datetime.strptime(dive["time"], "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue

        diff = abs((dive_dt - target_dt).total_seconds())

        if diff < best_diff:
            best_diff = diff
            best_dive = dive

    if best_dive is None:
        emit_error("No dives found matching the requested time window.", 404)

    # Exact match = within 1 hour (3600 seconds)
    if best_diff <= 3600:
        return best_dive, "exact_match", best_diff
    else:
        return best_dive, "nearest_historical", best_diff


def resolve_depth(readings, target_depth):
    """
    Finds the sensor reading closest to the user's requested depth.
    Returns: (matched_reading, actual_depth, depth_offset)
    """
    best = None
    best_diff = float("inf")

    for reading in readings:
        diff = abs(reading["pressure_dbar"] - target_depth)
        if diff < best_diff:
            best_diff = diff
            best = reading

    return best, best["pressure_dbar"] if best else None, best_diff


def format_time_offset(seconds):
    """Human-readable time offset string."""
    if seconds < 60:
        return f"{seconds:.0f} seconds"
    elif seconds < 3600:
        return f"{seconds / 60:.1f} minutes"
    elif seconds < 86400:
        return f"{seconds / 3600:.1f} hours"
    else:
        return f"{seconds / 86400:.1f} days"


def main():
    parser = argparse.ArgumentParser(
        description="Fleet Telemetry Engine — ERDDAP Argo Data Fetcher"
    )
    parser.add_argument(
        "--platform",
        required=True,
        help="Argo platform number (e.g., 2902351 or 4902626)",
    )
    parser.add_argument(
        "--date",
        required=False,
        default="latest",
        help="ISO-8601 date (e.g., 2024-09-23T10:00:00Z) or 'latest' for real-time",
    )
    parser.add_argument(
        "--depth",
        type=float,
        required=False,
        default=15.0,
        help="Target depth in meters/dbar (e.g., 15.0)",
    )

    args = parser.parse_args()

    # Clean the platform number (strip "argo-" prefix if present)
    platform = args.platform.replace("argo-", "").replace("Argo ", "").strip()

    # ── Step 1: Fetch all dives from ERDDAP ──
    sys.stderr.write(f"[fleet_telemetry_engine] Fetching data for platform {platform}...\n")
    dives = fetch_float_data(platform)
    sys.stderr.write(f"[fleet_telemetry_engine] Found {len(dives)} dives\n")

    # ── Step 2: Resolve which dive to use based on date ──
    dive, match_type, time_offset = resolve_dive_by_date(dives, args.date)
    sys.stderr.write(
        f"[fleet_telemetry_engine] Match type: {match_type}, "
        f"time: {dive['time']}, offset: {format_time_offset(time_offset)}\n"
    )

    # ── Step 3: Find the closest depth reading in the matched dive ──
    reading, actual_depth, depth_offset = resolve_depth(dive["readings"], args.depth)

    if reading is None:
        emit_error("No sensor readings found at the requested depth.", 404)

    sys.stderr.write(
        f"[fleet_telemetry_engine] Depth match: requested={args.depth}m, "
        f"actual={actual_depth}m, offset={depth_offset:.1f}m\n"
    )

    # ── Step 4: Build the response payload ──
    payload = {
        "success": True,
        "platform_number": platform,
        "match_type": match_type,
        "match_type_label": {
            "real_time": "Real-Time (Latest)",
            "exact_match": "Exact Match",
            "nearest_historical": f"Nearest Historical (Δ {format_time_offset(time_offset)})",
        }.get(match_type, match_type),
        "matched_date": dive["time"],
        "requested_date": args.date if args.date != "latest" else None,
        "time_offset_seconds": time_offset,
        "time_offset_label": format_time_offset(time_offset) if time_offset > 0 else None,
        "location": {
            "lat": round(dive["lat"], 4) if dive["lat"] else None,
            "lon": round(dive["lon"], 4) if dive["lon"] else None,
        },
        "requested_depth": args.depth,
        "actual_depth": actual_depth,
        "depth_offset": round(depth_offset, 1),
        "matched_reading": {
            "pressure_dbar": reading["pressure_dbar"],
            "temperature_c": reading["temperature_c"],
            "salinity_psu": reading["salinity_psu"],
            "dissolved_oxygen_umol_kg": reading["dissolved_oxygen_umol_kg"],
            "chlorophyll_a_mg_m3": reading["chlorophyll_a_mg_m3"],
        },
        "total_dives_available": len(dives),
        "total_readings_in_dive": len(dive["readings"]),
        "data_source": "ifremer-erddap",
        "erddap_dataset": "ArgoFloats",
    }

    # ── Step 5: Output strict JSON to stdout ──
    emit_json(payload)


if __name__ == "__main__":
    main()

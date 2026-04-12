#!/usr/bin/env python3
"""
BYOA Deployment Preflight Check
Validates environment, build artifacts, and R2 connectivity before pushing to Railway.

Usage:
    python scripts/preflight.py [--env-file .env]
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# ── ANSI colours ─────────────────────────────────────────────────────────────
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def fail(msg): print(f"  {RED}✗{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}~{RESET}  {msg}")
def info(msg): print(f"  {CYAN}·{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{msg}{RESET}")

# ── Required env vars ─────────────────────────────────────────────────────────
REQUIRED_VARS = [
    ("DATABASE_URL",                "PostgreSQL connection string"),
    ("REDWOOD_ENV_SUPABASE_URL",    "Supabase project URL"),
    ("REDWOOD_ENV_SUPABASE_ANON_KEY", "Supabase anon key"),
    ("SUPABASE_SERVICE_ROLE_KEY",   "Supabase service-role key"),
    ("R2_ENDPOINT",                 "Cloudflare R2 endpoint URL"),
    ("R2_ACCESS_KEY_ID",            "Cloudflare R2 access key"),
    ("R2_SECRET_ACCESS_KEY",        "Cloudflare R2 secret key"),
    ("R2_BUCKET_NAME",              "Cloudflare R2 bucket name"),
]

OPTIONAL_VARS = [
    ("BRAVE_API_KEY",   "Brave Search"),
    ("EXA_API_KEY",     "Exa Search"),
    ("TAVILY_API_KEY",  "Tavily Search"),
    ("ZHIPU_API_KEY",   "Zhipu AI (GLM)"),
]

# ── Helpers ───────────────────────────────────────────────────────────────────
def load_dotenv(path: str) -> dict:
    """Parse a .env file into a dict (no external dependencies)."""
    env = {}
    try:
        for line in Path(path).read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


def run(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.returncode, (result.stdout + result.stderr).strip()


# ── Checks ────────────────────────────────────────────────────────────────────
def check_env_vars(env: dict) -> int:
    header("1. Environment Variables")
    errors = 0
    for var, desc in REQUIRED_VARS:
        val = env.get(var) or os.environ.get(var, "")
        if not val or val.startswith("<"):
            fail(f"{var} — {desc} [MISSING]")
            errors += 1
        else:
            ok(f"{var}")
    for var, desc in OPTIONAL_VARS:
        val = env.get(var) or os.environ.get(var, "")
        if val:
            ok(f"{var} (optional, configured)")
        else:
            warn(f"{var} (optional, {desc} disabled)")
    return errors


def check_git() -> int:
    header("2. Git Status")
    errors = 0
    code, out = run(["git", "status", "--porcelain"])
    if out:
        warn(f"Uncommitted changes:\n    {out[:300]}")
    else:
        ok("Working tree clean")

    code, branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    info(f"Branch: {branch}")

    code, ahead = run(["git", "log", "--oneline", "origin/main..HEAD"])
    if ahead:
        count = len(ahead.splitlines())
        warn(f"{count} commit(s) not yet pushed to origin/main")
    else:
        ok("Up to date with origin/main")
    return errors


def check_build() -> int:
    header("3. Build")
    errors = 0
    root = Path(__file__).parent.parent

    code, out = run(["yarn", "rw", "build"], cwd=str(root))
    if code == 0:
        ok("yarn rw build — PASS")
    else:
        fail(f"yarn rw build — FAILED\n    {out[-500:]}")
        errors += 1

    # Check dist artifacts
    api_dist  = root / ".redwood" / "functions"
    web_dist  = root / "web" / "dist"
    if api_dist.exists():
        ok(f"API functions dir: {api_dist}")
    else:
        warn("API functions dir missing (may be a clean env)")
    if web_dist.exists():
        ok(f"Web dist dir: {web_dist}")
    else:
        warn("Web dist dir missing (may be a clean env)")
    return errors


def check_r2(env: dict) -> int:
    """Lightweight R2 connectivity probe using boto3 if available."""
    header("4. R2 Connectivity")
    endpoint  = env.get("R2_ENDPOINT") or os.environ.get("R2_ENDPOINT", "")
    key_id    = env.get("R2_ACCESS_KEY_ID") or os.environ.get("R2_ACCESS_KEY_ID", "")
    secret    = env.get("R2_SECRET_ACCESS_KEY") or os.environ.get("R2_SECRET_ACCESS_KEY", "")
    bucket    = env.get("R2_BUCKET_NAME") or os.environ.get("R2_BUCKET_NAME", "")

    if not all([endpoint, key_id, secret, bucket]):
        warn("R2 vars incomplete — skipping connectivity check")
        return 0

    try:
        import boto3
        from botocore.config import Config
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        resp = s3.head_bucket(Bucket=bucket)
        ok(f"R2 bucket '{bucket}' is reachable")
    except ImportError:
        warn("boto3 not installed — skipping R2 probe (pip install boto3)")
    except Exception as e:
        fail(f"R2 connectivity: {e}")
        return 1
    return 0


def check_dockerfile() -> int:
    header("5. Dockerfile / Railway Config")
    errors = 0
    root = Path(__file__).parent.parent
    if (root / "Dockerfile").exists():
        ok("Dockerfile present")
    else:
        fail("Dockerfile missing")
        errors += 1
    if (root / "railway.toml").exists():
        ok("railway.toml present")
    else:
        warn("railway.toml missing (optional if using Railway auto-detect)")
    return errors


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="BYOA deployment preflight check")
    parser.add_argument("--env-file", default=".env", help="Path to .env file (default: .env)")
    parser.add_argument("--skip-build", action="store_true", help="Skip the build step (faster)")
    args = parser.parse_args()

    print(f"\n{BOLD}{'─' * 50}")
    print("  BYOA — Deployment Preflight Check")
    print(f"{'─' * 50}{RESET}")

    env = load_dotenv(args.env_file)
    total_errors = 0

    total_errors += check_env_vars(env)
    total_errors += check_git()
    if not args.skip_build:
        total_errors += check_build()
    else:
        info("Build check skipped (--skip-build)")
    total_errors += check_r2(env)
    total_errors += check_dockerfile()

    print(f"\n{BOLD}{'─' * 50}{RESET}")
    if total_errors == 0:
        print(f"{GREEN}{BOLD}  ✓ All checks passed — safe to deploy{RESET}\n")
        sys.exit(0)
    else:
        print(f"{RED}{BOLD}  ✗ {total_errors} check(s) failed — fix before deploying{RESET}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()

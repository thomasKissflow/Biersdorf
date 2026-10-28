#!/usr/bin/env python3
"""Bridge: validate an intermediate page spec with Kissflow's REAL intermediate_validator.

Same vendoring shim as page_transform.py — `page_builder` is bundled under engine/vendor, so no
kissflow-xg checkout is needed. Set KF_METADATA_PATH to a live <kissflow-xg>/metadata to override.

stdin:  the intermediate JSON object
stdout: {"valid": bool, "errors": [str, ...]}
"""
import sys, os, json, types

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(HERE, "vendor")
KF = os.environ.get("KF_METADATA_PATH")
UTILS = os.path.join(KF, "utils") if (KF and os.path.isdir(os.path.join(KF, "utils", "page_builder"))) else BUNDLED
if not os.path.isdir(os.path.join(UTILS, "page_builder")):
    sys.stderr.write(f"page_validate: page_builder not found under {UTILS}\n")
    sys.exit(2)
for pkg, path in (("utils", UTILS), ("utils.page_builder", os.path.join(UTILS, "page_builder"))):
    m = types.ModuleType(pkg)
    m.__path__ = [path]
    sys.modules[pkg] = m
sys.path.insert(0, os.path.dirname(UTILS))
from utils.page_builder.intermediate_validator import validate_intermediate  # noqa: E402

json.dump(validate_intermediate(json.load(sys.stdin)), sys.stdout)

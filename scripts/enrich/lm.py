"""DSPy LM configuration — NVIDIA NIM primary, local OpenAI-compat fallback."""

import os
import sys

import dspy

NIM_API_BASE = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = os.environ.get("NVIDIA_NIM_MODEL", "meta/llama-3.1-8b-instruct")
LOCAL_LM_URL = os.environ.get("DSPY_SERVICE_URL", "http://localhost:7860")


def configure_lm(nim_key: str = "", local_model: str = "") -> str:
    """Configure dspy's global LM. Returns a label for log output.

    Accepts an explicit NIM key or reads from NVIDIA_NIM_API_KEY / NIM_API_KEY /
    NVIDIA_API_KEY. Falls back to a local OpenAI-compatible server if no NIM
    key is present.
    """
    key = (
        nim_key
        or os.environ.get("NVIDIA_NIM_API_KEY", "")
        or os.environ.get("NIM_API_KEY", "")
        or os.environ.get("NVIDIA_API_KEY", "")
    )

    if key:
        lm = dspy.LM(
            model=f"openai/{NIM_MODEL}",
            api_base=NIM_API_BASE,
            api_key=key,
            max_tokens=300,
            temperature=0.2,
        )
        dspy.configure(lm=lm)
        return f"NVIDIA NIM · {NIM_MODEL}"

    model = local_model or os.environ.get("LOCAL_LM_MODEL", "llama3")
    try:
        lm = dspy.LM(
            model=f"openai/{model}",
            api_base=LOCAL_LM_URL + "/v1",
            api_key="local",
            max_tokens=300,
            temperature=0.2,
        )
        dspy.configure(lm=lm)
        return f"Local LM @ {LOCAL_LM_URL} · {model}"
    except Exception as e:  # pragma: no cover — depends on env
        print(f"Failed to configure any LM backend: {e}", file=sys.stderr)
        print(
            "Set NVIDIA_NIM_API_KEY or ensure the local LM server is reachable.",
            file=sys.stderr,
        )
        sys.exit(1)

"""Receipt data extraction.

Two interchangeable providers:

- ClaudeExtractor — sends the receipt image/PDF to the Claude API with a
  structured-output JSON schema, so the response is guaranteed to parse.
- MockExtractor  — deterministic fake data derived from the file hash, so the
  app (and the test suite) runs with no API key and duplicate detection is
  reproducible.

Provider selection: RECEIPT_AI_PROVIDER=claude|mock, defaulting to claude when
ANTHROPIC_API_KEY is set and mock otherwise.
"""
import base64
import hashlib
import json
import os
from pathlib import Path

FIELDS = ["merchant", "purchase_date", "total_amount", "currency", "tax_amount", "line_items"]

# Structured-output schema: all constraints structured outputs supports
# (additionalProperties false, required, enum-free scalars).
RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "merchant": {"type": ["string", "null"]},
        "purchase_date": {"type": ["string", "null"], "description": "ISO date YYYY-MM-DD"},
        "total_amount": {"type": ["number", "null"]},
        "currency": {"type": ["string", "null"], "description": "ISO 4217 code, e.g. USD"},
        "tax_amount": {"type": ["number", "null"]},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "quantity": {"type": ["number", "null"]},
                    "unit_price": {"type": ["number", "null"]},
                    "amount": {"type": ["number", "null"]},
                },
                "required": ["description", "quantity", "unit_price", "amount"],
                "additionalProperties": False,
            },
        },
        "confidence": {
            "type": "object",
            "properties": {f: {"type": "number"} for f in FIELDS},
            "required": FIELDS,
            "additionalProperties": False,
        },
    },
    "required": FIELDS + ["confidence"],
    "additionalProperties": False,
}

PROMPT = """Extract the data from this receipt.

Rules:
- purchase_date must be ISO format (YYYY-MM-DD). If ambiguous, prefer the most plausible reading.
- currency is the ISO 4217 code (infer from symbols/locale if not printed).
- total_amount is the grand total actually charged; tax_amount is total tax.
- Include every line item you can read. Use null for values you cannot determine.
- confidence holds a 0.0-1.0 score per field for how certain you are of each value
  (for line_items, score the list as a whole)."""


class ExtractionError(Exception):
    pass


class ClaudeExtractor:
    name = "claude"

    def __init__(self):
        import anthropic
        self.client = anthropic.Anthropic()
        self.model = os.environ.get("RECEIPT_MODEL", "claude-opus-4-8")

    @staticmethod
    def _heic_to_jpeg(file_path: Path) -> bytes:
        """Claude vision doesn't accept HEIC/HEIF — transcode to JPEG first."""
        try:
            import io
            from pillow_heif import register_heif_opener
            from PIL import Image
        except ImportError as e:
            raise ExtractionError(
                "HEIC support requires the pillow-heif package (pip install pillow-heif)."
            ) from e
        register_heif_opener()
        buf = io.BytesIO()
        Image.open(file_path).convert("RGB").save(buf, format="JPEG", quality=90)
        return buf.getvalue()

    def extract(self, file_path: Path, mime_type: str) -> dict:
        raw = file_path.read_bytes()
        if mime_type in ("image/heic", "image/heif"):
            raw, mime_type = self._heic_to_jpeg(file_path), "image/jpeg"
        data = base64.standard_b64encode(raw).decode("utf-8")
        if mime_type == "application/pdf":
            file_block = {"type": "document", "source": {"type": "base64", "media_type": mime_type, "data": data}}
        else:
            file_block = {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": data}}

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                output_config={"format": {"type": "json_schema", "schema": RECEIPT_SCHEMA}},
                messages=[{"role": "user", "content": [file_block, {"type": "text", "text": PROMPT}]}],
            )
        except Exception as e:  # surfaced to the UI as a retryable failure
            raise ExtractionError(f"Claude API call failed: {e}") from e

        if response.stop_reason == "refusal":
            raise ExtractionError("Model declined to process this file.")
        if response.stop_reason == "max_tokens":
            raise ExtractionError("Extraction output was truncated; retry.")

        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            raise ExtractionError("Model returned no extractable content.")
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ExtractionError(f"Model output was not valid JSON: {e}") from e


class MockExtractor:
    """Deterministic per-file fake extraction — same bytes always yield the
    same receipt, which keeps duplicate detection demonstrable offline."""
    name = "mock"

    MERCHANTS = ["Blue Bottle Coffee", "Office Depot", "Trader Joe's", "Uber", "Delta Air Lines", "Chipotle"]
    ITEMS = ["Coffee", "Notebook", "Groceries", "Ride fare", "Snacks", "Printer paper", "Lunch special"]

    def extract(self, file_path: Path, mime_type: str) -> dict:
        h = hashlib.sha256(file_path.read_bytes()).digest()
        merchant = self.MERCHANTS[h[0] % len(self.MERCHANTS)]
        day = (h[1] % 28) + 1
        month = (h[2] % 12) + 1
        n_items = (h[3] % 3) + 1
        items, subtotal = [], 0.0
        for i in range(n_items):
            qty = (h[4 + i] % 3) + 1
            unit = round(3 + (h[7 + i] % 4000) / 100, 2)
            amount = round(qty * unit, 2)
            subtotal += amount
            items.append({
                "description": self.ITEMS[h[10 + i] % len(self.ITEMS)],
                "quantity": qty, "unit_price": unit, "amount": amount,
            })
        tax = round(subtotal * 0.08, 2)
        return {
            "merchant": merchant,
            "purchase_date": f"2026-{month:02d}-{day:02d}",
            "total_amount": round(subtotal + tax, 2),
            "currency": "USD",
            "tax_amount": tax,
            "line_items": items,
            "confidence": {
                "merchant": 0.98, "purchase_date": 0.85, "total_amount": 0.95,
                "currency": 0.99, "tax_amount": 0.75, "line_items": 0.9,
            },
        }


def get_extractor():
    provider = os.environ.get("RECEIPT_AI_PROVIDER")
    if provider is None:
        provider = "claude" if os.environ.get("ANTHROPIC_API_KEY") else "mock"
    if provider == "claude":
        return ClaudeExtractor()
    return MockExtractor()

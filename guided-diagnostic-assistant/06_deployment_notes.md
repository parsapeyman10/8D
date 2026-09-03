# Deployment Notes

## Model usage (DeepSeek example)

| Task | Suggested Model | Temperature |
|---|---:|---:|
| Single-agent MVP | deepseek-chat or stronger | 0.1-0.3 |
| Tier 1 question selector | deepseek-chat | 0 |
| Tier 1.5 consistency check | deepseek-chat | 0 |
| Tier 2 final analysis | deepseek-reasoner | 0-0.2 |

## JSON validation

1. Call model.
2. Parse JSON.
3. If parse fails, retry once with: "Return valid JSON only. No prose, no markdown, no explanation."
4. If retry fails: fallback to a safe broad question, or conclude if question_count >= 8. Log the failure.

## Hard question cap

Enforce in code, not just in the prompt:

if question_count >= 8:
    do not call Tier 1 again for a new question
    proceed to consistency check / final analysis

## Language detection

Detect language from the latest user message in the orchestration layer.
Pass it explicitly as "language": "fa" or "en" in every call.
Do not leave this to the model to infer.

## RAG recommendation

Connect to:
- IKCO/OEM technical documentation
- Internal TSB-equivalent bulletins
- Warranty claim database
- Past 8D reports
- Supplier-quality reports
- Field failure reports

Recommended retrieved record fields:
{
  "known_issue_id": "",
  "platform": "",
  "system": "",
  "symptom_pattern": "",
  "conditions": "",
  "confirmed_root_cause": "",
  "corrective_action": "",
  "source": "TSB / 8D / warranty / service bulletin",
  "confidence": ""
}

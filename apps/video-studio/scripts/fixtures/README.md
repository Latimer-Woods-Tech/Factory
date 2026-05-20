# video-studio dry-run fixtures

Sample payloads used by the `dry-run` job in `.github/workflows/render-video.yml`.
The dry-run walks the same step structure as the real pipeline but reads
these fixtures instead of calling Anthropic / ElevenLabs / R2 / Stream /
Capricast. Each step that would touch an external system instead runs a
local validation against the corresponding fixture.

| File                  | Stands in for…                                |
| --------------------- | --------------------------------------------- |
| `dry-run-script.json` | `generate-script.mjs` output (headline+narration+steps) |
| `dry-run-stream.json` | Cloudflare Stream `copy` + status response    |

These files are committed deliberately so PR CI can exercise the pipeline
shape on every change without burning real budget.

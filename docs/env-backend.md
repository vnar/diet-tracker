# Environment

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_USE_AWS_BACKEND` | Set to `true` to enable AWS API sync from the static frontend. |
| `NEXT_PUBLIC_AWS_API_URL` | Base URL for the deployed API Gateway HTTP API. Required when AWS backend is enabled. |

When the AWS backend toggle is not enabled, the app runs fully client-side using local browser storage.

# AutoChain Analytics Service (`apps/data`)

FastAPI service for heavier analytics queries against `autochain.db`.

## Local Run
```bash
DATABASE_URL=$(pwd)/autochain.db uvicorn apps.data.main:app --reload --port 8001
```

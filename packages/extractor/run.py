import os
from pathlib import Path

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("EXTRACTOR_PORT", 8022))
    here = Path(__file__).resolve().parent
    print(f"[api] starting on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, reload_dirs=[str(here)], app_dir=str(here))

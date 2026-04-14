import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("EXTRACTOR_PORT", 8000))
    print(f"[extractor] starting on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

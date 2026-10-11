"""`python -m app`: start the copilot. Port from $PORT (default 8100). Works the same on macOS, Linux and Windows; no make needed."""
import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8100")))

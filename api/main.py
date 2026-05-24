"""
Gebya API — FastAPI entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import optimizer, anomaly, alerts

app = FastAPI(
    title="Gebya API",
    description="Community grocery price tracker for Addis Ababa",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimizer.router, prefix="/optimizer", tags=["optimizer"])
app.include_router(anomaly.router,   prefix="/anomaly",   tags=["anomaly"])
app.include_router(alerts.router,    prefix="/alerts",    tags=["alerts"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "gebya-api"}

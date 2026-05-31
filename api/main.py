"""
Gebya API — FastAPI entry point
"""
import os
import sys

# Ensure Vercel's Python environment can resolve local module imports from the api folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import optimizer, anomaly, alerts, compare, push

app = FastAPI(
    title="Gebya API",
    description="Community grocery price tracker for Addis Ababa",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimizer.router, prefix="/optimizer", tags=["optimizer"])
app.include_router(anomaly.router,   prefix="/anomaly",   tags=["anomaly"])
app.include_router(alerts.router,    prefix="/alerts",    tags=["alerts"])
app.include_router(compare.router,   prefix="/compare",   tags=["compare"])
app.include_router(push.router,      prefix="/push",      tags=["push"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "gebya-api"}

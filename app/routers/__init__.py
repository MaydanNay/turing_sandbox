from fastapi import APIRouter

from app.routers import health, sessions, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(sessions.router)
api_router.include_router(ws.router)

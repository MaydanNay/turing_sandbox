"""Turing Sandbox / Bunker — FastAPI entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.connection_manager import manager
from app.event_bus import event_bus
from app.mock_agent import start_mock_agent_supervisor
from app.redis_state import redis_store
from app.routers import api_router
from app.services.phase_machine import start_phase_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_store.connect()
    pubsub_task = await manager.start_pubsub()
    event_bus_task = await event_bus.start_pubsub()
    supervisor = start_mock_agent_supervisor()
    phase_scheduler = start_phase_scheduler()
    logger.info(
        "Turing Sandbox API up on %s:%s (CORS=%s)",
        settings.app_host,
        settings.app_port,
        settings.cors_origin_list,
    )
    try:
        yield
    finally:
        phase_scheduler.cancel()
        supervisor.cancel()
        event_bus_task.cancel()
        pubsub_task.cancel()
        await redis_store.close()
        logger.info("Turing Sandbox API shut down")


app = FastAPI(
    title="Turing Sandbox — Bunker",
    description="MVP backend: rooms, Redis state machine, mock Helixa agents, WS protocol.",
    version="0.1.0",
    lifespan=lifespan,
)

# MVP: allow_origins=["*"] — credentials must be False (browser CORS rule)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "turing_sandbox",
        "docs": "/docs",
        "health": "/health",
        "ws": "/ws/room/{room_id}/{client_id}",
    }

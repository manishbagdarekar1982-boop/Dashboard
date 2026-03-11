"""
MongoDB connection module — connects to stocksemoji-db via SSH tunnel.

Uses pymongo (synchronous). Wrap calls with asyncio.to_thread() in async services.
"""

import logging

from pymongo import MongoClient
from pymongo.database import Database

from backend.config import settings

logger = logging.getLogger(__name__)

_client: MongoClient | None = None
_db: Database | None = None


def connect_mongo() -> Database:
    """Create a MongoClient and return the database handle."""
    global _client, _db

    uri = settings.MONGO_URI
    if not uri:
        raise RuntimeError("MONGO_URI is not configured in .env")

    logger.info("Connecting to MongoDB via %s", uri.split("@")[1] if "@" in uri else uri)
    _client = MongoClient(uri, serverSelectionTimeoutMS=10_000)

    # Force a connection test
    _client.admin.command("ping")
    logger.info("MongoDB connected — databases: %s", _client.list_database_names())

    _db = _client["stocksemoji-db"]
    return _db


def get_mongo_db() -> Database:
    """Return the cached MongoDB database handle."""
    if _db is None:
        raise RuntimeError("MongoDB not initialized. Call connect_mongo() first.")
    return _db


def close_mongo() -> None:
    """Close the MongoDB connection."""
    global _client, _db
    if _client:
        _client.close()
        logger.info("MongoDB connection closed")
    _client = None
    _db = None

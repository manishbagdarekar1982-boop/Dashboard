"""
Database module — manages SSH tunnel (via native ssh subprocess) and
SQLAlchemy async engine.

The sshtunnel Python library has compatibility issues on Windows with
asyncpg. We use a native ssh subprocess instead.
"""

import logging
import shutil
import subprocess
import time
from typing import AsyncGenerator

from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

logger = logging.getLogger(__name__)

# Global tunnel process and engine
_tunnel_proc: subprocess.Popen | None = None
_engine = None
_session_factory: async_sessionmaker | None = None


class Base(DeclarativeBase):
    pass


def _find_ssh() -> str:
    """Return path to the system ssh binary."""
    # Git for Windows ships ssh — check there first
    git_ssh = r"C:\Program Files\Git\usr\bin\ssh.exe"
    system_ssh = shutil.which("ssh")
    import os
    if os.path.exists(git_ssh):
        return git_ssh
    if system_ssh:
        return system_ssh
    raise RuntimeError("ssh binary not found. Install Git for Windows or OpenSSH.")


def start_ssh_tunnel() -> subprocess.Popen:
    """
    Open an SSH tunnel using the system ssh client.
    Forwards 127.0.0.1:<SSH_LOCAL_PORT> → remote localhost:5432.
    Returns the Popen process handle.
    """
    global _tunnel_proc
    ssh = _find_ssh()
    local_pg = f"127.0.0.1:{settings.SSH_LOCAL_PORT}:localhost:5432"
    local_mongo = f"127.0.0.1:{settings.MONGO_LOCAL_PORT}:localhost:27017"

    logger.info(
        "Starting SSH tunnel: %s → %s:%s (local port %s)",
        ssh, settings.SSH_HOST, settings.SSH_PORT, settings.SSH_LOCAL_PORT,
    )

    _tunnel_proc = subprocess.Popen(
        [
            ssh,
            "-o", "StrictHostKeyChecking=no",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
            "-i", settings.SSH_KEY_PATH,
            "-L", local_pg,
            "-L", local_mongo,
            f"{settings.SSH_USER}@{settings.SSH_HOST}",
            "-N",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Wait for tunnel to establish (poll instead of fixed sleep)
    import socket
    for _ in range(10):
        try:
            sock = socket.create_connection(("127.0.0.1", settings.SSH_LOCAL_PORT), timeout=0.5)
            sock.close()
            break
        except (socket.timeout, ConnectionRefusedError, OSError):
            time.sleep(0.3)

    if _tunnel_proc.poll() is not None:
        # Exit code 255 usually means the local port is already in use.
        # This happens when PgAdmin or a previous tunnel is still running.
        # We treat this as "tunnel already available" and proceed.
        logger.warning(
            "SSH tunnel process exited with code %s — "
            "port %s may already be forwarded (e.g. by PgAdmin). "
            "Proceeding with existing tunnel.",
            _tunnel_proc.returncode,
            settings.SSH_LOCAL_PORT,
        )
        _tunnel_proc = None  # not managed by us
    else:
        logger.info("SSH tunnel established — PID %s, local port %s", _tunnel_proc.pid, settings.SSH_LOCAL_PORT)

    return _tunnel_proc


def init_engine() -> None:
    """Create SQLAlchemy async engine connecting through the SSH tunnel."""
    global _engine, _session_factory

    db_url = URL.create(
        drivername="postgresql+asyncpg",
        username=settings.DB_USER,
        password=settings.DB_PASSWORD,
        host="127.0.0.1",
        port=settings.SSH_LOCAL_PORT,
        database=settings.DB_NAME,
    )

    _engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={
            "ssl": False,
            "timeout": 10,
            "command_timeout": 300,
        },
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    logger.info("Database engine initialised (connecting via 127.0.0.1:%s)", settings.SSH_LOCAL_PORT)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async DB session per request."""
    async with _session_factory() as session:
        yield session


async def close_engine() -> None:
    """Dispose the SQLAlchemy connection pool."""
    if _engine:
        await _engine.dispose()
        logger.info("Database engine disposed")


def stop_ssh_tunnel() -> None:
    """Terminate the SSH tunnel subprocess."""
    global _tunnel_proc
    if _tunnel_proc and _tunnel_proc.poll() is None:
        _tunnel_proc.terminate()
        try:
            _tunnel_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _tunnel_proc.kill()
        logger.info("SSH tunnel closed (PID %s)", _tunnel_proc.pid)
    _tunnel_proc = None

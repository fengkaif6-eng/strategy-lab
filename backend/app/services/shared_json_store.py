from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover - optional dependency fallback
    MongoClient = None


DEFAULT_RUNTIME_DATA_DIR = Path(tempfile.gettempdir()) / 'strategy-lab-market-data'
RUNTIME_DATA_DIR = Path(
    os.getenv('MARKET_RUNTIME_DATA_DIR', str(DEFAULT_RUNTIME_DATA_DIR))
).resolve()
RUNTIME_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


class SharedJsonStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._strict = _env_flag('MARKET_SHARED_STORE_REQUIRED', default=False)
        self._mode = 'file'
        self._mongo_client: Any = None
        self._mongo_collection: Any = None
        self._file_dir = RUNTIME_DATA_DIR

        uri = (
            os.getenv('MARKET_SHARED_STORE_MONGODB_URI', '').strip()
            or os.getenv('MONGODB_URI', '').strip()
            or os.getenv('MONGO_URI', '').strip()
        )
        if not uri:
            if self._strict:
                raise RuntimeError(
                    'MARKET_SHARED_STORE_MONGODB_URI is required when MARKET_SHARED_STORE_REQUIRED=1'
                )
            return

        if MongoClient is None:
            if self._strict:
                raise RuntimeError('pymongo is required for shared MongoDB store')
            return

        db_name = (
            os.getenv('MARKET_SHARED_STORE_MONGODB_DB', '').strip()
            or os.getenv('MONGODB_DB', '').strip()
            or 'strategy_lab'
        )
        collection_name = (
            os.getenv('MARKET_SHARED_STORE_MONGODB_COLLECTION', '').strip()
            or 'shared_kv'
        )

        try:
            client = MongoClient(
                uri,
                serverSelectionTimeoutMS=3000,
                connectTimeoutMS=3000,
                socketTimeoutMS=5000,
                retryWrites=True,
            )
            client.admin.command('ping')
            self._mongo_client = client
            self._mongo_collection = client[db_name][collection_name]
            self._mode = 'mongo'
        except Exception:
            if self._strict:
                raise

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def strict_required(self) -> bool:
        return self._strict

    def _file_path(self, key: str) -> Path:
        safe = ''.join(ch if ch.isalnum() or ch in {'-', '_'} else '_' for ch in key)
        return self._file_dir / f'{safe}.json'

    def _get_from_file(self, key: str) -> Any | None:
        path = self._file_path(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            if self._strict:
                raise
            return None

    def _set_to_file(self, key: str, value: Any) -> None:
        path = self._file_path(key)
        tmp_path = path.with_suffix('.tmp')
        payload = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        tmp_path.write_text(payload, encoding='utf-8')
        tmp_path.replace(path)

    def _get_from_mongo(self, key: str) -> Any | None:
        if self._mongo_collection is None:
            return None
        try:
            doc = self._mongo_collection.find_one({'_id': key})
            if not doc:
                return None
            return doc.get('value')
        except Exception:
            if self._strict:
                raise
            return None

    def _set_to_mongo(self, key: str, value: Any) -> None:
        if self._mongo_collection is None:
            return
        try:
            self._mongo_collection.update_one(
                {'_id': key},
                {
                    '$set': {
                        'value': value,
                        'updatedAt': datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )
        except Exception:
            if self._strict:
                raise

    def get_json(self, key: str) -> Any | None:
        with self._lock:
            if self._mode == 'mongo':
                value = self._get_from_mongo(key)
                if value is not None or self._strict:
                    return value
                return self._get_from_file(key)
            return self._get_from_file(key)

    def set_json(self, key: str, value: Any) -> None:
        with self._lock:
            if self._mode == 'mongo':
                self._set_to_mongo(key, value)
                if self._strict:
                    return
            self._set_to_file(key, value)


shared_json_store = SharedJsonStore()

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "anchor.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                thumbnail TEXT DEFAULT '',
                channel TEXT DEFAULT '',
                duration TEXT DEFAULT '',
                subtitle_status TEXT DEFAULT 'none',
                added_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                content TEXT NOT NULL,
                generated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (video_id) REFERENCES videos(id)
            )
        """)
        conn.commit()

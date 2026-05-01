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
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                thumbnail TEXT DEFAULT '',
                channel TEXT DEFAULT '',
                duration TEXT DEFAULT '',
                subtitle_status TEXT DEFAULT 'none',
                folder_id INTEGER REFERENCES folders(id),
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        # Migrate existing databases that lack folder_id column
        cols = [r[1] for r in conn.execute("PRAGMA table_info(videos)").fetchall()]
        if "folder_id" not in cols:
            conn.execute("ALTER TABLE videos ADD COLUMN folder_id INTEGER REFERENCES folders(id)")
        # Ensure the system Anchoring folder always exists
        if not conn.execute("SELECT id FROM folders WHERE name = 'Anchoring'").fetchone():
            conn.execute("INSERT INTO folders (name) VALUES ('Anchoring')")
        conn.commit()

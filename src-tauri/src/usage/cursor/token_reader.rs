use std::fs;
use std::path::Path;

use rusqlite::{Connection, OpenFlags};

#[derive(Debug, Clone, Default)]
pub struct CursorTokens {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}

const ACCESS_TOKEN_KEY: &str = "cursorAuth/accessToken";
const REFRESH_TOKEN_KEY: &str = "cursorAuth/refreshToken";

pub fn read() -> CursorTokens {
    let db_path = crate::usage::paths::cursor_state_database();
    if !db_path.exists() {
        return CursorTokens::default();
    }
    match read_from_path(&db_path) {
        Ok(tokens) => tokens,
        Err(rusqlite::Error::SqliteFailure(_, _)) => {
            let temp = std::env::temp_dir().join(format!(
                "cursor-state-{}.vscdb",
                uuid::Uuid::new_v4().simple()
            ));
            if fs::copy(&db_path, &temp).is_ok() {
                let result = read_from_path(&temp);
                let _ = fs::remove_file(temp);
                result.unwrap_or_default()
            } else {
                CursorTokens::default()
            }
        }
        Err(_) => CursorTokens::default(),
    }
}

fn read_from_path(path: &Path) -> rusqlite::Result<CursorTokens> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    Ok(CursorTokens {
        access_token: read_value(&conn, ACCESS_TOKEN_KEY)?,
        refresh_token: read_value(&conn, REFRESH_TOKEN_KEY)?,
    })
}

fn read_value(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    match conn.query_row("SELECT value FROM ItemTable WHERE key = ?1", [key], |row| {
        row.get::<_, Option<String>>(0)
    }) {
        Ok(value) => Ok(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn has_access_token() -> bool {
    read()
        .access_token
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
}

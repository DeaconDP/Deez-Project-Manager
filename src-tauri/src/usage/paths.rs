use std::path::PathBuf;

pub const SETTINGS_SLUG: &str = "ada-monitor-fuel";

pub fn local_app_data() -> Option<PathBuf> {
    dirs::data_local_dir()
}

pub fn user_profile() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn fuel_settings_dir() -> PathBuf {
    local_app_data()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ada-monitor")
        .join("fuel")
}

pub fn fuel_settings_path() -> PathBuf {
    fuel_settings_dir().join("settings.json")
}

pub fn credentials_dir() -> PathBuf {
    fuel_settings_dir().join("credentials")
}

pub fn cursor_state_database() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Cursor")
        .join("User")
        .join("globalStorage")
        .join("state.vscdb")
}

pub fn antigravity_state_database_paths() -> Vec<PathBuf> {
    let app_data = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    vec![
        app_data
            .join("Antigravity IDE")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb"),
        app_data
            .join("Antigravity")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb"),
    ]
}

pub fn cursor_executable_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let local = local_app_data().unwrap_or_else(|| PathBuf::from("."));
        vec![
            local.join("Programs").join("cursor").join("Cursor.exe"),
            local.join("cursor").join("Cursor.exe"),
        ]
    }
    #[cfg(target_os = "macos")]
    {
        let mut paths = vec![PathBuf::from(
            "/Applications/Cursor.app/Contents/MacOS/Cursor",
        )];
        if let Some(home) = user_profile() {
            paths.push(
                home.join("Applications")
                    .join("Cursor.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("Cursor"),
            );
        }
        paths
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        vec![
            PathBuf::from("/usr/bin/cursor"),
            PathBuf::from("/usr/local/bin/cursor"),
        ]
    }
}

pub fn antigravity_executable_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let local = local_app_data().unwrap_or_else(|| PathBuf::from("."));
        vec![
            local
                .join("Programs")
                .join("Antigravity IDE")
                .join("Antigravity IDE.exe"),
            local.join("Antigravity IDE").join("Antigravity IDE.exe"),
        ]
    }
    #[cfg(target_os = "macos")]
    {
        let bundles = ["Antigravity IDE.app", "Antigravity.app"];
        let mut paths = Vec::new();
        for bundle in bundles {
            let executable = bundle.trim_end_matches(".app");
            paths.push(
                PathBuf::from("/Applications")
                    .join(bundle)
                    .join("Contents")
                    .join("MacOS")
                    .join(executable),
            );
            if let Some(home) = user_profile() {
                paths.push(
                    home.join("Applications")
                        .join(bundle)
                        .join("Contents")
                        .join("MacOS")
                        .join(executable),
                );
            }
        }
        paths
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Vec::new()
    }
}

pub fn codex_auth_file() -> PathBuf {
    std::env::var("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            user_profile()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".codex")
        })
        .join("auth.json")
}

pub fn gemini_oauth_credentials() -> PathBuf {
    user_profile()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gemini")
        .join("oauth_creds.json")
}

pub fn claude_config_dir() -> PathBuf {
    std::env::var("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            user_profile()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".claude")
        })
}

pub fn claude_code_credentials() -> PathBuf {
    claude_config_dir().join(".credentials.json")
}

pub fn opencode_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(p) = std::env::var("OPENCODE_AUTH_PATH") {
        paths.push(PathBuf::from(p));
    }
    if let Some(home) = user_profile() {
        paths.push(
            home.join(".local")
                .join("share")
                .join("opencode")
                .join("auth.json"),
        );
    }
    if let Some(local) = local_app_data() {
        paths.push(local.join("opencode").join("auth.json"));
    }
    paths
}

pub fn gemini_cli_oauth_js_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_env) {
            paths.push(
                dir.join("node_modules")
                    .join("@google")
                    .join("gemini-cli-core")
                    .join("dist")
                    .join("src")
                    .join("code_assist")
                    .join("oauth2.js"),
            );
            paths.push(
                dir.join("node_modules")
                    .join("@google")
                    .join("gemini-cli")
                    .join("node_modules")
                    .join("@google")
                    .join("gemini-cli-core")
                    .join("dist")
                    .join("src")
                    .join("code_assist")
                    .join("oauth2.js"),
            );
        }
    }
    paths
}

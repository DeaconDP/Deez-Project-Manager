use crate::models::GithubRepo;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct ApiRepo {
    name: String,
    full_name: String,
    html_url: String,
    description: Option<String>,
    language: Option<String>,
    updated_at: String,
    private: bool,
}

fn map_status_err(status: ureq::http::StatusCode, authenticated: bool) -> String {
    if status == 403 || status == 429 {
        if authenticated {
            return "GH-002: GitHub rate limited or forbidden. Check PAT scopes (gist + repo)."
                .into();
        }
        return "GH-002: GitHub rate limited. Try again later, or save a PAT (gist + repo) in Settings.".into();
    }
    if status == 401 {
        return "GH-005: GitHub rejected the PAT — need gist + repo scopes.".into();
    }
    format!("GH-003: GitHub returned HTTP {status}")
}

fn get_json(url: &str, pat: Option<&str>) -> Result<ureq::http::Response<ureq::Body>, String> {
    let mut req = ureq::get(url)
        .header("User-Agent", "Deez-Project-Manager/0.1")
        .header("Accept", "application/vnd.github+json");
    if let Some(token) = pat.filter(|t| !t.trim().is_empty()) {
        req = req.header("Authorization", format!("Bearer {}", token.trim()));
    }
    req.call()
        .map_err(|e| format!("GH-001: GitHub request failed: {e}"))
}

fn parse_page(body: Vec<ApiRepo>, all: &mut Vec<GithubRepo>) -> usize {
    let count = body.len();
    for repo in body {
        all.push(GithubRepo {
            name: repo.name,
            full_name: repo.full_name,
            html_url: repo.html_url,
            description: repo.description,
            language: repo.language,
            updated_at: repo.updated_at,
            private: repo.private,
        });
    }
    count
}

/// List repos for a user. With a PAT, uses authenticated `/user/repos` (private + public
/// owned by the token). Without a PAT, uses public `/users/{username}/repos`.
pub fn list_user_repos(username: &str, pat: Option<&str>) -> Result<Vec<GithubRepo>, String> {
    let authenticated = pat.map(|t| !t.trim().is_empty()).unwrap_or(false);
    let mut all = Vec::new();
    let mut page = 1u32;

    loop {
        let url = if authenticated {
            format!(
                "https://api.github.com/user/repos?affiliation=owner&per_page=100&page={page}&sort=updated"
            )
        } else {
            format!(
                "https://api.github.com/users/{username}/repos?per_page=100&page={page}&sort=updated"
            )
        };

        let response = get_json(&url, pat)?;
        let status = response.status();
        if !status.is_success() {
            return Err(map_status_err(status, authenticated));
        }

        let body: Vec<ApiRepo> = response
            .into_body()
            .read_json()
            .map_err(|e| format!("GH-004: failed to parse GitHub response: {e}"))?;

        let count = parse_page(body, &mut all);

        if count < 100 {
            break;
        }
        page += 1;
        if page > 20 {
            break;
        }
    }

    Ok(all)
}

/// Map of `owner/repo` → private flag from a repo list.
pub fn visibility_map(repos: &[GithubRepo]) -> HashMap<String, bool> {
    repos
        .iter()
        .map(|r| (r.full_name.clone(), r.private))
        .collect()
}

/// Fetch visibility for one repo. With PAT can see private; without, only public.
pub fn fetch_repo_visibility(full_name: &str, pat: Option<&str>) -> Result<bool, String> {
    let name = full_name.trim().trim_start_matches('/');
    if name.is_empty() || !name.contains('/') {
        return Err(format!("GH-006: invalid githubRepo '{full_name}'"));
    }
    let authenticated = pat.map(|t| !t.trim().is_empty()).unwrap_or(false);
    let url = format!("https://api.github.com/repos/{name}");

    let response = get_json(&url, pat)?;
    let status = response.status();
    if !status.is_success() {
        return Err(map_status_err(status, authenticated));
    }

    let body: ApiRepo = response
        .into_body()
        .read_json()
        .map_err(|e| format!("GH-004: failed to parse GitHub response: {e}"))?;

    Ok(body.private)
}

use crate::models::GithubRepo;
use serde::Deserialize;

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

pub fn list_user_repos(username: &str) -> Result<Vec<GithubRepo>, String> {
    let mut all = Vec::new();
    let mut page = 1u32;

    loop {
        let url = format!(
            "https://api.github.com/users/{username}/repos?per_page=100&page={page}&sort=updated"
        );
        let response = ureq::get(&url)
            .header("User-Agent", "Deez-Project-Manager/0.1")
            .header("Accept", "application/vnd.github+json")
            .call()
            .map_err(|e| format!("GH-001: GitHub request failed: {e}"))?;

        let status = response.status();
        if status == 403 || status == 429 {
            return Err(
                "GH-002: GitHub rate limited. Try again later (public API, no token in v1).".into(),
            );
        }
        if !status.is_success() {
            return Err(format!("GH-003: GitHub returned HTTP {status}"));
        }

        let body: Vec<ApiRepo> = response
            .into_body()
            .read_json()
            .map_err(|e| format!("GH-004: failed to parse GitHub response: {e}"))?;

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

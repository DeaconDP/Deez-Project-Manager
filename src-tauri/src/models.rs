use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum Priority {
    Default,
    Low,
    Med,
    High,
    Crit,
}

impl Default for Priority {
    fn default() -> Self {
        Priority::Default
    }
}

impl<'de> Deserialize<'de> for Priority {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(match s.as_str() {
            "Default" | "Backlog" => Priority::Default,
            "Low" | "P3" => Priority::Low,
            "Med" | "P2" => Priority::Med,
            "High" | "P1" => Priority::High,
            "Crit" | "P0" => Priority::Crit,
            _ => Priority::Default,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Platform {
    Unity,
    Unreal,
    Web,
    Viverse,
    Consulting,
    Other,
}

impl Default for Platform {
    fn default() -> Self {
        Platform::Other
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GithubStatus {
    None,
    RemoteOnly,
    Clean,
    Dirty,
    Ahead,
    Behind,
    Diverged,
    Error,
}

impl Default for GithubStatus {
    fn default() -> Self {
        GithubStatus::None
    }
}

fn default_status() -> String {
    "To Do".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub sort_index: i32,
    pub priority: Priority,
    pub platform: Platform,
    #[serde(default = "default_status")]
    pub status: String,
    pub category: String,
    pub location: String,
    pub local_path: Option<String>,
    pub unity_version: Option<String>,
    pub github_url: Option<String>,
    pub github_repo: Option<String>,
    pub github_status: GithubStatus,
    pub favorite: bool,
    #[serde(default)]
    pub archived: bool,
    pub notes: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub has_run_script: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum KanbanColumn {
    Backlog,
    Priority,
    Doing,
    Testing,
    Done,
}

impl Default for KanbanColumn {
    fn default() -> Self {
        KanbanColumn::Backlog
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskComment {
    pub id: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub column: KanbanColumn,
    #[serde(default)]
    pub priority: Priority,
    pub sort_index: i32,
    #[serde(default)]
    pub comments: Vec<TaskComment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trello_card_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStore {
    pub version: u32,
    pub projects: Vec<Project>,
    #[serde(default)]
    pub sync_roots: Vec<String>,
    #[serde(default)]
    pub tasks: Vec<Task>,
}

impl Default for ProjectStore {
    fn default() -> Self {
        Self {
            version: 1,
            projects: Vec::new(),
            sync_roots: Vec::new(),
            tasks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub exists: bool,
    pub is_unity: bool,
    pub is_unreal: bool,
    pub platform: Platform,
    pub unity_version: Option<String>,
    pub git_remote_url: Option<String>,
    pub github_repo: Option<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub has_run_script: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepo {
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub updated_at: String,
    pub private: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub added: u32,
    pub skipped: u32,
    #[serde(default)]
    pub updated: u32,
    pub projects: Vec<Project>,
}

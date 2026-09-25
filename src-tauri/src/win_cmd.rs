use std::process::Command;

/// On Windows GUI apps, console child processes flash a terminal unless
/// CREATE_NO_WINDOW is set. Use this for every quiet console tool (`git`,
/// `powershell`, `netsh`, …). Leave intentional UI launches (`explorer`,
/// `cmd /C start` for `run.bat`) on plain `Command::new`.
pub fn command(program: &str) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        Command::new(program)
    }
}

#[cfg(test)]
mod tests {
    /// Quiet git must never use raw `Command::new("git")` on Windows GUI
    /// parents — each spawn flashes a console. Route through `win_cmd::command`.
    #[test]
    fn quiet_git_callers_use_win_cmd() {
        let project_fs = include_str!("project_fs.rs");
        let launch_gate = include_str!("launch_gate.rs");
        assert!(
            !project_fs.contains("Command::new(\"git\")"),
            "project_fs must spawn git via win_cmd::command (CREATE_NO_WINDOW)"
        );
        assert!(
            !launch_gate.contains("Command::new(\"git\")"),
            "launch_gate must spawn git via win_cmd::command (CREATE_NO_WINDOW)"
        );
        assert!(
            project_fs.contains("win_cmd::command(\"git\")"),
            "project_fs should call win_cmd::command(\"git\")"
        );
        assert!(
            launch_gate.contains("win_cmd::command(\"git\")"),
            "launch_gate should call win_cmd::command(\"git\")"
        );
    }
}

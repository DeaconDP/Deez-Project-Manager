use std::process::Command;

/// Build a `Command` with Windows `CREATE_NO_WINDOW` so quiet console tools
/// (`git`, `powershell`, …) do not flash a terminal under a GUI parent.
/// Intentional UI launches (`explorer`, `cmd /C start` for `run.bat`) stay on
/// plain `Command::new`.
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
    #[test]
    fn quiet_git_callers_use_win_cmd() {
        let project_fs = include_str!("project_fs.rs");
        let launch_gate = include_str!("launch_gate.rs");
        assert!(
            !project_fs.contains("Command::new(\"git\")"),
            "project_fs must spawn git via win_cmd::command"
        );
        assert!(
            !launch_gate.contains("Command::new(\"git\")"),
            "launch_gate must spawn git via win_cmd::command"
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

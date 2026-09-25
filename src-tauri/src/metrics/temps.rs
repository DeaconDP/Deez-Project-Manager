use crate::types::TempMetrics;

/// Best-effort thermal sample. Missing sensors → None / notes, never fake zeros.
pub fn sample_temps(gpu_c: Option<f32>) -> TempMetrics {
    #[cfg(windows)]
    {
        // Do not spawn PowerShell/WMI here. On Ada it hung and flashed console
        // children every sampler tick. GPU °C still arrives via nvidia-smi.
        TempMetrics {
            cpu_c: None,
            gpu_c,
            zones: Vec::new(),
            notes: vec![
                "CPU ACPI thermal probe skipped on Windows (avoids console spawn).".into(),
            ],
        }
    }

    #[cfg(not(windows))]
    {
        #[cfg(target_os = "macos")]
        let note = "CPU thermal sampling is not available on macOS yet.";
        #[cfg(not(target_os = "macos"))]
        let note = "CPU thermal sampling is not available on this platform.";
        TempMetrics {
            cpu_c: None,
            gpu_c,
            zones: Vec::new(),
            notes: vec![note.into()],
        }
    }
}

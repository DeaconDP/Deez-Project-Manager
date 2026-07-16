use crate::types::{TempMetrics, TempZone};

/// Best-effort thermal sample. Missing sensors → None / notes, never fake zeros.
pub fn sample_temps(gpu_c: Option<f32>) -> TempMetrics {
    let mut zones = Vec::new();
    let mut notes = Vec::new();
    let mut cpu_c = None;

    #[cfg(windows)]
    {
        match sample_wmi_thermal() {
            Ok(z) => {
                if z.is_empty() {
                    notes.push(
                        "No ACPI thermal zones reported (common without admin / firmware expose)."
                            .into(),
                    );
                } else {
                    if let Some(first) = z.first() {
                        cpu_c = Some(first.temp_c);
                    }
                    zones = z;
                }
            }
            Err(e) => notes.push(format!("Thermal query unavailable: {e}")),
        }
    }

    #[cfg(not(windows))]
    {
        notes.push("Thermal sampling is Windows-only in this build.".into());
    }

    TempMetrics {
        cpu_c,
        gpu_c,
        zones,
        notes,
    }
}

#[cfg(windows)]
fn sample_wmi_thermal() -> Result<Vec<TempZone>, String> {
    // Kelvin × 10 from MSAcpi_ThermalZoneTemperature when exposed.
    let script = r#"
Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
  ForEach-Object {
    $c = ($_.CurrentTemperature / 10.0) - 273.15
    if ($c -gt -40 -and $c -lt 150) {
      [PSCustomObject]@{ Name = $_.InstanceName; TempC = [math]::Round($c, 1) }
    }
  } | ConvertTo-Json -Compress
"#;

    let output = crate::win_cmd::command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("PowerShell thermal query failed".into());
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(vec![]);
    }

    parse_thermal_json(&text)
}

#[cfg(windows)]
fn parse_thermal_json(text: &str) -> Result<Vec<TempZone>, String> {
    #[derive(serde::Deserialize)]
    struct Row {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "TempC")]
        temp_c: f32,
    }

    if text.starts_with('[') {
        let rows: Vec<Row> = serde_json::from_str(text).map_err(|e| e.to_string())?;
        Ok(rows
            .into_iter()
            .map(|r| TempZone {
                name: r.name,
                temp_c: r.temp_c,
            })
            .collect())
    } else {
        let row: Row = serde_json::from_str(text).map_err(|e| e.to_string())?;
        Ok(vec![TempZone {
            name: row.name,
            temp_c: row.temp_c,
        }])
    }
}

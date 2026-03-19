#[tauri::command]
fn upload_sales_data(data: Vec<u8>, filename: String) -> String {
    // Parse CSV → Save to app data dir → Return row count
    format!("Loaded {} rows from {}", data.len(), filename)
}

#[tauri::command]
fn generate_forecast(periods: u32) -> Result<serde_json::Value, String> {
    // Your Python forecasting logic here (call via pyo3 or embedded Python)
    // Return JSON with historical, forecast, risk_score, trend
    Ok(serde_json::json!({
        "historical": [1250, 1450, 1670],
        "forecast": [1820, 1950, 2100],
        "risk_score": 12.5,
        "trend": "Positive"
    }))
}

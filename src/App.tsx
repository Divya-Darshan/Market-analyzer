import { useState, useRef, useEffect } from "react";
import "./App.css";

interface ForecastResult {
  historical: number[];
  forecast: number[];
  dates: string[];
  risk_score: number;
  trend: string;
  growth_rate: number;
}

function App() {
  const [fileName, setFileName] = useState("No file selected");
  const [periods, setPeriods] = useState(12);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [salesData, setSalesData] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 🔥 FIXED: Standard deviation function
  const stdDev = (arr: number[]): number => {
    if (arr.length < 2) return 0;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  // 🔥 PURE JAVASCRIPT FORECASTING
  const calculateForecast = (salesData: number[], periods: number): Omit<ForecastResult, 'dates'> => {
    if (salesData.length < 2) {
      return { historical: salesData, forecast: [], risk_score: 0, trend: "No Data", growth_rate: 0 };
    }

    const n = salesData.length;
    const avg = salesData.reduce((a, b) => a + b, 0) / n;
    
    // Linear regression slope
    const x = Array.from({ length: n }, (_, i) => i);
    const slope = (n * salesData.reduce((a, b, i) => a + b * x[i], 0) - 
                   salesData.reduce((a, b) => a + b, 0) * x.reduce((a, b) => a + b, 0)) /
                  (n * x.reduce((a, b) => a + b * b, 0) - Math.pow(x.reduce((a, b) => a + b, 0), 2));
    
    // Generate forecast
    const forecast: number[] = [];
    for (let i = 0; i < periods; i++) {
      const predicted = avg + slope * (n + i);
      forecast.push(Math.max(0, predicted + (Math.random() - 0.5) * avg * 0.1));
    }

    const growth_rate = slope / avg * 100;
    const risk_score = Math.min(100, stdDev(forecast) / avg * 100);
    const trend = growth_rate > 2 ? "Positive 📈" : growth_rate < -2 ? "Negative 📉" : "Stable ➡️";

    return { historical: salesData, forecast, risk_score, trend, growth_rate };
  };

  // 🔥 FIXED: CSV parser with real data storage
  const parseCSV = (csv: string): number[] => {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const salesIndex = headers.indexOf('sales') !== -1 ? headers.indexOf('sales') : 1;
    
    return lines.slice(1)
      .map(line => {
        const cols = line.split(',').map(col => col.trim());
        const value = parseFloat(cols[salesIndex] || '0');
        return isNaN(value) ? 0 : value;
      })
      .filter(v => v > 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const data = parseCSV(csv);
        setSalesData(data);
        setStatus(`✅ Loaded ${data.length} sales records`);
        setForecast(null); // Reset forecast
      } catch (error) {
        setStatus("❌ Invalid CSV. Use 'date,sales' format.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const generateForecast = () => {
    if (salesData.length === 0) {
      setStatus("❌ Please upload CSV first!");
      return;
    }

    setLoading(true);
    setStatus("🔄 Generating forecast...");

    setTimeout(() => {
      const result = calculateForecast(salesData, periods);
      
      // Generate dates
      const dates: string[] = [];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (let i = 0; i < salesData.length; i++) {
        dates.push(`'25-${months[i % 12]}`);
      }
      for (let i = 0; i < periods; i++) {
        dates.push(`'26-${months[(salesData.length + i) % 12]}`);
      }

      const fullResult: ForecastResult = { ...result, dates };
      setForecast(fullResult);
      setStatus("✅ Forecast complete!");
      
      // Draw chart
      setTimeout(() => drawChart(fullResult), 100);
      setLoading(false);
    }, 800);
  };

  // 🔥 FIXED: Canvas chart with proper sizing
  const drawChart = (result: ForecastResult) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    const allData = [...result.historical, ...result.forecast];
    const maxVal = Math.max(...allData);




    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = (i / 6) * width;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }

    // Historical line (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    result.historical.forEach((val, i) => {
      const x = padding + (i / (result.historical.length - 1)) * (width - 2 * padding);
      const y = height - padding - (val / maxVal) * (height - 2 * padding);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Forecast line (red dashed)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    result.forecast.forEach((val, i) => {
      const x = padding + ((result.historical.length + i) / (result.historical.length + result.forecast.length - 1)) * (width - 2 * padding);
      const y = height - padding - (val / maxVal) * (height - 2 * padding);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Legend
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Historical Sales', padding, 25);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(padding - 5, 12, 15, 3);
    
    ctx.fillStyle = '#1f2937';
    ctx.fillText('Forecast', padding, 50);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(padding - 5, 37, 15, 3);
  };

  // Canvas resize handler
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        if (forecast) drawChart(forecast);
      }
    };
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [forecast]);

  return (
    <main className="container">
      <div className="header">
        <h1> Sales Forecasting Dashboard</h1>
        <p>Pure Frontend • Instant CSV Analysis • No Backend Required</p>
      </div>

      <div className="card upload-section">
        <input 
          id="file-upload" 
          type="file" 
          accept=".csv" 
          onChange={handleFileUpload}
          disabled={loading}
        />
        <label htmlFor="file-upload" className={`upload-btn ${loading ? 'disabled' : ''}`}>
          {loading ? 'Processing...' : 'Upload Sales CSV'}
        </label>
        <div className="file-info">
          {fileName === "No file selected" ? "sales_data.csv (date,sales)" : fileName}
          {salesData.length > 0 && ` • ${salesData.length} records`}
        </div>
      </div>

      <div className="card controls-section">
        <div className="controls">
          <label>
            Forecast Periods: 
            <input 
              type="number" 
              min="1" 
              max="24" 
              value={periods} 
              onChange={(e) => setPeriods(Number(e.target.value))}
              disabled={loading}
            />
          </label>
          <button 
            onClick={generateForecast} 
            disabled={loading || salesData.length === 0}
            className={`forecast-btn ${loading || salesData.length === 0 ? 'disabled' : ''}`}
          >
            {loading ? "Calculating..." : " Generate Forecast"}
          </button>
        </div>
        {status && <div className="status">{status}</div>}
      </div>

      {forecast && (
        <>
          <div className="card chart-container">
            <h3> Sales Forecast Visualization</h3>
            <div className="canvas-wrapper">
              <canvas ref={canvasRef} className="chart-canvas" />
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat risk">
              <h4>🎯 Risk Score</h4>
              <div>{forecast.risk_score.toFixed(1)}%</div>
            </div>
            <div className="stat trend">
              <h4> Trend Analysis</h4>
              <div>{forecast.trend}</div>
            </div>
            <div className="stat growth">
              <h4> Growth Rate</h4>
              <div>{forecast.growth_rate.toFixed(1)}%</div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default App;

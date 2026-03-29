import { useState, useRef, useEffect } from "react";
import * as echarts from 'echarts';
import "./App.css";

interface Candlestick {
  open: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
}

interface ForecastResult {
  historical: number[];
  forecast: number[];
  candlesticks: Candlestick[];
  forecastCandlesticks: Candlestick[];
  dates: string[];
  risk_score: number;
  volatility: number;
  trend: string;
  growth_rate: number;
  rsi: number;
  macd: number;
  bollinger_upper: number;
  bollinger_lower: number;
  sma_20: number;
  support_level: number;
  resistance_level: number;
  atr: number;
  win_rate: number;
  stochastic: number;
  pivot_point: number;
  fib_level_1: number;
  fib_level_2: number;
  keltner_upper: number;
  keltner_lower: number;
  dmi_plus: number;
  dmi_minus: number;
}

function App() {
  const [fileName, setFileName] = useState("No file selected");
  const [periods, setPeriods] = useState(12);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [salesData, setSalesData] = useState<number[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '4H' | 'D' | 'W'>('D');
  const [showTechnical, setShowTechnical] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Calculate technical indicators
  const calculateTechnicalIndicators = (data: number[]) => {
    const n = data.length;
    const avg = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n;
    const volatility = Math.sqrt(variance) / avg * 100;
    
    // RSI (Relative Strength Index) - 14 period
    const deltas = [];
    for (let i = 1; i < n; i++) {
      deltas.push(data[i] - data[i - 1]);
    }
    const gains = deltas.filter(d => d > 0).reduce((a, b) => a + b, 0) / 14;
    const losses = Math.abs(deltas.filter(d => d < 0).reduce((a, b) => a + b, 0)) / 14;
    const rs = gains / losses;
    const rsi = 100 - (100 / (1 + rs));
    
    // MACD
    const ema12 = data[n - 1] * 0.15;
    const ema26 = data[n - 1] * 0.07;
    const macd = ema12 - ema26;
    
    // Bollinger Bands (20-period SMA, 2 std dev)
    const sma20 = data.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const bb_variance = data.slice(-20).reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
    const std_dev = Math.sqrt(bb_variance);
    
    return {
      volatility: Math.max(0, volatility),
      rsi: Math.min(100, Math.max(0, isNaN(rsi) ? 50 : rsi)),
      macd: macd || 0,
      sma20,
      bb_upper: sma20 + (2 * std_dev),
      bb_lower: sma20 - (2 * std_dev),
    };
  };

  // Generate candlestick data from flat price data
  const generateCandlesticks = (data: number[]): Candlestick[] => {
    const candlesticks: Candlestick[] = [];
    const groupSize = Math.max(1, Math.ceil(data.length / 20));
    
    for (let i = 0; i < data.length; i += groupSize) {
      const chunk = data.slice(i, i + groupSize);
      const open = chunk[0];
      const close = chunk[chunk.length - 1];
      const high = Math.max(...chunk);
      const low = Math.min(...chunk);
      const volume = chunk.length;
      
      candlesticks.push({ open, close, high, low, volume });
    }
    
    return candlesticks;
  };

  // Calculate support and resistance levels
  const calculateLevels = (data: Candlestick[]) => {
    const highs = data.map(c => c.high).sort((a, b) => b - a);
    const lows = data.map(c => c.low).sort((a, b) => a - b);
    const resistance_level = highs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const support_level = lows.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    
    return { resistance_level, support_level };
  };

  const stdDev = (arr: number[]): number => {
    if (arr.length < 2) return 0;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const calculateForecast = (salesData: number[], periods: number): Omit<ForecastResult, 'dates'> => {
    if (salesData.length < 2) {
      return {
        historical: salesData,
        forecast: [],
        candlesticks: [],
        forecastCandlesticks: [],
        risk_score: 0,
        volatility: 0,
        trend: "Insufficient Data",
        growth_rate: 0,
        rsi: 50,
        macd: 0,
        bollinger_upper: 0,
        bollinger_lower: 0,
        sma_20: 0,
        support_level: 0,
        resistance_level: 0,
        atr: 0,
        win_rate: 0,
        stochastic: 50,
        pivot_point: 0,
        fib_level_1: 0,
        fib_level_2: 0,
        keltner_upper: 0,
        keltner_lower: 0,
        dmi_plus: 0,
        dmi_minus: 0,
      };
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
    const trend = growth_rate > 2 ? "Bullish" : growth_rate < -2 ? "Bearish" : "Consolidation";

    // Generate candlesticks
    const candlesticks = generateCandlesticks(salesData);
    const forecastCandlesticks = generateCandlesticks(forecast);

    // Calculate technical indicators
    const indicators = calculateTechnicalIndicators(salesData);
    const levels = calculateLevels(candlesticks);

    // ATR (Average True Range)
    const atr = stdDev(salesData.map((v, i) => i > 0 ? Math.abs(v - salesData[i - 1]) : 0)) / avg * 100;
    
    // Win rate (percentage of bars closing above open)
    const wins = candlesticks.filter(c => c.close > c.open).length;
    const win_rate = (wins / candlesticks.length) * 100;

    // Stochastic Oscillator (14,3,3)
    const lowMin = Math.min(...salesData.slice(-14));
    const highMax = Math.max(...salesData.slice(-14));
    const stochastic = highMax === lowMin ? 50 : ((salesData[n-1] - lowMin) / (highMax - lowMin)) * 100;

    // Pivot Points
    const high = Math.max(...candlesticks.map(c => c.high));
    const low = Math.min(...candlesticks.map(c => c.low));
    const close = candlesticks[candlesticks.length - 1].close;
    const pivot_point = (high + low + close) / 3;

    // Fibonacci retracement levels
    const range = high - low;
    const fib_level_1 = high - range * 0.236;
    const fib_level_2 = high - range * 0.382;

    // Keltner Channels
    const keltner_upper = indicators.sma20 + (2 * atr / 100 * avg);
    const keltner_lower = indicators.sma20 - (2 * atr / 100 * avg);

    // ADX / DMI (simplified)
    const dmiPeriod = Math.min(14, n);
    const upMoves = salesData.filter((v, i) => i > 0 && v > salesData[i-1]).length;
    const downMoves = salesData.filter((v, i) => i > 0 && v < salesData[i-1]).length;
    const dmi_plus = (upMoves / dmiPeriod) * 100;
    const dmi_minus = (downMoves / dmiPeriod) * 100;

    return {
      historical: salesData,
      forecast,
      candlesticks,
      forecastCandlesticks,
      risk_score,
      volatility: indicators.volatility,
      trend,
      growth_rate,
      rsi: indicators.rsi,
      macd: indicators.macd,
      bollinger_upper: indicators.bb_upper,
      bollinger_lower: indicators.bb_lower,
      sma_20: indicators.sma20,
      support_level: levels.support_level,
      resistance_level: levels.resistance_level,
      atr,
      win_rate,
      stochastic: Math.min(100, Math.max(0, stochastic)),
      pivot_point,
      fib_level_1,
      fib_level_2,
      keltner_upper,
      keltner_lower,
      dmi_plus,
      dmi_minus,
    };
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
        setStatus(`Loaded ${data.length} records`);
        setForecast(null);
      } catch (error) {
        setStatus("Invalid CSV format");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const generateForecast = () => {
    if (salesData.length === 0) {
      setStatus("Upload CSV first");
      return;
    }

    setLoading(true);
    setStatus("Calculating forecast...");

    setTimeout(() => {
      const result = calculateForecast(salesData, periods);
      
      const dates: string[] = [];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (let i = 0; i < salesData.length; i++) {
        dates.push(`${months[i % 12]} 25`);
      }
      for (let i = 0; i < periods; i++) {
        dates.push(`${months[(salesData.length + i) % 12]} 26`);
      }

      const fullResult: ForecastResult = { ...result, dates };
      setForecast(fullResult);
      setStatus("Forecast Complete");
      
      setTimeout(() => drawChart(fullResult), 100);
      setLoading(false);
    }, 800);
  };

  // Draw candlestick chart using ECharts - Simple & Working
  const drawChart = (result: ForecastResult) => {
    const container = chartContainerRef.current;
    
    if (!container) {
      console.error('❌ Chart container not found');
      return null;
    }

    if (!result.candlesticks || result.candlesticks.length === 0) {
      console.error('❌ No candlesticks to display');
      return null;
    }

    console.log('✅ Starting ECharts render');

    try {
      // Initialize chart
      const chart = echarts.init(container, 'dark');

      // Combine candlesticks
      const allSticks = [...result.candlesticks, ...result.forecastCandlesticks];
      
      // Format candlestick data for ECharts
      const candleData = allSticks.map((stick) => [
        stick.open,
        stick.close,
        stick.low,
        stick.high,
      ]);

      // Create dates for x-axis
      const dates = allSticks.map((_, idx) => {
        const date = new Date(Date.now() - (allSticks.length - idx) * 86400000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

      console.log('📊 Chart data prepared:', {
        candleCount: candleData.length,
        firstCandle: candleData[0],
        lastCandle: candleData[candleData.length - 1],
      });

      // ECharts option
      const option = {
        backgroundColor: '#0a0e27',
        title: {
          text: 'CANDLESTICK CHART',
          textStyle: {
            color: '#60a5fa',
            fontSize: 16,
            fontWeight: 'bold',
            fontFamily: "'JetBrains Mono', monospace",
          },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
          },
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          borderColor: '#3b82f6',
          textStyle: {
            color: '#e0e0e0',
            fontFamily: "'JetBrains Mono', monospace",
          },
        },
        grid: {
          left: '10%',
          right: '10%',
          top: '15%',
          bottom: '10%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: dates,
          axisLine: {
            lineStyle: {
              color: '#475569',
            },
          },
          axisLabel: {
            color: '#9ca3af',
            fontFamily: "'JetBrains Mono', monospace",
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: 'rgba(100, 120, 150, 0.1)',
            },
          },
        },
        yAxis: {
          type: 'value',
          name: 'Price',
          nameTextStyle: {
            color: '#9ca3af',
          },
          axisLine: {
            lineStyle: {
              color: '#475569',
            },
          },
          axisLabel: {
            color: '#9ca3af',
            fontFamily: "'JetBrains Mono', monospace",
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(100, 120, 150, 0.15)',
            },
          },
        },
        series: [
          {
            name: 'Candlestick',
            type: 'candlestick',
            data: candleData,
            itemStyle: {
              color: '#1dd1a1', // Up color (green)
              color0: '#ff4757', // Down color (red)
              borderColor: '#0aba5e',
              borderColor0: '#dc2626',
            },
          },
          // Support level
          {
            name: 'Support',
            type: 'line',
            data: allSticks.map(() => result.support_level),
            lineStyle: {
              color: 'rgba(60, 140, 230, 0.5)',
              width: 2,
              type: 'dashed',
            },
            itemStyle: {
              opacity: 0,
            },
          },
          // Resistance level
          {
            name: 'Resistance',
            type: 'line',
            data: allSticks.map(() => result.resistance_level),
            lineStyle: {
              color: 'rgba(240, 70, 75, 0.5)',
              width: 2,
              type: 'dashed',
            },
            itemStyle: {
              opacity: 0,
            },
          },
        ],
        legend: {
          orient: 'horizontal',
          bottom: '0%',
          textStyle: {
            color: '#e0e0e0',
            fontFamily: "'JetBrains Mono', monospace",
          },
        },
      };

      // Set option
      chart.setOption(option);
      console.log('✅ Chart rendered successfully');

      // Handle resize
      const handleResize = () => {
        chart.resize();
      };

      window.addEventListener('resize', handleResize);

      return chart;
    } catch (error) {
      console.error('❌ Error rendering chart:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!forecast) return;

    const chart = drawChart(forecast);

    // Cleanup
    return () => {
      if (chart) {
        chart.dispose();
      }
    };
  }, [forecast]);

  return (
    <main className="container">
      <div className="header">
        <div className="header-left">
          <h1 className="header-title">MARKET ANALYZER PRO</h1>
          <p className="header-subtitle">Advanced Technical Analysis Terminal</p>
        </div>
        <div className="header-status">
          <div className="status-badge">ACTIVE</div>
        </div>
      </div>

      <div className="control-panel">
        <div className="left-panel">
          <div className="card upload-section">
            <div className="panel-header">
              <span className="panel-icon">⬆</span>
              <h2>DATA IMPORT</h2>
            </div>
            <input 
              id="file-upload" 
              type="file" 
              accept=".csv" 
              onChange={handleFileUpload}
              disabled={loading}
            />
            <label htmlFor="file-upload" className={`upload-btn ${loading ? 'disabled' : ''}`}>
              {loading ? 'PROCESSING' : 'IMPORT CSV'}
            </label>
            <div className="file-info">
              {fileName === "No file selected" ? "sales_data.csv" : `LOADED: ${fileName}`}
              {salesData.length > 0 && ` [${salesData.length}]`}
            </div>
          </div>

          <div className="card tools-section">
            <div className="panel-header">
              <span className="panel-icon">⚙</span>
              <h2>TOOLS</h2>
            </div>
            <div className="tool-buttons">
              <button className="tool-btn active">Candlestick</button>
              <button className="tool-btn">OHLC</button>
              <button className="tool-btn">Volume</button>
              <button className="tool-btn">Heatmap</button>
              <button className="tool-btn">Correlation</button>
              <button className="tool-btn">Snapshot</button>
            </div>
          </div>

          <div className="card indicators-panel">
            <div className="panel-header">
              <span className="panel-icon">📊</span>
              <h2>DISPLAY</h2>
            </div>
            <div className="toggle-group">
              <label className="toggle-item">
                <input type="checkbox" checked={showTechnical} onChange={(e) => setShowTechnical(e.target.checked)} />
                <span>Technical Overlays</span>
              </label>
              <label className="toggle-item">
                <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
                <span>Volume Profile</span>
              </label>
            </div>
            <div className="timeframe-selector">
              <span className="label">TIMEFRAME:</span>
              {(['1H', '4H', 'D', 'W'] as const).map(tf => (
                <button
                  key={tf}
                  className={`tf-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                  onClick={() => setSelectedTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="center-panel">
          <div className="card controls-section">
            <div className="panel-header">
              <span className="panel-icon">⚡</span>
              <h2>FORECAST ENGINE</h2>
            </div>
            <div className="controls">
              <label className="control-input">
                <span>PERIODS:</span>
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
                {loading ? "COMPUTING" : "EXECUTE"}
              </button>
            </div>
            {status && <div className="status-display">{status}</div>}
          </div>

          {forecast && (
            <>
              <div className="card chart-container">
                <div className="panel-header">
                  <span className="panel-icon">📈</span>
                  <h2>PRICE ACTION ANALYSIS</h2>
                </div>
                <div className="canvas-wrapper">
                  <div ref={chartContainerRef} className="chart-canvas" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="right-panel">
          {forecast && (
            <>
              <div className="card metrics-panel">
                <div className="panel-header">
                  <span className="panel-icon">🎯</span>
                  <h2>KEY METRICS</h2>
                </div>
                <div className="metrics-grid">
                  <div className="metric-box large" style={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}>
                    <div className="metric-label">RISK SCORE</div>
                    <div className="metric-value">{forecast.risk_score.toFixed(1)}%</div>
                  </div>
                  <div className="metric-box" style={{ borderColor: 'rgba(168, 85, 247, 0.5)' }}>
                    <div className="metric-label">VOLATILITY</div>
                    <div className="metric-value">{forecast.volatility.toFixed(1)}%</div>
                  </div>
                  <div className="metric-box" style={{ borderColor: 'rgba(16, 185, 129, 0.5)' }}>
                    <div className="metric-label">TREND</div>
                    <div className="metric-value">{forecast.trend}</div>
                  </div>
                  <div className="metric-box" style={{ borderColor: 'rgba(251, 191, 36, 0.5)' }}>
                    <div className="metric-label">GROWTH</div>
                    <div className="metric-value">{forecast.growth_rate.toFixed(2)}%</div>
                  </div>
                </div>
              </div>

              <div className="card advanced-metrics">
                <div className="panel-header">
                  <span className="panel-icon">🔬</span>
                  <h2>ADVANCED</h2>
                </div>
                <div className="advanced-grid">
                  <div className="adv-metric">
                    <span>RSI (14)</span>
                    <div className="adv-value" style={{ color: forecast.rsi > 70 ? '#ef4444' : forecast.rsi < 30 ? '#10b981' : '#94a3b8' }}>
                      {forecast.rsi.toFixed(1)}
                    </div>
                  </div>
                  <div className="adv-metric">
                    <span>MACD</span>
                    <div className="adv-value" style={{ color: forecast.macd > 0 ? '#10b981' : '#ef4444' }}>
                      {forecast.macd.toFixed(3)}
                    </div>
                  </div>
                  <div className="adv-metric">
                    <span>ATR</span>
                    <div className="adv-value">{forecast.atr.toFixed(2)}</div>
                  </div>
                  <div className="adv-metric">
                    <span>WIN RATE</span>
                    <div className="adv-value">{forecast.win_rate.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              <div className="card levels-panel">
                <div className="panel-header">
                  <span className="panel-icon">⬆⬇</span>
                  <h2>PRICE LEVELS</h2>
                </div>
                <div className="levels-grid">
                  <div className="level resistance">
                    <span>RESISTANCE</span>
                    <div className="level-value">{forecast.resistance_level.toFixed(2)}</div>
                  </div>
                  <div className="level support">
                    <span>SUPPORT</span>
                    <div className="level-value">{forecast.support_level.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="card settings-panel">
                <div className="panel-header">
                  <span className="panel-icon">⚔</span>
                  <h2>STRATEGY</h2>
                </div>
                <div className="strategy-buttons">
                  <button className="strat-btn">LONG</button>
                  <button className="strat-btn">SHORT</button>
                  <button className="strat-btn">HEDGE</button>
                </div>
              </div>

              <div className="card advanced-metrics">
                <div className="panel-header">
                  <span className="panel-icon">N</span>
                  <h2>OSCILLATORS</h2>
                </div>
                <div className="advanced-grid">
                  <div className="adv-metric">
                    <span>STOCH</span>
                    <div className="adv-value" style={{ color: forecast.stochastic > 80 ? '#ef4444' : forecast.stochastic < 20 ? '#10b981' : '#94a3b8' }}>
                      {forecast.stochastic.toFixed(1)}
                    </div>
                  </div>
                  <div className="adv-metric">
                    <span>DMI+</span>
                    <div className="adv-value">{forecast.dmi_plus.toFixed(1)}</div>
                  </div>
                  <div className="adv-metric">
                    <span>DMI-</span>
                    <div className="adv-value">{forecast.dmi_minus.toFixed(1)}</div>
                  </div>
                  <div className="adv-metric">
                    <span>PIVOT</span>
                    <div className="adv-value">{forecast.pivot_point.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="card levels-panel">
                <div className="panel-header">
                  <span className="panel-icon">%</span>
                  <h2>FIBONACCI</h2>
                </div>
                <div className="levels-grid">
                  <div className="level support">
                    <span>FIB 23.6</span>
                    <div className="level-value">{forecast.fib_level_1.toFixed(2)}</div>
                  </div>
                  <div className="level resistance">
                    <span>FIB 38.2</span>
                    <div className="level-value">{forecast.fib_level_2.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="card levels-panel">
                <div className="panel-header">
                  <span className="panel-icon">U</span>
                  <h2>KELTNER CH</h2>
                </div>
                <div className="levels-grid">
                  <div className="level resistance">
                    <span>UPPER</span>
                    <div className="level-value">{forecast.keltner_upper.toFixed(2)}</div>
                  </div>
                  <div className="level support">
                    <span>LOWER</span>
                    <div className="level-value">{forecast.keltner_lower.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;

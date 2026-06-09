import React, { useEffect, useState, useRef } from 'react';
import { useEEGStore } from '../store/eeg';
import { SleepAnalysis, SleepStageEpoch } from '../types';

const STAGE_META: Record<string, { label: string; color: string; level: number }> = {
  wake: { label: '清醒', color: '#fdd835', level: 0 },
  n1: { label: 'N1', color: '#66bb6a', level: 1 },
  n2: { label: 'N2', color: '#42a5f5', level: 2 },
  n3: { label: 'N3', color: '#1a237e', level: 3 },
  rem: { label: 'REM', color: '#ab47bc', level: 4 },
};

const STAGE_ORDER = ['wake', 'rem', 'n1', 'n2', 'n3'];

const formatMinSec = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}分${s}秒`;
};

const Hypnogram: React.FC<{ stages: SleepStageEpoch[]; width: number; height: number; hoverEpoch: number | null; onHover: (epoch: number | null) => void }> = ({ stages, width, height, hoverEpoch, onHover }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stages.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padLeft = 50;
    const padRight = 16;
    const padTop = 10;
    const padBottom = 28;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(padLeft, padTop, chartW, chartH);

    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const y = padTop + (i / (STAGE_ORDER.length - 1)) * chartH;
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(STAGE_META[STAGE_ORDER[i]].label, padLeft - 8, y);
    }

    if (stages.length === 0) return;
    const totalDuration = stages[stages.length - 1].endTime;

    const epochWidth = chartW / stages.length;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const stageIdx = STAGE_ORDER.indexOf(s.stage);
      const x = padLeft + i * epochWidth;
      const y = padTop + (stageIdx / (STAGE_ORDER.length - 1)) * chartH;

      if (i < stages.length - 1) {
        const nextS = stages[i + 1];
        const nextIdx = STAGE_ORDER.indexOf(nextS.stage);
        const nextY = padTop + (nextIdx / (STAGE_ORDER.length - 1)) * chartH;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + epochWidth, y);
        ctx.lineTo(x + epochWidth, nextY);
        ctx.stroke();
      }

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + epochWidth, y);
      ctx.stroke();

      if (i === hoverEpoch) {
        ctx.fillStyle = s.color + '30';
        ctx.fillRect(x, padTop, epochWidth, chartH);
      }
    }

    const tickInterval = totalDuration <= 600 ? 60 : totalDuration <= 1800 ? 300 : 600;
    ctx.fillStyle = '#999';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= totalDuration; t += tickInterval) {
      const x = padLeft + (t / totalDuration) * chartW;
      ctx.fillText(`${Math.floor(t / 60)}m`, x, padTop + chartH + 8);
    }
  }, [stages, width, height, hoverEpoch]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (stages.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 50;
    const padRight = 16;
    const chartW = width - padLeft - padRight;
    const epochWidth = chartW / stages.length;
    const idx = Math.floor((x - padLeft) / epochWidth);
    onHover(idx >= 0 && idx < stages.length ? idx : null);
  };

  const handleMouseLeave = () => onHover(null);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
};

const StageBar: React.FC<{ label: string; pct: number; color: string; duration: number }> = ({ label, pct, color, duration }) => (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, display: 'inline-block' }} />
        {label}
      </span>
      <span style={{ fontSize: '12px', color: '#666' }}>
        {pct.toFixed(1)}% · {formatMinSec(duration)}
      </span>
    </div>
    <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
    </div>
  </div>
);

export const SleepAnalysisChart: React.FC = () => {
  const { sleepAnalysis, sleepAnalysisLoading, selectedChannel, eegData, fetchSleepAnalysis, clearSleepAnalysis } = useEEGStore();
  const [hoverEpoch, setHoverEpoch] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(700);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(Math.max(400, entry.contentRect.width - 32));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleAnalyze = () => {
    const channelData = eegData?.data?.[selectedChannel];
    const sampleRate = eegData?.sample_rate;
    if (channelData && sampleRate) {
      fetchSleepAnalysis(selectedChannel, channelData, sampleRate);
    } else {
      fetchSleepAnalysis(selectedChannel);
    }
  };

  const hoveredStage = hoverEpoch !== null && sleepAnalysis ? sleepAnalysis.stages[hoverEpoch] : null;

  return (
    <div ref={containerRef} style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🌙</span>
          睡眠片段分析
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {sleepAnalysis && (
            <button
              onClick={clearSleepAnalysis}
              style={{
                padding: '6px 14px',
                background: '#f5f5f5',
                color: '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              清除
            </button>
          )}
          <button
            onClick={handleAnalyze}
            disabled={sleepAnalysisLoading}
            style={{
              padding: '6px 16px',
              background: sleepAnalysisLoading ? '#ccc' : 'linear-gradient(135deg, #5c6bc0, #3949ab)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: sleepAnalysisLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {sleepAnalysisLoading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                分析中...
              </>
            ) : (
              <>🔍 开始分析</>
            )}
          </button>
        </div>
      </div>

      {!sleepAnalysis && !sleepAnalysisLoading && (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#999',
          border: '1px dashed #e0e0e0',
          borderRadius: '10px',
          background: '#fafbfc',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>😴</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>点击"开始分析"查看睡眠阶段变化概览</div>
          <div style={{ fontSize: '12px', color: '#bbb' }}>
            将对当前通道 ({selectedChannel}) 的脑电数据进行30秒分帧睡眠分期
          </div>
        </div>
      )}

      {sleepAnalysisLoading && !sleepAnalysis && (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#5c6bc0',
          border: '1px dashed #c5cae9',
          borderRadius: '10px',
          background: '#e8eaf6',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>正在进行睡眠分期分析...</div>
        </div>
      )}

      {sleepAnalysis && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>睡眠结构图 (Hypnogram)</span>
            <span style={{ fontSize: '11px', color: '#999' }}>
              总时长 {formatMinSec(sleepAnalysis.summary.totalDuration)} · {sleepAnalysis.summary.totalEpochs} 个分帧
            </span>
          </div>

          <div style={{ position: 'relative', borderRadius: '8px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '12px' }}>
            <Hypnogram
              stages={sleepAnalysis.stages}
              width={chartWidth}
              height={180}
              hoverEpoch={hoverEpoch}
              onHover={setHoverEpoch}
            />
          </div>

          {hoveredStage && (
            <div style={{
              padding: '10px 14px',
              background: hoveredStage.color + '15',
              border: `1px solid ${hoveredStage.color}`,
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: hoveredStage.color, display: 'inline-block' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: hoveredStage.color }}>{hoveredStage.label}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  Epoch #{hoveredStage.epoch} · {hoveredStage.startTime}s - {hoveredStage.endTime}s
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#555' }}>
                <span>δ: {hoveredStage.bandPower.delta.toFixed(2)}</span>
                <span>θ: {hoveredStage.bandPower.theta.toFixed(2)}</span>
                <span>α: {hoveredStage.bandPower.alpha.toFixed(2)}</span>
                <span>β: {hoveredStage.bandPower.beta.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}>
            <div style={{ padding: '14px', background: '#e8eaf6', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#5c6bc0', marginBottom: '4px' }}>睡眠效率</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#3949ab' }}>{sleepAnalysis.summary.sleepEfficiency}%</div>
            </div>
            <div style={{ padding: '14px', background: '#e0f2f1', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#00897b', marginBottom: '4px' }}>阶段转换</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#00695c' }}>{sleepAnalysis.summary.stageTransitions}</div>
            </div>
            <div style={{ padding: '14px', background: '#fff3e0', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#f57c00', marginBottom: '4px' }}>总时长</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#e65100' }}>{formatMinSec(sleepAnalysis.summary.totalDuration)}</div>
            </div>
          </div>

          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666', fontWeight: 500 }}>各阶段占比</div>
          {STAGE_ORDER.map((key) => (
            <StageBar
              key={key}
              label={STAGE_META[key].label}
              pct={sleepAnalysis.summary.stagePercentages[key] || 0}
              color={STAGE_META[key].color}
              duration={sleepAnalysis.summary.stageDurations[key] || 0}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

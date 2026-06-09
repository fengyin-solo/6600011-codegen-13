import React, { useEffect, useState, useRef } from 'react';
import { useEEGStore } from '../store/eeg';
import { SleepAnalysis, SleepStageEpoch, Recording } from '../types';

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
  const {
    sleepAnalysis,
    sleepAnalysisLoading,
    selectedChannel,
    eegData,
    fetchSleepAnalysis,
    analyzeRecordingSleep,
    importEEGRecording,
    clearSleepAnalysis,
    playbackMode,
    activeRecording,
    recordings,
  } = useEEGStore();
  const [hoverEpoch, setHoverEpoch] = useState<number | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const getTargetRecording = (): Recording | null => {
    if (playbackMode && activeRecording) return activeRecording;
    if (selectedRecordingId) {
      return recordings.find((r) => r.id === selectedRecordingId) || null;
    }
    return null;
  };

  const handleAnalyze = async () => {
    const recording = getTargetRecording();
    if (recording && recording.frames.length > 0) {
      analyzeRecordingSleep(recording);
      return;
    }
    const channelData = eegData?.data?.[selectedChannel];
    const sampleRate = eegData?.sample_rate;
    const dataLen = channelData?.length || 0;
    const enoughData = dataLen >= 30 * (sampleRate || 256);
    if (enoughData && channelData && sampleRate) {
      await fetchSleepAnalysis(selectedChannel, channelData, sampleRate);
    } else {
      await fetchSleepAnalysis(selectedChannel);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const recording = await importEEGRecording(file);
      if (!recording) {
        setImportError('导入失败，请确认文件格式为 CSV 或 JSON');
      }
    } catch {
      setImportError('导入出错，请重试');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const targetRecording = getTargetRecording();
  const dataSourceLabel = targetRecording
    ? `录制: ${targetRecording.name}`
    : eegData && (eegData.data?.[selectedChannel]?.length || 0) >= 30 * (eegData.sample_rate || 256)
    ? `实时数据 (${selectedChannel})`
    : '模拟数据 (300秒)';

  const hoveredStage = hoverEpoch !== null && sleepAnalysis ? sleepAnalysis.stages[hoverEpoch] : null;

  return (
    <div ref={containerRef} style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🌙</span>
          睡眠片段分析
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.txt"
            onChange={handleFileImport}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || sleepAnalysisLoading}
            style={{
              padding: '6px 14px',
              background: importing ? '#ccc' : 'linear-gradient(135deg, #43a047, #2e7d32)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: importing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {importing ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                导入中...
              </>
            ) : (
              <>📁 导入脑电记录</>
            )}
          </button>
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

      <div style={{
        marginBottom: '12px',
        padding: '10px 14px',
        background: '#f0f1f5',
        borderRadius: '8px',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: recordings.length > 0 && !playbackMode ? '8px' : 0 }}>
          <span style={{ color: '#666' }}>数据来源:</span>
          <span style={{ fontWeight: 600, color: targetRecording ? '#3949ab' : '#e65100' }}>{dataSourceLabel}</span>
          {playbackMode && <span style={{ fontSize: '11px', color: '#5c6bc0', background: '#e8eaf6', padding: '2px 8px', borderRadius: '4px' }}>回放中</span>}
        </div>
        {recordings.length > 0 && !playbackMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#666' }}>选择录制:</span>
            <select
              value={selectedRecordingId || ''}
              onChange={(e) => setSelectedRecordingId(e.target.value || null)}
              style={{
                flex: 1,
                padding: '4px 8px',
                border: '1px solid #d0d0d0',
                borderRadius: '4px',
                fontSize: '12px',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="">自动 (模拟数据)</option>
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({Math.floor(r.duration / 60)}分{Math.floor(r.duration % 60)}秒, {r.frames.length}帧)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {importError && (
        <div style={{
          marginBottom: '12px',
          padding: '10px 14px',
          background: '#ffebee',
          border: '1px solid #ef9a9a',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#c62828',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{importError}</span>
          <button
            onClick={() => setImportError(null)}
            style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

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
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>点击"导入脑电记录"或"开始分析"查看睡眠阶段变化概览</div>
          <div style={{ fontSize: '12px', color: '#bbb', lineHeight: '1.6' }}>
            {targetRecording
              ? `将分析录制「${targetRecording.name}」的脑电数据 (${Math.floor(targetRecording.duration / 60)}分${Math.floor(targetRecording.duration % 60)}秒)`
              : '支持导入 CSV / JSON 格式的脑电数据文件，自动进行睡眠分期分析'}
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

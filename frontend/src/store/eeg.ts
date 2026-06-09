import { create } from 'zustand';
import { EEGData, BandPower, BrainState, CorrelationData, Recording, RecordingFrame, PlaybackState, SleepAnalysis } from '../types';

const STORAGE_KEY = 'eeg_recordings';

const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRecordings = (recordings: Recording[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
  } catch {}
};

interface EEGState {
  eegData: EEGData | null;
  selectedChannel: string;
  bandPower: BandPower | null;
  isStreaming: boolean;
  brainState: BrainState | null;
  correlationData: CorrelationData | null;
  isRecording: boolean;
  recordingStartTime: number;
  currentRecordingFrames: RecordingFrame[];
  recordings: Recording[];
  playbackMode: boolean;
  activeRecording: Recording | null;
  playbackState: PlaybackState;
  sleepAnalysis: SleepAnalysis | null;
  sleepAnalysisLoading: boolean;
  setEEGData: (d: EEGData | null) => void;
  setChannel: (c: string) => void;
  setBandPower: (b: BandPower | null) => void;
  setStreaming: (v: boolean) => void;
  setBrainState: (s: BrainState | null) => void;
  setCorrelationData: (c: CorrelationData | null) => void;
  startRecording: () => void;
  stopRecording: (name: string) => void;
  addRecordingFrame: (eeg: EEGData, bands: BandPower, brainState: BrainState) => void;
  deleteRecording: (id: string) => void;
  enterPlaybackMode: (recording: Recording) => void;
  exitPlaybackMode: () => void;
  setPlaybackTime: (time: number) => void;
  togglePlayback: () => void;
  setPlaybackPlaying: (playing: boolean) => void;
  fetchSleepAnalysis: (channel: string, channelData?: number[], sampleRate?: number) => Promise<void>;
  analyzeRecordingSleep: (recording: Recording) => void;
  clearSleepAnalysis: () => void;
}

export const useEEGStore = create<EEGState>((set, get) => ({
  eegData: null,
  selectedChannel: 'Fp1',
  bandPower: null,
  isStreaming: false,
  brainState: null,
  correlationData: null,
  isRecording: false,
  recordingStartTime: 0,
  currentRecordingFrames: [],
  recordings: loadRecordings(),
  playbackMode: false,
  activeRecording: null,
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    currentFrame: null,
  },
  sleepAnalysis: null,
  sleepAnalysisLoading: false,
  setEEGData: (d) => set({ eegData: d }),
  setChannel: (c) => set({ selectedChannel: c }),
  setBandPower: (b) => set({ bandPower: b }),
  setStreaming: (v) => set({ isStreaming: v }),
  setBrainState: (s) => set({ brainState: s }),
  setCorrelationData: (c) => set({ correlationData: c }),
  startRecording: () => {
    const { selectedChannel } = get();
    set({
      isRecording: true,
      recordingStartTime: Date.now(),
      currentRecordingFrames: [],
      playbackMode: false,
      activeRecording: null,
    });
  },
  stopRecording: (name: string) => {
    const { currentRecordingFrames, recordingStartTime, selectedChannel } = get();
    if (currentRecordingFrames.length === 0) {
      set({ isRecording: false, currentRecordingFrames: [] });
      return;
    }
    const endTime = Date.now();
    const duration = (endTime - recordingStartTime) / 1000;
    const newRecording: Recording = {
      id: `rec_${endTime}`,
      name: name || `录制 ${new Date(recordingStartTime).toLocaleString()}`,
      channel: selectedChannel,
      startTime: recordingStartTime,
      endTime,
      duration,
      frames: currentRecordingFrames,
    };
    const recordings = [...get().recordings, newRecording];
    saveRecordings(recordings);
    set({
      isRecording: false,
      recordingStartTime: 0,
      currentRecordingFrames: [],
      recordings,
    });
  },
  addRecordingFrame: (eeg, bands, brainState) => {
    const { isRecording, recordingStartTime, currentRecordingFrames } = get();
    if (!isRecording) return;
    const relativeTime = (Date.now() - recordingStartTime) / 1000;
    const frame: RecordingFrame = { relativeTime, eeg, bands, brainState };
    set({ currentRecordingFrames: [...currentRecordingFrames, frame] });
  },
  deleteRecording: (id) => {
    const recordings = get().recordings.filter(r => r.id !== id);
    saveRecordings(recordings);
    const { activeRecording } = get();
    if (activeRecording?.id === id) {
      set({ recordings, playbackMode: false, activeRecording: null });
    } else {
      set({ recordings });
    }
  },
  enterPlaybackMode: (recording) => {
    if (recording.frames.length === 0) return;
    set({
      playbackMode: true,
      activeRecording: recording,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: recording.frames[0],
      },
      eegData: recording.frames[0].eeg,
      bandPower: recording.frames[0].bands,
      brainState: recording.frames[0].brainState,
    });
  },
  exitPlaybackMode: () => {
    set({
      playbackMode: false,
      activeRecording: null,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: null,
      },
    });
  },
  setPlaybackTime: (time) => {
    const { activeRecording } = get();
    if (!activeRecording || activeRecording.frames.length === 0) return;
    const frames = activeRecording.frames;
    let frameIndex = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].relativeTime <= time) {
        frameIndex = i;
      } else {
        break;
      }
    }
    const frame = frames[frameIndex];
    set({
      playbackState: {
        ...get().playbackState,
        currentTime: time,
        currentFrame: frame,
      },
      eegData: frame.eeg,
      bandPower: frame.bands,
      brainState: frame.brainState,
    });
  },
  togglePlayback: () => {
    const { playbackState } = get();
    set({
      playbackState: {
        ...playbackState,
        isPlaying: !playbackState.isPlaying,
      },
    });
  },
  setPlaybackPlaying: (playing) => {
    set({
      playbackState: {
        ...get().playbackState,
        isPlaying: playing,
      },
    });
  },
  fetchSleepAnalysis: async (channel, channelData, sampleRate) => {
    set({ sleepAnalysisLoading: true });
    try {
      const body: Record<string, unknown> = { channel };
      if (channelData && sampleRate) {
        body.channelData = channelData;
        body.sampleRate = sampleRate;
      } else {
        body.duration = 300;
      }
      const res = await fetch('/api/eeg/sleep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.stages) {
        set({ sleepAnalysis: data, sleepAnalysisLoading: false });
      } else {
        set({ sleepAnalysis: null, sleepAnalysisLoading: false });
      }
    } catch {
      set({ sleepAnalysis: null, sleepAnalysisLoading: false });
    }
  },
  analyzeRecordingSleep: (recording) => {
    const frames = recording.frames;
    if (frames.length === 0) {
      set({ sleepAnalysis: null });
      return;
    }
    const EPOCH_SEC = 30;
    const duration = recording.duration;
    const nEpochs = Math.max(1, Math.ceil(duration / EPOCH_SEC));
    const META: Record<string, { label: string; level: number; color: string }> = {
      wake: { label: '清醒', level: 0, color: '#fdd835' },
      n1: { label: 'N1', level: 1, color: '#66bb6a' },
      n2: { label: 'N2', level: 2, color: '#42a5f5' },
      n3: { label: 'N3', level: 3, color: '#1a237e' },
      rem: { label: 'REM', level: 4, color: '#ab47bc' },
    };
    const classify = (bp: BandPower): string => {
      const total = bp.delta + bp.theta + bp.alpha + bp.beta + bp.gamma + 1e-10;
      const deltaR = bp.delta / total;
      const thetaR = bp.theta / total;
      const alphaR = bp.alpha / total;
      const betaR = bp.beta / total;
      const thetaAlpha = thetaR / (alphaR + 1e-10);
      if (betaR > 0.15 || alphaR > 0.25) return 'wake';
      if (deltaR > 0.40) return 'n3';
      if (thetaAlpha > 2.0 && deltaR < 0.30) return 'rem';
      if (deltaR > 0.20 || (deltaR > 0.12 && thetaR > 0.25)) return 'n2';
      return 'n1';
    };
    const stages = [];
    for (let i = 0; i < nEpochs; i++) {
      const epochStart = i * EPOCH_SEC;
      const epochEnd = Math.min((i + 1) * EPOCH_SEC, duration);
      const epochFrames = frames.filter(
        (f) => f.relativeTime >= epochStart && f.relativeTime < epochEnd,
      );
      let avgBands: BandPower;
      if (epochFrames.length > 0) {
        const sum = epochFrames.reduce(
          (acc, f) => ({
            delta: acc.delta + f.bands.delta,
            theta: acc.theta + f.bands.theta,
            alpha: acc.alpha + f.bands.alpha,
            beta: acc.beta + f.bands.beta,
            gamma: acc.gamma + f.bands.gamma,
          }),
          { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
        );
        const n = epochFrames.length;
        avgBands = {
          delta: sum.delta / n,
          theta: sum.theta / n,
          alpha: sum.alpha / n,
          beta: sum.beta / n,
          gamma: sum.gamma / n,
        };
      } else {
        const mid = (epochStart + epochEnd) / 2;
        const nearest = frames.reduce((best, f) =>
          Math.abs(f.relativeTime - mid) < Math.abs(best.relativeTime - mid) ? f : best,
        );
        avgBands = nearest.bands;
      }
      const stageKey = classify(avgBands);
      const meta = META[stageKey];
      stages.push({
        epoch: i,
        startTime: Math.round(epochStart * 10) / 10,
        endTime: Math.round(epochEnd * 10) / 10,
        stage: stageKey,
        label: meta.label,
        level: meta.level,
        color: meta.color,
        bandPower: avgBands,
      });
    }
    const stageCounts: Record<string, number> = {};
    const stageDurations: Record<string, number> = {};
    for (const s of stages) {
      const dur = s.endTime - s.startTime;
      stageCounts[s.stage] = (stageCounts[s.stage] || 0) + 1;
      stageDurations[s.stage] = (stageDurations[s.stage] || 0) + dur;
    }
    const totalDur = Object.values(stageDurations).reduce((a, b) => a + b, 0) + 1e-10;
    const sleepDur = totalDur - (stageDurations['wake'] || 0);
    const efficiency = Math.round(Math.min(100, Math.max(0, (sleepDur / totalDur) * 100)) * 10) / 10;
    let transitions = 0;
    for (let i = 1; i < stages.length; i++) {
      if (stages[i].stage !== stages[i - 1].stage) transitions++;
    }
    const analysis: SleepAnalysis = {
      stages,
      summary: {
        totalDuration: Math.round(duration * 10) / 10,
        totalEpochs: nEpochs,
        stageCounts,
        stageDurations: Object.fromEntries(
          Object.entries(stageDurations).map(([k, v]) => [k, Math.round(v * 10) / 10]),
        ),
        stagePercentages: Object.fromEntries(
          Object.entries(stageDurations).map(([k, v]) => [k, Math.round((v / totalDur) * 1000) / 10]),
        ),
        sleepEfficiency: efficiency,
        stageTransitions: transitions,
      },
    };
    set({ sleepAnalysis: analysis });
  },
  clearSleepAnalysis: () => set({ sleepAnalysis: null }),
}));

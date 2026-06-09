import numpy as np
from scipy import signal
import csv
import io
import json

CHANNELS = ['Fp1','Fp2','F3','F4','C3','C4','P3','P4','O1','O2']
SAMPLE_RATE = 256
BANDS = {'delta': (0.5,4), 'theta': (4,8), 'alpha': (8,13), 'beta': (13,30), 'gamma': (30,100)}
FRAME_SEC = 3

def generate_mock_eeg(duration_sec: float = 5.0) -> dict:
    t = np.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec))
    data = {}
    for ch in CHANNELS:
        sig = 0.5*np.sin(2*np.pi*10*t) + 0.3*np.sin(2*np.pi*20*t) + 0.2*np.random.randn(len(t))
        data[ch] = sig.tolist()
    return {'channels': CHANNELS, 'sample_rate': SAMPLE_RATE, 'data': data, 'time': t.tolist(), 'duration': duration_sec}

def compute_band_power(channel_data, sample_rate: int) -> dict:
    arr = np.asarray(channel_data, dtype=float)
    freqs, psd = signal.welch(arr, fs=sample_rate, nperseg=min(256, len(arr)))
    result = {}
    for name, (low, high) in BANDS.items():
        mask = (freqs >= low) & (freqs <= high)
        result[name] = float(np.trapezoid(psd[mask], freqs[mask])) if mask.any() else 0.0
    return result

def compute_spectrogram(channel_data: list, sample_rate: int) -> dict:
    f, t, Sxx = signal.spectrogram(channel_data, fs=sample_rate, nperseg=128, noverlap=64)
    return {'frequencies': f.tolist(), 'time': t.tolist(), 'power': (10*np.log10(Sxx+1e-10)).tolist()}

def compute_brain_state(channel_data: list, sample_rate: int) -> dict:
    import time
    bands = compute_band_power(channel_data, sample_rate)
    total = sum(bands.values()) + 1e-10
    beta_rel = bands['beta'] / total
    alpha_rel = bands['alpha'] / total
    theta_rel = bands['theta'] / total
    focus = min(100.0, max(0.0, (beta_rel * 300) + np.random.uniform(-5, 5)))
    relaxation = min(100.0, max(0.0, (alpha_rel * 300) + np.random.uniform(-5, 5)))
    fatigue = min(100.0, max(0.0, (theta_rel * 300) + np.random.uniform(-5, 5)))
    scores = {'focused': focus, 'relaxed': relaxation, 'fatigued': fatigue}
    max_score = max(scores.values())
    if max_score < 50:
        status = 'neutral'
        status_label = '平稳'
        status_color = '#757575'
    else:
        status = max(scores, key=scores.get)
        if status == 'focused':
            status_label = '专注'
            status_color = '#1976d2'
        elif status == 'relaxed':
            status_label = '放松'
            status_color = '#388e3c'
        else:
            status_label = '疲劳'
            status_color = '#d32f2f'
    return {
        'focus': round(focus, 1),
        'relaxation': round(relaxation, 1),
        'fatigue': round(fatigue, 1),
        'status': status,
        'statusLabel': status_label,
        'statusColor': status_color,
        'timestamp': int(time.time() * 1000)
    }

SLEEP_STAGES = {
    'wake': {'label': '清醒', 'level': 0, 'color': '#fdd835'},
    'n1': {'label': 'N1', 'level': 1, 'color': '#66bb6a'},
    'n2': {'label': 'N2', 'level': 2, 'color': '#42a5f5'},
    'n3': {'label': 'N3', 'level': 3, 'color': '#1a237e'},
    'rem': {'label': 'REM', 'level': 4, 'color': '#ab47bc'},
}

SLEEP_EPOCH_SEC = 30


def classify_sleep_epoch(band_power: dict) -> str:
    total = sum(band_power.values()) + 1e-10
    delta_rel = band_power['delta'] / total
    theta_rel = band_power['theta'] / total
    alpha_rel = band_power['alpha'] / total
    beta_rel = band_power['beta'] / total
    theta_alpha = theta_rel / (alpha_rel + 1e-10)
    if beta_rel > 0.15 or alpha_rel > 0.25:
        return 'wake'
    if delta_rel > 0.40:
        return 'n3'
    if theta_alpha > 2.0 and delta_rel < 0.30:
        return 'rem'
    if delta_rel > 0.20 or (delta_rel > 0.12 and theta_rel > 0.25):
        return 'n2'
    return 'n1'


def compute_sleep_analysis(channel_data: list, sample_rate: int) -> dict:
    epoch_samples = SLEEP_EPOCH_SEC * sample_rate
    total_samples = len(channel_data)
    n_epochs = total_samples // epoch_samples
    if n_epochs == 0:
        n_epochs = 1
        epoch_samples = total_samples
    stages = []
    for i in range(n_epochs):
        start = i * epoch_samples
        end = min(start + epoch_samples, total_samples)
        epoch_data = channel_data[start:end]
        bp = compute_band_power(epoch_data, sample_rate)
        stage_key = classify_sleep_epoch(bp)
        stages.append({
            'epoch': i,
            'startTime': round(i * SLEEP_EPOCH_SEC, 1),
            'endTime': round(min((i + 1) * SLEEP_EPOCH_SEC, total_samples / sample_rate), 1),
            'stage': stage_key,
            'label': SLEEP_STAGES[stage_key]['label'],
            'level': SLEEP_STAGES[stage_key]['level'],
            'color': SLEEP_STAGES[stage_key]['color'],
            'bandPower': bp,
        })
    stage_counts = {}
    stage_durations = {}
    for s in stages:
        key = s['stage']
        dur = s['endTime'] - s['startTime']
        stage_counts[key] = stage_counts.get(key, 0) + 1
        stage_durations[key] = stage_durations.get(key, 0.0) + dur
    total_dur = sum(stage_durations.values()) + 1e-10
    efficiency = 0.0
    if total_dur > 0:
        sleep_dur = total_dur - stage_durations.get('wake', 0.0)
        efficiency = round(min(100.0, max(0.0, sleep_dur / total_dur * 100)), 1)
    transitions = 0
    for i in range(1, len(stages)):
        if stages[i]['stage'] != stages[i - 1]['stage']:
            transitions += 1
    summary = {
        'totalDuration': round(total_samples / sample_rate, 1),
        'totalEpochs': n_epochs,
        'stageCounts': stage_counts,
        'stageDurations': {k: round(v, 1) for k, v in stage_durations.items()},
        'stagePercentages': {k: round(v / total_dur * 100, 1) for k, v in stage_durations.items()},
        'sleepEfficiency': efficiency,
        'stageTransitions': transitions,
    }
    return {'stages': stages, 'summary': summary}


CYCLE_PATTERN = [
    ('wake', 0.10), ('n1', 0.10), ('n2', 0.20),
    ('n3', 0.20), ('n2', 0.10), ('rem', 0.20), ('n1', 0.10),
]

STAGE_SIGNALS = {
    'wake': [(0.3, 12), (0.25, 22), (0.1, 8)],
    'n1': [(0.45, 6), (0.2, 2.5), (0.08, 10)],
    'n2': [(0.35, 5), (0.4, 2), (0.08, 8)],
    'n3': [(0.7, 1.5), (0.5, 3), (0.1, 0.8)],
    'rem': [(0.5, 7), (0.3, 6.5), (0.1, 3)],
}


def generate_mock_sleep_eeg(duration_sec: float = 300.0) -> dict:
    t = np.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec))
    cycle_duration = 210
    timeline = []
    total = 0.0
    while total < duration_sec:
        for stage, frac in CYCLE_PATTERN:
            dur = cycle_duration * frac
            if total + dur > duration_sec:
                dur = duration_sec - total
            if dur > 0:
                timeline.append((stage, total, total + dur))
            total += dur
            if total >= duration_sec:
                break
    data = {}
    for ch in CHANNELS:
        sig = np.zeros(len(t))
        for stage, start, end in timeline:
            mask = (t >= start) & (t < end)
            for amp, freq in STAGE_SIGNALS[stage]:
                sig[mask] += amp * np.sin(2 * np.pi * freq * t[mask])
        sig += 0.15 * np.random.randn(len(t))
        data[ch] = sig.tolist()
    return {'channels': CHANNELS, 'sample_rate': SAMPLE_RATE, 'data': data, 'time': t.tolist(), 'duration': duration_sec}


def parse_csv_eeg(content: str) -> dict:
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        return None
    header = [h.strip() for h in rows[0]]
    data = {}
    time_col = None
    for i, h in enumerate(header):
        low = h.lower()
        if low in ('time', 't', 'timestamp', 'time(s)', 'time_sec'):
            time_col = i
            continue
        if low in ('sample_rate', 'fs', 'sr'):
            continue
        data[h] = []
    if not data:
        first_row_vals = rows[1] if len(rows) > 1 else rows[0]
        for i in range(len(first_row_vals)):
            key = f"ch{i}"
            data[key] = []
        for row in rows:
            for i, val in enumerate(row):
                if i in data:
                    try:
                        data[f"ch{i}"].append(float(val))
                    except (ValueError, IndexError):
                        pass
                elif f"ch{i}" in data:
                    try:
                        data[f"ch{i}"].append(float(val))
                    except (ValueError, IndexError):
                        pass
    else:
        for row in rows[1:]:
            for i, h in enumerate(header):
                if i == time_col:
                    continue
                if h in data:
                    try:
                        data[h].append(float(row[i]))
                    except (ValueError, IndexError):
                        pass
    channels = list(data.keys())
    for ch in channels:
        data[ch] = [v for v in data[ch] if v is not None]
    min_len = min(len(v) for v in data.values()) if data else 0
    for ch in channels:
        data[ch] = data[ch][:min_len]
    if min_len == 0:
        return None
    return {'channels': channels, 'sample_rate': SAMPLE_RATE, 'data': data, 'duration': min_len / SAMPLE_RATE}


def parse_json_eeg(content: str) -> dict:
    obj = json.loads(content)
    channels = obj.get('channels', [])
    sample_rate = obj.get('sample_rate', obj.get('sampleRate', SAMPLE_RATE))
    raw_data = obj.get('data', {})
    if isinstance(raw_data, list):
        arr = np.asarray(raw_data, dtype=float)
        if arr.ndim == 1:
            raw_data = {'ch0': arr.tolist()}
        elif arr.ndim == 2:
            if not channels:
                channels = [f'ch{i}' for i in range(arr.shape[1] if arr.shape[1] > 1 else 1)]
            if arr.shape[0] < arr.shape[1] and len(channels) == arr.shape[0]:
                raw_data = {channels[i]: arr[i].tolist() for i in range(len(channels))}
            else:
                n_ch = arr.shape[1] if arr.ndim == 2 else 1
                if not channels:
                    channels = [f'ch{i}' for i in range(n_ch)]
                raw_data = {channels[i]: arr[:, i].tolist() for i in range(n_ch)}
    if not raw_data:
        return None
    if not channels:
        channels = list(raw_data.keys())
    min_len = min(len(v) for v in raw_data.values())
    data = {ch: raw_data[ch][:min_len] for ch in channels}
    return {'channels': channels, 'sample_rate': sample_rate, 'data': data, 'duration': min_len / sample_rate}


def import_eeg_to_recording(content: str, filename: str, channel: str = None) -> dict:
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'json'
    if ext == 'csv':
        parsed = parse_csv_eeg(content)
    else:
        try:
            parsed = parse_json_eeg(content)
        except (json.JSONDecodeError, ValueError):
            parsed = parse_csv_eeg(content)
    if not parsed or not parsed['data']:
        return {'error': '无法解析文件，请确认格式为 CSV 或 JSON'}
    channels = parsed['channels']
    sr = parsed['sample_rate']
    target_ch = channel if channel and channel in parsed['data'] else channels[0]
    ch_data = parsed['data'][target_ch]
    total_samples = len(ch_data)
    duration = total_samples / sr
    frame_samples = FRAME_SEC * sr
    n_frames = max(1, total_samples // frame_samples)
    import time as _time
    now_ms = int(_time.time() * 1000)
    frames = []
    for i in range(n_frames):
        start = i * frame_samples
        end = min(start + frame_samples, total_samples)
        frame_data = ch_data[start:end]
        frame_eeg_data = {target_ch: frame_data}
        bp = compute_band_power(frame_data, sr)
        bs = compute_brain_state(frame_data, sr)
        frames.append({
            'relativeTime': round(i * FRAME_SEC, 2),
            'eeg': {
                'channels': [target_ch],
                'sample_rate': sr,
                'data': frame_eeg_data,
                'time': [round(t / sr, 4) for t in range(len(frame_data))],
                'duration': FRAME_SEC,
            },
            'bands': bp,
            'brainState': bs,
        })
    sleep_result = compute_sleep_analysis(ch_data, sr)
    recording = {
        'id': f'imp_{now_ms}',
        'name': filename,
        'channel': target_ch,
        'startTime': now_ms - int(duration * 1000),
        'endTime': now_ms,
        'duration': round(duration, 1),
        'frames': frames,
    }
    return {'recording': recording, 'sleepAnalysis': sleep_result, 'channels': channels}


def compute_correlation(target_channel: str, all_data: dict, sample_rate: int) -> dict:
    target_data = np.array(all_data[target_channel])
    correlations = []
    for ch in CHANNELS:
        if ch == target_channel:
            correlations.append({
                'channel': ch,
                'targetChannel': target_channel,
                'correlation': 1.0,
                'coherence': 1.0
            })
            continue
        ch_data = np.array(all_data[ch])
        corr = float(np.corrcoef(target_data, ch_data)[0, 1])
        f, coh = signal.coherence(target_data, ch_data, fs=sample_rate, nperseg=128)
        alpha_mask = (f >= 8) & (f <= 13)
        mean_coh = float(np.mean(coh[alpha_mask])) if alpha_mask.any() else 0.0
        correlations.append({
            'channel': ch,
            'targetChannel': target_channel,
            'correlation': round(corr, 4),
            'coherence': round(mean_coh, 4)
        })
    return {'targetChannel': target_channel, 'correlations': correlations}

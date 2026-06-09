from fastapi import APIRouter
from ..services.eeg_processor import generate_mock_eeg, compute_band_power, compute_spectrogram, compute_brain_state, compute_correlation, compute_sleep_analysis, SAMPLE_RATE

router = APIRouter(prefix="/eeg", tags=["eeg"])

@router.get("/stream")
async def stream_eeg(duration: float = 5.0):
    return generate_mock_eeg(duration)

@router.get("/bands/{channel}")
async def band_power(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'bands': compute_band_power(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/brain-state/{channel}")
async def brain_state(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'state': compute_brain_state(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/spectrogram/{channel}")
async def spectrogram(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'spectrogram': compute_spectrogram(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/correlation/{channel}")
async def correlation(channel: str, duration: float = 3.0):
    data = generate_mock_eeg(duration)
    if channel not in data['data']:
        return {'error': 'Channel not found'}
    return compute_correlation(channel, data['data'], SAMPLE_RATE)

@router.get("/channels")
async def list_channels():
    from ..services.eeg_processor import CHANNELS
    return {'channels': CHANNELS}

@router.get("/sample/{channel}")
async def full_sample(channel: str, duration: float = 3.0):
    data = generate_mock_eeg(duration)
    if channel not in data['data']:
        return {'error': 'Channel not found'}
    channel_data = data['data'][channel]
    return {
        'channel': channel,
        'eeg': data,
        'bands': compute_band_power(channel_data, SAMPLE_RATE),
        'brainState': compute_brain_state(channel_data, SAMPLE_RATE),
        'correlation': compute_correlation(channel, data['data'], SAMPLE_RATE)
    }

@router.post("/sleep-analysis")
async def sleep_analysis(payload: dict):
    channel = payload.get('channel', 'Fp1')
    channel_data = payload.get('channelData')
    sample_rate = payload.get('sampleRate', SAMPLE_RATE)
    if channel_data and isinstance(channel_data, list) and len(channel_data) > 0:
        return compute_sleep_analysis(channel_data, sample_rate)
    duration = payload.get('duration', 300.0)
    data = generate_mock_eeg(duration)
    if channel not in data['data']:
        return {'error': 'Channel not found'}
    return compute_sleep_analysis(data['data'][channel], SAMPLE_RATE)

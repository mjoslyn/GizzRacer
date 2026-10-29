"""Where the music starts and ends in a live recording: past the crowd, the
tuning and the band talking at the top, and before the applause and banter at
the end. Run on a downloaded recording; it prints per-second strips of its
first and last minute and the start and end it reads, for bootlegs.json.

  python3 tools/live-edges.py <recording.mp3> [<recording.mp3> ...]

Needs librosa (pip install librosa). Reads three things a second:
  L  the low end (under 150 Hz) as a share of the recording's loud level: the
     kick and the bass under a band; a crowd and a voice have little of it
  K  how well the harmony fits the song's key, its chroma against the
     recording's own middle: notes of the song, not talk or cheering
  B  how steady the beat is, onset autocorrelation over 6 s
and a second is music when the band is in it (L and B up) or the song is
quietly being played (K up with some beat or low end). The music starts at
the first run of six seconds that is mostly music, and ends after the last
(a quiet coda in the song's key counts; the crowd, the tuning and the next
song's noodling don't); half a second either side is kept so the first and
last notes aren't cut.
Check the strips: a song that segues into the next one ends in music (keep
the end), and a quiet intro of the song itself is music (keep it).
"""
import sys

import librosa
import numpy as np
import scipy.signal as sig

SR = 11025
HOLD = 6
SHARE = 0.8
PAD = 0.5


def read(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    dur = len(y) / SR
    sec = int(dur)
    low = sig.sosfiltfilt(sig.butter(4, 150, btype='low', fs=SR, output='sos'), y)
    lrms = np.array([np.sqrt(np.mean(low[i * SR:(i + 1) * SR] ** 2)) for i in range(sec)])
    lrms = lrms / (np.percentile(lrms, 90) + 1e-9)
    chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=SR, hop_length=512)
    ct = librosa.times_like(chroma, sr=SR, hop_length=512)
    mid = (ct > dur * 0.3) & (ct < dur * 0.7)
    prof = chroma[:, mid].mean(axis=1)
    prof = (prof - prof.mean()) / (prof.std() + 1e-9)
    kfit = np.zeros(sec)
    for i in range(sec):
        c = chroma[:, (ct >= i) & (ct < i + 1)].mean(axis=1)
        kfit[i] = np.dot((c - c.mean()) / (c.std() + 1e-9), prof) / 12
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=256)
    et = librosa.times_like(env, sr=SR, hop_length=256)
    fps = SR / 256
    beat = np.zeros(sec)
    for i in range(sec):
        e = env[(et >= i - 3) & (et < i + 3)]
        e = e - e.mean()
        if len(e) < 20 or e.std() == 0:
            continue
        ac = np.correlate(e, e, 'full')[len(e) - 1:]
        beat[i] = (ac / ac[0])[int(0.25 * fps):int(1.2 * fps)].max()
    music = ((lrms > 0.3) & (beat > 0.3)) | ((kfit > 0.7) & ((beat > 0.25) | (lrms > 0.1)))
    return dur, lrms, kfit, beat, music


def edges(dur, music):
    sec = len(music)
    held = lambda m, a, b: m[max(0, a):min(sec, b)].mean() >= SHARE
    start = next((i for i in range(sec - HOLD) if music[i] and held(music, i, i + HOLD)), 0)
    end = next((i + 1 for i in range(sec - 1, HOLD, -1) if music[i] and held(music, i - HOLD + 1, i + 1)), sec)
    start = 0 if start < 2 else max(0, start - PAD)
    end = round(dur, 1) if end >= sec - 1 else min(dur, end + PAD)
    return start, end


def digits(v):
    return ''.join(str(max(0, min(9, int(x * 10)))) for x in v)


for path in sys.argv[1:]:
    dur, L, K, B, M = read(path)
    start, end = edges(dur, M)
    print(f'{path.split("/")[-1]}  {dur:.1f} s  music {start:g} s to {end:g} s')
    sec = len(M)
    for name, a, b in (('top', 0, min(60, sec)), ('end', max(0, sec - 60), sec)):
        print(f'  {name} from {a} s')
        print('    L ' + digits(L[a:b]))
        print('    K ' + digits(np.maximum(0, K[a:b])))
        print('    B ' + digits(B[a:b]))
        print('    M ' + ''.join('M' if m else '.' for m in M[a:b]))

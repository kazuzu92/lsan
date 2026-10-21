#!/usr/bin/env python3
"""Génère l'audio de tout le contenu (content/en.json et content/dj.json).

Anglais : voix Kokoro (11 voix américaines et britanniques).
Darija : voix arabe Piper, qui lit la graphie arabe (champ "ar") — à vérifier à l'oreille.

Chaque phrase devient audio/<langue>/<empreinte>.mp3, et audio/<langue>/index.json
associe « voix|texte » au fichier. Les fichiers déjà générés sont réutilisés.

Prérequis : pip install sherpa-onnx soundfile ; ffmpeg ; les modèles dans ../models
(voir MODELS ci-dessous). Utilisation : python3 tools/generate_audio.py [en|dj]
"""
import glob, hashlib, json, os, subprocess, sys, tempfile
import sherpa_onnx, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.environ.get('LSAN_MODELS', '/home/claude/models')
DJ_VOICE = os.environ.get('LSAN_DJ_VOICE', 'vits-piper-ar_JO-SA_miro_V2-high')

# Kokoro v0.19 : 0 af, 1 af_bella, 2 af_nicole, 3 af_sarah, 4 af_sky, 5 am_adam,
# 6 am_michael, 7 bf_emma, 8 bf_isabella, 9 bm_george, 10 bm_lewis
EN_MAIN = [6, 1]                 # voix principales (alternées), accent américain
EN_VARIED = [1, 3, 5, 6, 7, 9]   # 6 voix pour l'exercice Oreille (4 américaines, 2 britanniques)
EN_DIALOGUE = {'A': 3, 'B': 5}
EN_TOEIC_Q, EN_TOEIC_R = 5, 3


def kokoro():
    m = os.path.join(MODELS, 'kokoro-en-v0_19') + '/'
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=m + 'model.onnx', voices=m + 'voices.bin',
                                                      tokens=m + 'tokens.txt', data_dir=m + 'espeak-ng-data'),
        num_threads=4)))


def piper(name):
    m = os.path.join(MODELS, name) + '/'
    onnx = glob.glob(m + '*.onnx')[0]
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=onnx, tokens=m + 'tokens.txt', data_dir=m + 'espeak-ng-data'),
        num_threads=4)))


class Store:
    def __init__(self, lang):
        self.dir = os.path.join(ROOT, 'audio', lang)
        os.makedirs(self.dir, exist_ok=True)
        self.path = os.path.join(self.dir, 'index.json')
        self.old = json.load(open(self.path)) if os.path.exists(self.path) else {}
        self.index, self.todo = {}, {}

    def want(self, sid, text, speed=1.0):
        key = f'{sid}|{text}'
        if key in self.index:
            return
        name = hashlib.sha1(f'{key}|{speed}'.encode()).hexdigest()[:12] + '.mp3'
        self.index[key] = name
        if not os.path.exists(os.path.join(self.dir, name)):
            self.todo[key] = (sid, text, speed, name)

    def run(self, tts):
        for i, (key, (sid, text, speed, name)) in enumerate(self.todo.items()):
            a = tts.generate(text, sid=sid, speed=speed)
            with tempfile.NamedTemporaryFile(suffix='.wav') as w:
                sf.write(w.name, a.samples, a.sample_rate)
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w.name, '-af',
                                'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.15',
                                '-ac', '1', '-b:a', '56k', os.path.join(self.dir, name)], check=True)
            if i % 50 == 0:
                print(f'  {i}/{len(self.todo)}', flush=True)
        for f in os.listdir(self.dir):
            if f.endswith('.mp3') and f not in self.index.values():
                os.remove(os.path.join(self.dir, f))
        json.dump(self.index, open(self.path, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
        print(f'{len(self.index)} sons, {len(self.todo)} nouveaux')


def english():
    c = json.load(open(os.path.join(ROOT, 'content', 'en.json')))
    s = Store('en')
    for q in c['placement']:
        if 'listen' in q:
            s.want(4, q['listen'])
    for w in c['weeks']:
        for i, it in enumerate(w['items']):
            v = EN_MAIN[i % 2]
            s.want(v, it['t'], 0.9)
            if it.get('ex'):
                s.want(EN_MAIN[(i + 1) % 2], it['ex'])
        for f in w.get('faux', []):
            s.want(EN_MAIN[0], f['t'], 0.9)
        o = w['oreille']
        for pair in o.get('pairs', []):
            for word in pair:
                for v in EN_VARIED:
                    s.want(v, word, 0.9)
        for st in o.get('stress', []):
            for v in EN_VARIED:
                s.want(v, st['w'], 0.9)
        for l in w['dialogue']['lines']:
            s.want(EN_DIALOGUE[l['s']], l['t'])
        for it in w.get('toeic', {}).get('items', []):
            s.want(EN_TOEIC_Q, it['q'])
            for r in it['r']:
                s.want(EN_TOEIC_R, r)
        for m in w['production']['model']:
            s.want(EN_MAIN[0], m)
        for d in w.get('drills', []):
            pass
    s.run(kokoro())


def darija():
    c = json.load(open(os.path.join(ROOT, 'content', 'dj.json')))
    s = Store('dj')
    for w in c['weeks']:
        for it in w['items']:
            s.want(0, it['ar'], 0.9)
            if it.get('exAr'):
                s.want(0, it['exAr'], 0.9)
        for l in w['oreille'].get('letters', []):
            s.want(0, l['ar'], 0.85)
        for l in w['dialogue']['lines']:
            s.want(0, l['ar'], 0.9)
    s.run(piper(DJ_VOICE))


if __name__ == '__main__':
    which = sys.argv[1:] or ['en', 'dj']
    if 'en' in which:
        english()
    if 'dj' in which:
        darija()

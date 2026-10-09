"""Word timings for the spoken lines (free, runs in the GitHub Action).

Reads JSON from stdin: [{"wav": "out/x/a0.wav", "text": "the line"}, ...]
Writes JSON to stdout: one list per line of [start, end, word] (seconds), or null if that line failed.
Uses faster-whisper (open source speech recognition) with word timestamps; the script text is given as a hint.
"""
import json
import os
import subprocess
import sys


def load_audio(path: str):
    """16 kHz mono float samples, decoded by ffmpeg (faster-whisper's own decoder breaks with newer PyAV versions)."""
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> None:
    items = json.load(sys.stdin)
    from faster_whisper import WhisperModel  # installed by the workflow

    model = WhisperModel(os.environ.get("ALIGN_MODEL", "base.en"), device="cpu", compute_type="int8")
    out = []
    for it in items:
        try:
            segments, _ = model.transcribe(
                load_audio(it["wav"]), language="en", word_timestamps=True, beam_size=1,
                initial_prompt=it["text"][:200], condition_on_previous_text=False, vad_filter=False,
            )
            words = []
            for seg in segments:
                for w in seg.words or []:
                    words.append([round(w.start, 3), round(w.end, 3), w.word.strip()])
            out.append(words)
        except Exception as e:  # one bad line never stops the others
            out.append({"error": f"{type(e).__name__}: {e}"[:300]})
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()

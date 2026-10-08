"""Word timings for the spoken lines (free, runs in the GitHub Action).

Reads JSON from stdin: [{"wav": "out/x/a0.wav", "text": "the line"}, ...]
Writes JSON to stdout: one list per line of [start, end, word] (seconds), or null if that line failed.
Uses faster-whisper (open source speech recognition) with word timestamps; the script text is given as a hint.
"""
import json
import os
import sys


def main() -> None:
    items = json.load(sys.stdin)
    from faster_whisper import WhisperModel  # installed by the workflow

    model = WhisperModel(os.environ.get("ALIGN_MODEL", "base.en"), device="cpu", compute_type="int8")
    out = []
    for it in items:
        try:
            segments, _ = model.transcribe(
                it["wav"], language="en", word_timestamps=True, beam_size=1,
                initial_prompt=it["text"][:200], condition_on_previous_text=False, vad_filter=False,
            )
            words = []
            for seg in segments:
                for w in seg.words or []:
                    words.append([round(w.start, 3), round(w.end, 3), w.word.strip()])
            out.append(words)
        except Exception as e:  # one bad line never stops the others
            print(f"align failed for {it.get('wav')}: {e}", file=sys.stderr)
            out.append(None)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()

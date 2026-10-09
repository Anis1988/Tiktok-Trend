"""Where the main face is in each picture (free, runs in the GitHub Action), so the camera can move toward it.

Reads JSON from stdin: ["out/x/real3.jpg", ...]
Writes JSON to stdout: one item per picture: {"w": width, "h": height, "fx": 0..1, "fy": 0..1} (face centre, as a share
of the width / height), {"w": .., "h": ..} if no face was found, or null if the picture couldn't be read.
Uses OpenCV's built-in face detector (no download needed).
"""
import json
import sys


def main() -> None:
    paths = json.load(sys.stdin)
    import cv2  # installed by the workflow

    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    out = []
    for p in paths:
        try:
            img = cv2.imread(p)
            if img is None:
                out.append(None)
                continue
            h, w = img.shape[:2]
            gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
            side = max(24, int(min(w, h) * 0.06))
            faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(side, side))
            if len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])  # the biggest face
                out.append({"w": w, "h": h, "fx": round((x + fw / 2) / w, 4), "fy": round((y + fh / 2) / h, 4)})
            else:
                out.append({"w": w, "h": h})
        except Exception:  # one bad picture never stops the others
            out.append(None)
    print(json.dumps(out))


if __name__ == "__main__":
    main()

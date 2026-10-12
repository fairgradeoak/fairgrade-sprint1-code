"""Run in a separate Python environment described in docs/MODELS.md.
This conversion recipe has not been executed in the authoring environment.
"""
from ultralytics import YOLO

if __name__ == "__main__":
    model = YOLO("yolov8n.pt")
    model.export(format="tfjs", imgsz=640, batch=1, half=False, int8=False)

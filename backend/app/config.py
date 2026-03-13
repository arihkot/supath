from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "SUPATH"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./supath.db"

    # File storage
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

    # ML Model
    YOLO_MODEL_PATH: str = "app/ml/models/best.pt"
    DETECTION_CONFIDENCE: float = 0.30
    DETECTION_IOU: float = 0.45

    # Chhattisgarh geographic bounds
    CG_CENTER_LAT: float = 21.27
    CG_CENTER_LNG: float = 81.87
    CG_BOUNDS_NORTH: float = 24.12
    CG_BOUNDS_SOUTH: float = 17.78
    CG_BOUNDS_EAST: float = 84.40
    CG_BOUNDS_WEST: float = 80.24

    # Complaint auto-escalation thresholds (days)
    ESCALATION_REMINDER: int = 3
    ESCALATION_DISTRICT: int = 7
    ESCALATION_STATE: int = 15
    ESCALATION_CRITICAL: int = 30
    ESCALATION_FINAL: int = 45

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    BASE_DIR: Path = Path(__file__).resolve().parent.parent

    class Config:
        env_file = ".env"


settings = Settings()

# SUPATH - Surveillance and Unified Pothole Alert and Tracking Hub

**Autonomous Pothole Intelligence for Chhattisgarh**

SUPATH is an AI-powered road infrastructure monitoring system built for the state of Chhattisgarh, India. It detects potholes from images and video feeds using YOLOv8 and OpenCV, automatically files government complaints, tracks contractor accountability through reputation scoring, and implements a loop-closure system to verify that repairs are actually completed.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Configuration](#configuration)
  - [Backend Environment Variables](#backend-environment-variables)
  - [Frontend Environment Variables](#frontend-environment-variables)
- [Architecture](#architecture)
  - [System Architecture](#system-architecture)
  - [Detection Pipeline](#detection-pipeline)
  - [Escalation Ladder](#escalation-ladder)
  - [Loop Closure System](#loop-closure-system)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [Authentication](#authentication)
- [Internationalization](#internationalization)
- [Scripts and Utilities](#scripts-and-utilities)
- [Data Sources](#data-sources)

---

## Overview

SUPATH (associated with CHIPS - Chhattisgarh Infotech Promotion Society) addresses the persistent problem of pothole management on Indian highways. The system combines computer vision, automated bureaucratic workflows, and citizen engagement to create an end-to-end pipeline: from detection to complaint filing to repair verification.

The platform covers National Highways (NH) and State Highways (SH) across Chhattisgarh, using real GeoJSON highway geometries sourced from OpenStreetMap via the Overpass API. On startup, the database is automatically seeded with 250 realistic pothole records distributed along actual highway geometries to demonstrate the full system.

---

## Key Features

### 1. AI-Powered Detection Pipeline
- **Multi-scale YOLOv8 inference** at 640px and 1280px resolutions for comprehensive detection
- **5-point OpenCV verification gate** (contrast, texture, edges, shape, road membership) to filter false positives
- **OpenCV fallback detector** when YOLO confidence is low
- **Non-Maximum Suppression (NMS)** to deduplicate overlapping detections
- **Temporal consensus** for video streams to confirm persistent potholes across frames
- **EXIF GPS extraction** from uploaded images for automatic geolocation

### 2. Resolution-Independent Severity Scoring
Potholes are scored on a 0-100 scale using three weighted components:
- Confidence score (0-40 points)
- Area ratio relative to image size (0-40 points)
- Detection class weight (0-20 points)

Severity levels: `critical` (70-100), `high` (50-69), `medium` (30-49), `low` (0-29)

### 3. Automated Complaint Filing
- Generates structured complaint references in `CG/PG/YYYY/XXXXX` format
- Complaints are tied to specific potholes, highways, and contractors
- Full lifecycle tracking from filing through resolution

### 4. 6-Level Escalation Ladder
Unresolved complaints automatically escalate through the government hierarchy:

| Level | Authority | Trigger (days unresolved) |
|-------|-----------|--------------------------|
| 1 | Department | Initial filing |
| 2 | Reminder | 3 days |
| 3 | District Collector | 7 days |
| 4 | State PWD | 15 days |
| 5 | Media Alert / RTI | 30 days |
| 6 | Chief Secretary | 45 days |

### 5. Loop Closure and Repair Verification
- Re-inspects potholes marked as "resolved" to verify repairs
- If a pothole is re-detected at a resolved location, the complaint is reopened
- Contractors are automatically flagged and their reputation scores reduced
- Escalation level is increased on verification failure

### 6. Contractor Accountability
- Reputation scores (0-100) based on repair quality and timeliness
- Road quality scores tracked per contractor
- Automatic flagging when escalations occur on their assigned roads
- Assignment tracking across highways and individual potholes

### 7. Citizen Reporting with Gamification
- Citizens can submit pothole reports with photos and GPS coordinates
- Privacy-hashed phone numbers for reporter anonymity
- Incentive points system:
  - Photo + location submission: 10 points
  - First report in an area: 50 points
  - Verified report: 25 points
  - Critical severity: 15 points
- Tiered reward levels for active reporters

### 8. Interactive Highway Map
- Leaflet-based map with real Chhattisgarh highway GeoJSON overlays
- State boundary visualization
- Heatmap layer showing pothole density
- Clickable pothole markers with severity indicators
- Admin actions directly from map (assign contractors, update status)

### 9. Multi-Source Data Fusion
Aggregates road condition intelligence from multiple channels:
- Computer vision (image/video detection)
- Citizen reports
- Dashcam footage
- News and social media mentions (newspaper, Twitter monitoring)
- Traffic anomaly detection (speed data suggesting road damage)
- Waterlogging zone mapping (monsoon risk)
- Cleaning vehicle telemetry
- Satellite imagery

### 10. Comprehensive Analytics and PDF Export
- Dashboard with real-time statistics, charts, and tabular data
- Recharts-powered visualizations (severity distribution, trends, highway comparisons)
- Branded PDF report generation via jsPDF with per-topic or full dashboard export

---

## Tech Stack

### Backend (Python)

| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.115.6 | Web framework and API |
| Uvicorn | 0.34.0 | ASGI server |
| SQLAlchemy | 2.0.36 | ORM and database layer |
| Pydantic | 2.10.3 | Data validation and settings |
| Ultralytics (YOLOv8) | 8.3.52 | Object detection model |
| PyTorch | 2.5.1 | ML inference runtime |
| TorchVision | 0.20.1 | Vision model utilities |
| OpenCV | 4.10.0 | Computer vision processing |
| Pillow | 11.1.0 | Image processing |
| NumPy | 1.26.4 | Numerical computing |
| geopy | 2.4.1 | Geocoding and distance calculations |
| httpx | 0.28.1 | Async HTTP client |
| aiofiles | 24.1.0 | Async file I/O |

### Frontend (TypeScript)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | React framework (App Router) |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first CSS |
| shadcn/ui | 4.0.6 | Component library (base-nova style) |
| Leaflet / react-leaflet | 1.9.4 / 5.0.0 | Interactive maps |
| leaflet.heat | 0.2.0 | Heatmap visualization |
| Recharts | 2.15.4 | Charts and analytics |
| jsPDF | 4.2.0 | PDF report generation |
| Lucide React | 0.577.0 | Icon system |
| next-themes | 0.4.6 | Dark/light mode |
| sonner | 2.0.7 | Toast notifications |

### Database

- **SQLite** (`supath.db`) - file-based, zero-configuration database
- Auto-created and seeded on first startup

---

## Project Structure

```
supath/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/             # API route handlers
│   │   │       ├── analytics.py    # Dashboard statistics
│   │   │       ├── citizens.py     # Citizen report submissions
│   │   │       ├── complaints.py   # Complaint CRUD and management
│   │   │       ├── contractors.py  # Contractor management
│   │   │       ├── detection.py    # Image/video upload and YOLO detection
│   │   │       ├── highways.py     # Highway data and GeoJSON serving
│   │   │       ├── loop_closure.py # Escalation and repair verification
│   │   │       ├── reports.py      # Pothole CRUD and status updates
│   │   │       └── sources.py      # News, traffic, waterlogging data
│   │   ├── data/
│   │   │   ├── geojson/            # Highway and boundary GeoJSON files
│   │   │   │   ├── cg_national_highways.geojson
│   │   │   │   ├── cg_state_highways.geojson
│   │   │   │   └── cg_state_boundary.geojson
│   │   │   └── seed/
│   │   │       └── seeder.py       # Database seeder (250 realistic potholes)
│   │   ├── ml/
│   │   │   └── models/
│   │   │       └── best.pt         # Trained YOLOv8 model weights
│   │   ├── models/
│   │   │   └── models.py          # SQLAlchemy ORM models (9 tables)
│   │   ├── schemas/
│   │   │   └── schemas.py         # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── detector.py        # YOLO + OpenCV detection pipeline (~1050 lines)
│   │   │   ├── geocoding.py       # Highway/city geocoding service
│   │   │   ├── loop_closure.py    # Escalation and verification logic
│   │   │   └── severity.py        # Severity scoring algorithm
│   │   ├── config.py              # Application settings (pydantic-settings)
│   │   ├── database.py            # SQLAlchemy engine and session setup
│   │   └── main.py                # FastAPI app entry point
│   ├── scripts/
│   │   └── fetch_highways.py      # Overpass API highway data fetcher
│   ├── migrate_contractor_assignments.py
│   ├── requirements.txt
│   └── supath.db                  # SQLite database (auto-created)
│
├── frontend/
│   ├── src/
│   │   ├── app/                   # Next.js App Router pages
│   │   │   ├── page.tsx           # Dashboard (main landing page)
│   │   │   ├── layout.tsx         # Root layout with providers
│   │   │   ├── analytics/         # Analytics and charts
│   │   │   ├── complaints/        # Complaint management
│   │   │   ├── contractors/       # Contractor management
│   │   │   ├── detect/            # Image/video upload (admin only)
│   │   │   ├── login/             # Login page
│   │   │   ├── loop-closure/      # Loop closure management (admin only)
│   │   │   ├── map/               # Interactive highway map
│   │   │   ├── report/            # Citizen pothole reporting
│   │   │   ├── reports/           # Pothole reports listing
│   │   │   └── sources/           # Data sources (news, traffic, etc.)
│   │   ├── components/
│   │   │   ├── dashboard/         # Dashboard-specific components
│   │   │   ├── layout/            # Header, sidebar, client layout
│   │   │   ├── map/               # Leaflet map component
│   │   │   └── ui/                # shadcn/ui components (17 components)
│   │   └── lib/
│   │       ├── api.ts             # API client class
│   │       ├── types.ts           # TypeScript interfaces
│   │       ├── pdf-export.ts      # PDF generation utilities
│   │       ├── utils.ts           # Utility functions
│   │       ├── auth/
│   │       │   └── context.tsx    # Authentication context and provider
│   │       └── i18n/
│   │           ├── context.tsx    # Internationalization context
│   │           └── translations.ts # 6-language translation strings
│   ├── next.config.ts             # API proxy rewrites configuration
│   ├── package.json
│   └── tsconfig.json
│
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python** 3.10+ (3.11 recommended)
- **Node.js** 18+ (20+ recommended)
- **npm** or **yarn** or **pnpm**
- **Git**

> **Note:** PyTorch and the YOLO model require significant disk space (~2GB). GPU is optional - the detection pipeline will use CPU if no CUDA-compatible GPU is available.

### Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate    # macOS/Linux
   # .venv\Scripts\activate     # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create a `.env` file (optional - defaults work out of the box):**
   ```bash
   touch .env
   ```
   See [Backend Environment Variables](#backend-environment-variables) for available options.

5. **Start the backend server:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   On first startup, the application will:
   - Create the SQLite database (`supath.db`)
   - Create all tables via SQLAlchemy
   - Seed the database with 250 realistic pothole records along actual Chhattisgarh highways
   - Load and warm up the YOLOv8 model

6. **Verify the server is running:**
   ```bash
   curl http://localhost:8000/health
   ```
   Expected response:
   ```json
   {"status": "healthy", "app": "SUPATH", "version": "1.0.0", "region": "Chhattisgarh"}
   ```

### Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

> **Important:** The frontend proxies all `/api/*` requests to `http://localhost:8000` via Next.js rewrites. The backend must be running for the frontend to function.

### Running Both Servers

For development, you need two terminal sessions:

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

---

## Configuration

### Backend Environment Variables

All configuration is managed through `pydantic-settings` and can be set via a `.env` file in the `backend/` directory or through environment variables. Defaults are provided for all values.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./supath.db` | Database connection string |
| `UPLOAD_DIR` | `uploads` | Directory for uploaded images/videos |
| `MAX_FILE_SIZE` | `52428800` (50MB) | Maximum upload file size in bytes |
| `YOLO_MODEL_PATH` | `app/ml/models/best.pt` | Path to YOLOv8 model weights |
| `DETECTION_CONFIDENCE` | `0.25` | Minimum confidence threshold for detections |
| `DETECTION_IOU` | `0.45` | IoU threshold for NMS deduplication |
| `DEBUG` | `true` | Enable debug mode |
| `CG_CENTER_LAT` | `21.27` | Chhattisgarh center latitude |
| `CG_CENTER_LNG` | `81.87` | Chhattisgarh center longitude |
| `CG_BOUNDS_NORTH` | `24.12` | Northern geographic bound |
| `CG_BOUNDS_SOUTH` | `17.78` | Southern geographic bound |
| `CG_BOUNDS_EAST` | `84.40` | Eastern geographic bound |
| `CG_BOUNDS_WEST` | `80.24` | Western geographic bound |
| `ESCALATION_REMINDER` | `3` | Days before reminder escalation |
| `ESCALATION_DISTRICT` | `7` | Days before district-level escalation |
| `ESCALATION_STATE` | `15` | Days before state-level escalation |
| `ESCALATION_CRITICAL` | `30` | Days before media/RTI escalation |
| `ESCALATION_FINAL` | `45` | Days before final (Chief Secretary) escalation |
| `CORS_ORIGINS` | `["http://localhost:3000", "http://127.0.0.1:3000"]` | Allowed CORS origins |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `""` (empty) | API base URL. Defaults to empty, which uses Next.js rewrites to proxy to the backend |

---

## Architecture

### System Architecture

SUPATH is a monorepo with a clear frontend/backend separation:

```
                    ┌─────────────────────────────────┐
                    │         Next.js Frontend         │
                    │       (localhost:3000)            │
                    │                                  │
                    │  React 19 + TypeScript + Tailwind│
                    │  shadcn/ui + Leaflet + Recharts  │
                    └──────────┬──────────────────────┘
                               │ /api/* proxied via
                               │ Next.js rewrites
                               ▼
                    ┌─────────────────────────────────┐
                    │        FastAPI Backend            │
                    │       (localhost:8000)            │
                    │                                  │
                    │  ┌─────────┐  ┌───────────────┐  │
                    │  │  Routes  │  │   Services    │  │
                    │  │ (9 API   │──│  - detector   │  │
                    │  │  groups) │  │  - geocoding  │  │
                    │  └────┬────┘  │  - severity   │  │
                    │       │       │  - loop_closure│  │
                    │       │       └───────┬───────┘  │
                    │       ▼               │          │
                    │  ┌─────────┐  ┌───────▼───────┐  │
                    │  │ Models  │  │   YOLOv8 +    │  │
                    │  │(SQLAlch)│  │   OpenCV      │  │
                    │  └────┬────┘  └───────────────┘  │
                    │       │                          │
                    └───────┼──────────────────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │   SQLite DB     │
                    │  (supath.db)    │
                    └─────────────────┘
```

The backend follows a **layered architecture** pattern:
- **Routes** (`api/routes/`) - HTTP request handling, input validation, response formatting
- **Services** (`services/`) - Business logic, ML inference, geocoding, escalation
- **Models** (`models/`) - Database ORM definitions and relationships
- **Schemas** (`schemas/`) - Pydantic models for request/response serialization

### Detection Pipeline

The detection pipeline is the core of SUPATH. It processes uploaded images and videos through a multi-stage process:

```
Image/Video Upload
       │
       ▼
┌──────────────┐
│ EXIF GPS     │──── Extract coordinates from image metadata
│ Extraction   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Multi-Scale  │──── Run YOLOv8 at 640px and 1280px
│ YOLO Detect  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ CV Verify    │──── 5-point verification gate:
│ Gate         │     1. Contrast check
└──────┬───────┘     2. Texture analysis
       │             3. Edge detection
       │             4. Shape validation
       │             5. Road membership test
       ▼
┌──────────────┐
│ OpenCV       │──── Fallback for low-confidence YOLO results
│ Fallback     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ NMS          │──── Deduplicate overlapping detections
│ Dedup        │
└──────┬───────┘
       │
       ▼ (video only)
┌──────────────┐
│ Temporal     │──── Confirm potholes persist across frames
│ Consensus    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Severity     │──── Score 0-100 (confidence + area + class)
│ Scoring      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Geocoding    │──── Map to nearest highway and city/district
│ & Storage    │
└──────────────┘
```

### Escalation Ladder

Complaints follow a 6-level automated escalation path:

```
Day 0: Complaint Filed → Department
         │
Day 3:   ├─── No response → Reminder Sent
         │
Day 7:   ├─── Still unresolved → District Collector Notified
         │
Day 15:  ├─── Still unresolved → State PWD Escalation
         │
Day 30:  ├─── Still unresolved → Media Alert / RTI Filing
         │
Day 45:  └─── Still unresolved → Chief Secretary (Final Escalation)
```

Each escalation level is configurable via environment variables. The auto-escalation process can be triggered manually via the API or scheduled externally.

### Loop Closure System

The loop closure system ensures repairs are genuine:

1. A pothole is marked as "resolved" by a contractor
2. The system re-verifies the location (via new image upload or automated check)
3. If the pothole is re-detected:
   - Complaint is **reopened**
   - Escalation level is **increased**
   - Contractor is **flagged**
   - Contractor reputation score is **reduced**
4. If verification passes, the resolution is confirmed

---

## Database Schema

The system uses 9 SQLAlchemy models backed by SQLite:

### Core Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `potholes` | Primary pothole records | `id`, `latitude`, `longitude`, `severity`, `severity_score`, `status`, `highway_ref`, `confidence_score`, `source`, `image_path`, `nearest_city`, `district` |
| `complaints` | Filed complaints linked to potholes | `id`, `pothole_id`, `complaint_ref`, `status`, `escalation_level`, `authority`, `filed_date`, `resolved_date` |
| `contractors` | Contractor profiles and scores | `id`, `name`, `company`, `reputation_score`, `road_quality_score`, `is_flagged`, `assigned_highways` |
| `highways` | NH and SH highway records | `id`, `name`, `ref`, `highway_type`, `risk_score`, `geometry` (GeoJSON) |

### Supporting Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `citizen_reports` | Crowdsourced pothole reports | `id`, `description`, `latitude`, `longitude`, `severity`, `phone_hash`, `incentive_points`, `verified` |
| `news_mentions` | Media monitoring records | `id`, `title`, `source_type` (newspaper/Twitter), `highway_ref`, `sentiment` |
| `waterlogging_zones` | Monsoon risk zones | `id`, `zone_name`, `latitude`, `longitude`, `risk_level`, `highway_ref` |
| `traffic_anomalies` | Speed data anomalies | `id`, `location_name`, `avg_speed`, `normal_speed`, `anomaly_type`, `highway_ref` |
| `incentive_tiers` | Gamification reward levels | `id`, `tier_name`, `min_points`, `max_points`, `reward_description` |

### Pothole Status Values
- `detected` - Initially detected by AI or reported
- `confirmed` - Verified as a real pothole
- `in_progress` - Repair work underway
- `resolved` - Repair completed (pending verification)
- `reopened` - Failed loop closure verification

### Severity Levels
- `critical` - Score 70-100
- `high` - Score 50-69
- `medium` - Score 30-49
- `low` - Score 0-29

---

## API Reference

The backend exposes a RESTful API. Full interactive documentation is available at `http://localhost:8000/docs` (Swagger UI) when the server is running.

### Detection (`/api/detect`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/detect/image` | Upload an image for pothole detection |
| `POST` | `/api/detect/video` | Upload a video for frame-by-frame detection |

### Potholes (`/api/potholes`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/potholes/` | List all potholes (with filtering) |
| `GET` | `/api/potholes/{id}` | Get a specific pothole |
| `PUT` | `/api/potholes/{id}/status` | Update pothole status |
| `POST` | `/api/potholes/{id}/escalate` | Trigger escalation for a pothole |
| `POST` | `/api/potholes/{id}/notify` | Send notification for a pothole |
| `POST` | `/api/potholes/backfill-locations` | Backfill missing geocoding data |

### Complaints (`/api/complaints`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/complaints/` | List all complaints |
| `POST` | `/api/complaints/` | File a new complaint |
| `PUT` | `/api/complaints/{id}` | Update a complaint |
| `DELETE` | `/api/complaints/{id}` | Delete a complaint |

### Highways (`/api/highways`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/highways/` | List all highways with risk scores |
| `GET` | `/api/highways/geojson/{type}` | Get GeoJSON data (national/state) |
| `GET` | `/api/highways/boundary` | Get Chhattisgarh state boundary GeoJSON |

### Analytics (`/api/analytics`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/dashboard` | Aggregated dashboard statistics |

### Contractors (`/api/contractors`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/contractors/` | List all contractors |
| `POST` | `/api/contractors/` | Create a new contractor |
| `PUT` | `/api/contractors/{id}` | Update contractor details |
| `DELETE` | `/api/contractors/{id}` | Remove a contractor |

### Citizen Reports (`/api/citizen-reports`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/citizen-reports/` | List citizen reports |
| `POST` | `/api/citizen-reports/` | Submit a new citizen report |
| `GET` | `/api/citizen-reports/incentive-tiers` | Get gamification tier definitions |

### Data Sources (`/api/sources`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sources/news` | Get news/media mentions |
| `GET` | `/api/sources/traffic-anomalies` | Get traffic anomaly data |
| `GET` | `/api/sources/waterlogging` | Get waterlogging zone data |

### Loop Closure (`/api/loop-closure`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/loop-closure/config` | Get escalation configuration |
| `POST` | `/api/loop-closure/auto-escalate` | Trigger auto-escalation process |
| `POST` | `/api/loop-closure/verify/{pothole_id}` | Verify a resolved pothole |
| `GET` | `/api/loop-closure/pending` | Get potholes pending verification |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Application health check |

---

## Frontend Pages

| Route | Page | Access | Description |
|-------|------|--------|-------------|
| `/` | Dashboard | All users | Comprehensive stats, charts, tables, PDF export |
| `/login` | Login | Public | User authentication |
| `/map` | Highway Map | All users | Interactive Leaflet map with GeoJSON highway overlays, heatmap, pothole markers |
| `/detect` | Detection | Admin only | Upload images/videos for AI pothole detection |
| `/reports` | Pothole Reports | All users | Paginated listing of all detected potholes |
| `/complaints` | Complaints | All users | Complaint management with status tracking |
| `/analytics` | Analytics | All users | Charts and data visualizations |
| `/contractors` | Contractors | All users | Contractor profiles, reputation scores, flagging |
| `/report` | Citizen Report | All users | Public pothole reporting form with photo upload |
| `/sources` | Data Sources | All users | News mentions, traffic anomalies, waterlogging zones |
| `/loop-closure` | Loop Closure | Admin only | Escalation management and repair verification |

---

## Authentication

Authentication is implemented client-side via React Context and localStorage. There are two hardcoded user accounts:

| Username | Password | Role | Access |
|----------|----------|------|--------|
| `admin` | `supath@admin` | Admin | Full access including detection and loop closure |
| `auditor` | `supath@audit` | Auditor | Read access to all pages except detection and loop closure |

> **Note:** There is no backend authentication enforcement. The current auth implementation is designed for demonstration purposes. For production use, implement JWT-based authentication with the `python-jose` library (already included in dependencies).

Admin-only pages (`/detect`, `/loop-closure`) redirect unauthorized users to the login page.

---

## Internationalization

SUPATH supports 6 languages through a custom i18n implementation using React Context:

| Language | Script | Font Support |
|----------|--------|--------------|
| English | Latin | Default |
| Hindi | Devanagari | Noto Sans Devanagari |
| Bengali | Bengali | Noto Sans Bengali |
| Telugu | Telugu | Noto Sans Telugu |
| Marathi | Devanagari | Noto Sans Devanagari |
| Tamil | Tamil | Noto Sans Tamil |

The language toggle is accessible from the application header. All UI strings, labels, and messages are translated across the complete interface (~2000+ translation keys).

---

## Scripts and Utilities

### Backend Scripts

**Fetch Highway Data:**
```bash
cd backend
python scripts/fetch_highways.py
```
Fetches real highway GeoJSON data for Chhattisgarh from the OpenStreetMap Overpass API. Generates GeoJSON files for National Highways, State Highways, and the state boundary.

**Migrate Contractor Assignments:**
```bash
cd backend
python migrate_contractor_assignments.py
```
One-time migration script to assign contractors to highways and potholes.

### Frontend Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Next.js development server with hot reload |
| `build` | `npm run build` | Create production build |
| `start` | `npm run start` | Start production server |
| `lint` | `npm run lint` | Run ESLint |

---

## Data Sources

### GeoJSON Files

The `backend/app/data/geojson/` directory contains three GeoJSON files with real geographic data:

- **`cg_national_highways.geojson`** - National Highway geometries across Chhattisgarh
- **`cg_state_highways.geojson`** - State Highway geometries across Chhattisgarh
- **`cg_state_boundary.geojson`** - Chhattisgarh state boundary polygon

These files are sourced from OpenStreetMap via the Overpass API and can be refreshed using `scripts/fetch_highways.py`.

### Database Seeding

On first startup, the database is automatically populated with:
- 250 pothole records distributed along actual highway geometries
- Contractor profiles with varied reputation scores
- Highway records with risk assessments
- Sample complaints at various escalation levels
- Citizen reports, news mentions, traffic anomalies, and waterlogging zones
- Incentive tier definitions

The seeder uses realistic coordinates snapped to actual GeoJSON highway linestrings, ensuring that map visualizations accurately reflect real road networks.

### YOLOv8 Model

The trained YOLOv8 model weights are stored at `backend/app/ml/models/best.pt`. The model is pre-loaded and warmed up on application startup for faster initial inference. It detects pothole objects in images and assigns confidence scores used downstream in severity calculation.

---

## License

This project was developed for Chhattisgarh Infotech Promotion Society (CHIPS).

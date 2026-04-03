"""Excel parsing and DB write logic.

Moved from inspect_schedule.py — same parsing heuristics, now importable.
Includes backup_database() for safety before destructive imports.
"""

import logging
import os
import re
import shutil
import datetime
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from sqlalchemy import create_engine, text

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────

DAY_NAMES = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
SLOT_DURATION = datetime.timedelta(minutes=30)

TEACHER_ALIAS_MAP = {
    "mr zac": "Mr Zakaria",
    "mr zak": "Mr Zakaria",
    "mr zakaria": "Mr Zakaria",
    "mr zakiria": "Mr Zakaria",
    "mr zack": "Mr Zakaria",
}


# ── Helpers ──────────────────────────────────────────────────────────

def normalize_teacher(name: Optional[str]) -> Optional[str]:
    if not name:
        return name
    s = str(name).strip()
    key = re.sub(r"\s+", " ", s).lower()
    return TEACHER_ALIAS_MAP.get(key, s)


def get_first_monday_of_month(year: int, month: int) -> datetime.datetime:
    first_day = datetime.datetime(year, month, 1)
    day_of_week = first_day.weekday()
    if day_of_week == 6:
        return datetime.datetime(year, month, 2)
    elif day_of_week == 0:
        return datetime.datetime(year, month, 1)
    else:
        return datetime.datetime(year, month, 1 + (7 - day_of_week))


def get_week_for_date(date: datetime.datetime) -> Optional[Tuple[int, int, int]]:
    year = date.year
    month = date.month
    first_monday = get_first_monday_of_month(year, month)
    current_week_start = first_monday
    week_number = 1
    while current_week_start.month == month:
        week_end = current_week_start + datetime.timedelta(days=6)
        if current_week_start <= date <= week_end:
            return (year, month, week_number)
        current_week_start += datetime.timedelta(days=7)
        week_number += 1
    return None


def academic_week_to_month_week(
    week_num: int, anchor_date: str = "2025-09-01",
) -> Optional[Tuple[int, int, int]]:
    try:
        anchor = datetime.datetime.strptime(anchor_date, "%Y-%m-%d")
        target_date = anchor + datetime.timedelta(weeks=week_num - 1)
        return get_week_for_date(target_date)
    except Exception as e:
        logger.warning("Failed to convert academic week %s: %s", week_num, e)
        return None


# ── Backup ───────────────────────────────────────────────────────────

def backup_database() -> Optional[str]:
    """Create a timestamped backup of the database before destructive imports.

    Returns the backup path, or None if backup is not applicable (e.g. Postgres).
    """
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        logger.info("Skipping file-based backup for non-SQLite database")
        return None

    # Extract path from sqlite:///path
    db_path = db_url.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        logger.info("No existing database to back up at %s", db_path)
        return None

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(os.path.dirname(db_path) or ".", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    backup_path = os.path.join(backup_dir, f"schedule_backup_{timestamp}.db")
    shutil.copy2(db_path, backup_path)
    logger.info("Database backed up to %s", backup_path)
    return backup_path


def check_production_import_guard() -> None:
    """Block imports in production unless explicitly allowed."""
    if settings.is_production and not settings.ALLOW_PRODUCTION_IMPORT:
        raise RuntimeError(
            "Import blocked: ENVIRONMENT=production and ALLOW_PRODUCTION_IMPORT is not true. "
            "Set ALLOW_PRODUCTION_IMPORT=true to proceed."
        )


# ── Excel parsing ────────────────────────────────────────────────────
# Frozen heuristics — moved from inspect_schedule.py without changes.

def read_excel_sheets(
    file_path: str, sheet_names: Optional[List[str]] = None,
) -> Dict[str, pd.DataFrame]:
    """Read Excel sheets. If sheet_names is None, read all."""
    try:
        if sheet_names:
            dfs = {
                name: pd.read_excel(file_path, sheet_name=name, header=None)
                for name in sheet_names
            }
        else:
            dfs = pd.read_excel(file_path, sheet_name=None, header=None)
        logger.info("Read %d sheets from %s: %s", len(dfs), file_path, list(dfs.keys()))
        return dfs
    except Exception as e:
        logger.error("Failed to read Excel file: %s", e)
        raise


def build_tables(
    file_path: str, sheet_names: Optional[List[str]] = None,
):
    """Parse Excel into DataFrames: campuses, teachers, classes, lessons.

    This is the frozen parsing logic moved verbatim from inspect_schedule.py.
    """
    dfs = read_excel_sheets(file_path, sheet_names)

    ENGLISH_NAME_PATTERN = re.compile(r"^(Mr|Ms|Mrs)\s+[A-Za-z]+$")
    TIME_PATTERN = re.compile(r"(\d{1,2}[:h]\d{2})\s*-\s*(\d{1,2}[:h]\d{2})")
    WEEK_PATTERN = re.compile(r"\bWEEK\s*(\d+)\b", flags=re.IGNORECASE)
    ROOM_PATTERN = re.compile(
        r"\b(?:Room|Rm|Cab|Aud|Aula)?\s*([A-Za-z]?[0-9]{1,4}[A-Za-z]?)\b",
        flags=re.IGNORECASE,
    )

    campuses: list = []
    teachers: Set[Tuple[str, bool]] = set()
    classes: list = []
    lessons: list = []
    slot_keys: set = set()

    for sheet_name, df in dfs.items():
        campus = "E1"
        for i in range(min(10, df.shape[0])):
            for j in range(min(10, df.shape[1])):
                cell_val = df.iloc[i, j]
                if pd.notna(cell_val):
                    cell_str = str(cell_val).upper()
                    if "E-HOME 1/E1" in cell_str or "E1" in cell_str:
                        campus = "E1"
                        break
                    elif "E-HOME 2/E2" in cell_str or "E2" in cell_str:
                        campus = "E2"
                        break

        campuses.append({"name": campus})
        logger.info("Processing sheet: %s", sheet_name)

        week_by_col: Dict[int, int] = {}
        day_by_col: Dict[int, str] = {}
        for col_idx in range(df.shape[1]):
            for header_row in range(min(3, df.shape[0])):
                val = df.iloc[header_row, col_idx]
                if pd.isna(val):
                    continue
                s = str(val).strip()
                m = WEEK_PATTERN.search(s)
                if m and col_idx not in week_by_col:
                    week_by_col[col_idx] = int(m.group(1))
                tok = s.split()[0]
                if tok in DAY_NAMES and col_idx not in day_by_col:
                    day_by_col[col_idx] = tok

        last_week = None
        for col_idx in range(df.shape[1]):
            if col_idx in week_by_col:
                last_week = week_by_col[col_idx]
            elif last_week is not None:
                week_by_col[col_idx] = last_week

        all_lessons_found: list = []

        is_foreign_schedule = False
        if df.shape[0] > 1:
            header_row = df.iloc[1]
            if pd.notna(header_row[4]) and "CLASS CODE" in str(header_row[4]):
                is_foreign_schedule = True

        row_room_map: Dict[int, str] = {}
        row_teacher_map: Dict[int, str] = {}

        for i, row in df.iterrows():
            if i < 2:
                continue
            if is_foreign_schedule:
                if len(row) > 6 and pd.notna(row[6]):
                    room_str = str(row[6]).strip()
                    row_room_map[i] = room_str.replace(" - ", "-") if " - " in room_str else room_str
                if len(row) > 5 and pd.notna(row[5]):
                    row_teacher_map[i] = normalize_teacher(str(row[5]).strip())
            else:
                if len(row) > 3 and pd.notna(row[3]):
                    room_str = str(row[3]).strip()
                    row_room_map[i] = room_str.replace(" - ", "-") if " - " in room_str else room_str
                if len(row) > 2 and pd.notna(row[2]):
                    row_teacher_map[i] = normalize_teacher(str(row[2]).strip())

        for i, row in df.iterrows():
            if i < 2:
                continue
            if is_foreign_schedule:
                class_code = row[4] if len(row) > 4 and pd.notna(row[4]) else None
                class_name = row[7] if len(row) > 7 and pd.notna(row[7]) else None
            else:
                class_code = row[1] if pd.notna(row[1]) else None
                class_name = row[4] if pd.notna(row[4]) else None

            if class_code:
                class_campus = campus
                if class_code.startswith("E1 "):
                    class_campus = "E1"
                elif class_code.startswith("E2 "):
                    class_campus = "E2"
                classes.append({
                    "campus_name": class_campus,
                    "code_old": class_code,
                    "code_new": class_code,
                    "name": class_name or class_code,
                    "unique_key": (class_campus, class_code, class_name),
                })

            for col_idx, cell in enumerate(row):
                if pd.isna(cell):
                    continue
                cell_str = str(cell).strip()
                if not cell_str:
                    continue
                lines = [p.strip() for p in cell_str.split("\n") if p.strip()]

                time_idx = None
                start_s = end_s = None
                for idx, ln in enumerate(lines):
                    tm = TIME_PATTERN.search(ln)
                    if tm:
                        start_s, end_s = tm.group(1), tm.group(2)
                        time_idx = idx
                        break
                if not start_s or not end_s:
                    continue
                start_s = start_s.replace("h", ":")
                end_s = end_s.replace("h", ":")
                try:
                    datetime.datetime.strptime(start_s, "%H:%M")
                    datetime.datetime.strptime(end_s, "%H:%M")
                except ValueError:
                    continue

                week = week_by_col.get(col_idx)
                day = day_by_col.get(col_idx)
                if week is None and lines:
                    m2 = re.search(r"(\d+)", lines[0])
                    if m2:
                        week = int(m2.group(1))
                if day is None:
                    for ln in lines:
                        if ln in DAY_NAMES:
                            day = ln
                            break

                teacher_from_cell = None
                room = None
                for idx, ln in enumerate(lines):
                    if idx == time_idx:
                        continue
                    if ln in DAY_NAMES:
                        continue
                    if re.search(r"\bWEEK\b", ln, flags=re.IGNORECASE):
                        continue
                    if re.fullmatch(r"\d+", ln):
                        continue
                    if re.fullmatch(r"\(\d{2}/\d{2}-\d{2}/\d{2}\)", ln):
                        continue
                    if teacher_from_cell is None:
                        teacher_from_cell = ln
                        continue
                    m_room = ROOM_PATTERN.search(ln)
                    if m_room and room is None:
                        room = m_room.group(1)

                primary_teacher = row_teacher_map.get(i) or teacher_from_cell
                teacher_from_cell = normalize_teacher(teacher_from_cell) if teacher_from_cell else None
                if teacher_from_cell and not ENGLISH_NAME_PATTERN.match(teacher_from_cell):
                    teacher_from_cell = None

                if not primary_teacher or not class_code or not week or not day:
                    continue

                lesson_room = row_room_map.get(i) or room
                lesson_content_key = (campus, class_code, week, day, primary_teacher, f"{start_s}-{end_s}")

                all_lessons_found.append({
                    "campus": campus,
                    "class_code": class_code,
                    "week": week,
                    "day": day,
                    "teacher": primary_teacher,
                    "timerange": f"{start_s}-{end_s}",
                    "row": i,
                    "col": col_idx,
                    "content_key": lesson_content_key,
                    "room": lesson_room,
                    "teacher_from_cell": teacher_from_cell,
                })

        content_groups: Dict[tuple, list] = {}
        for lesson in all_lessons_found:
            key = lesson["content_key"]
            content_groups.setdefault(key, []).append(lesson)

        unique_lessons_processed = 0
        for content_key, lessons_group in content_groups.items():
            lesson = lessons_group[0]
            _campus = lesson["campus"]
            _class_code = lesson["class_code"]
            _week = lesson["week"]
            _day = lesson["day"]
            _teacher = lesson["teacher"]
            _timerange = lesson["timerange"]
            _teacher_from_cell = lesson.get("teacher_from_cell")

            _start_s, _end_s = [t.strip().replace("h", ":") for t in _timerange.split("-", 1)]
            try:
                t0 = datetime.datetime.strptime(_start_s, "%H:%M")
                t1 = datetime.datetime.strptime(_end_s, "%H:%M")
            except ValueError:
                continue

            final_room = lesson.get("room")
            teachers.add((_teacher, bool(ENGLISH_NAME_PATTERN.match(_teacher))))
            if _teacher_from_cell and _teacher_from_cell != _teacher:
                teachers.add((_teacher_from_cell, bool(ENGLISH_NAME_PATTERN.match(_teacher_from_cell))))

            curr = t0
            while curr < t1:
                nxt = curr + SLOT_DURATION
                key = (_campus, _class_code, _teacher, _week, _day, curr.strftime("%H:%M"), nxt.strftime("%H:%M"))
                if key not in slot_keys:
                    lesson_campus = _campus
                    if _class_code.startswith("E1 "):
                        lesson_campus = "E1"
                    elif _class_code.startswith("E2 "):
                        lesson_campus = "E2"

                    month_week_info = academic_week_to_month_week(_week)
                    month_week_id = None
                    _month = None
                    _year = None
                    _week_number = None
                    if month_week_info:
                        _year, _month, _week_number = month_week_info
                        month_week_id = f"{_year}-{_month:02d}-{_week_number}"

                    lessons.append({
                        "campus_name": lesson_campus,
                        "class_code": _class_code,
                        "teacher_name": _teacher,
                        "week": _week,
                        "day": _day,
                        "start_time": curr.strftime("%H:%M"),
                        "end_time": nxt.strftime("%H:%M"),
                        "room": final_room,
                        "month_week_id": month_week_id,
                        "month": _month,
                        "year": _year,
                        "week_number": _week_number,
                    })
                    slot_keys.add(key)

                    if _teacher_from_cell and _teacher_from_cell != _teacher:
                        coteach_key = (_campus, _class_code, _teacher_from_cell, _week, _day, curr.strftime("%H:%M"), nxt.strftime("%H:%M"))
                        if coteach_key not in slot_keys:
                            lessons.append({
                                "campus_name": lesson_campus,
                                "class_code": _class_code,
                                "teacher_name": _teacher_from_cell,
                                "week": _week,
                                "day": _day,
                                "start_time": curr.strftime("%H:%M"),
                                "end_time": nxt.strftime("%H:%M"),
                                "room": final_room,
                                "month_week_id": month_week_id,
                                "month": _month,
                                "year": _year,
                                "week_number": _week_number,
                            })
                            slot_keys.add(coteach_key)
                curr = nxt
            unique_lessons_processed += 1

    campuses_df = pd.DataFrame(campuses, columns=["name"])
    teachers_df = pd.DataFrame(list(teachers), columns=["name", "is_foreign"])
    teachers_df = teachers_df.sort_values(by=["name"], kind="mergesort").reset_index(drop=True)

    classes_df = pd.DataFrame(classes, columns=["campus_name", "code_old", "code_new", "name", "unique_key"])
    classes_df = classes_df.drop_duplicates(subset=["unique_key"]).drop(columns=["unique_key"]).reset_index(drop=True)

    lessons_df = pd.DataFrame(
        lessons,
        columns=[
            "campus_name", "class_code", "teacher_name", "week", "day",
            "start_time", "end_time", "room", "month_week_id", "month",
            "year", "week_number",
        ],
    )

    campuses_df["campus_id"] = campuses_df.index
    teachers_df["teacher_id"] = teachers_df.index
    classes_df["class_id"] = classes_df.index

    logger.info("Parsed %d campuses, %d teachers, %d classes, %d slots", len(campuses_df), len(teachers_df), len(classes_df), len(lessons_df))
    return campuses_df, teachers_df, classes_df, lessons_df


def save_to_database(
    campuses_df: pd.DataFrame,
    teachers_df: pd.DataFrame,
    classes_df: pd.DataFrame,
    lessons_df: pd.DataFrame,
    db_url: Optional[str] = None,
) -> int:
    """Persist processed data into database. Returns count of imported rows."""
    db_url = db_url or settings.DATABASE_URL
    engine = create_engine(db_url, echo=False)

    if lessons_df.empty:
        logger.error("No lesson data to import!")
        return 0

    if db_url.startswith("sqlite"):
        os.makedirs("data", exist_ok=True)

    with engine.begin() as connection:
        if not db_url.startswith("sqlite"):
            connection.execute(text('UPDATE "user" SET teacher_id = NULL'))
            connection.execute(text("TRUNCATE lesson RESTART IDENTITY CASCADE"))
            connection.execute(text("TRUNCATE class RESTART IDENTITY CASCADE"))
            connection.execute(text("TRUNCATE campus RESTART IDENTITY CASCADE"))
            connection.execute(text("TRUNCATE teacher RESTART IDENTITY CASCADE"))

        campuses_df.to_sql("campus", connection, if_exists="append", index=False)

        if "is_active" not in teachers_df.columns:
            teachers_df["is_active"] = True
        teachers_df["is_active"] = teachers_df["is_active"].fillna(True).astype(bool)

        if "is_active" not in classes_df.columns:
            classes_df["is_active"] = True
        classes_df["is_active"] = classes_df["is_active"].fillna(True).astype(bool)

        teachers_df.to_sql("teacher", connection, if_exists="append", index=False)
        classes_df.to_sql("class", connection, if_exists="append", index=False)

        if not db_url.startswith("sqlite"):
            connection.execute(text("UPDATE teacher SET is_active = TRUE WHERE is_active IS NULL"))
            connection.execute(text("UPDATE class SET is_active = TRUE WHERE is_active IS NULL"))

        df = lessons_df.merge(
            classes_df[["campus_name", "code_new", "class_id"]],
            left_on=["campus_name", "class_code"],
            right_on=["campus_name", "code_new"],
            how="left",
        ).rename(columns={"class_id": "cid_tmp"})

        mask = df["cid_tmp"].isna()
        if mask.any():
            fallback_old = df.loc[mask].merge(
                classes_df[["campus_name", "code_old", "class_id"]],
                left_on=["campus_name", "class_code"],
                right_on=["campus_name", "code_old"],
                how="left",
            )
            df.loc[mask, "cid_tmp"] = fallback_old["class_id"]

        mask = df["cid_tmp"].isna()
        if mask.any():
            fallback_name = df.loc[mask].merge(
                classes_df[["campus_name", "name", "class_id"]],
                left_on=["campus_name", "class_code"],
                right_on=["campus_name", "name"],
                how="left",
            )
            df.loc[mask, "cid_tmp"] = fallback_name["class_id"]

        df.rename(columns={"cid_tmp": "class_id"}, inplace=True)

        df = df.merge(
            teachers_df[["name", "teacher_id"]],
            left_on="teacher_name",
            right_on="name",
            how="left",
        ).merge(
            campuses_df[["name", "campus_id"]],
            left_on="campus_name",
            right_on="name",
            how="left",
        )

        final = df[[
            "class_id", "teacher_id", "week", "day", "start_time", "end_time",
            "room", "month_week_id", "month", "year", "week_number",
        ]].dropna(
            subset=["class_id", "teacher_id", "week", "day", "start_time", "end_time"],
        ).reset_index(drop=True)

        if not final.empty:
            final["month_week_id"] = final["month_week_id"].apply(
                lambda v: None if pd.isna(v) else str(v)
            )
            final.to_sql("lesson", connection, if_exists="append", index=True, index_label="id")
        else:
            logger.warning("No lessons to insert after processing")

    logger.info("Successfully imported %d lesson entries", len(final))
    return len(final)

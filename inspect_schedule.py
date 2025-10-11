import os
import re
import datetime
import pandas as pd
from sqlalchemy import create_engine, text
import logging
from typing import Dict, Set, List, Tuple, Optional
import argparse

# Month-based week utilities
def get_first_monday_of_month(year: int, month: int) -> datetime.datetime:
    """Get the first Monday of a month (or the 1st if it's already Monday)"""
    first_day = datetime.datetime(year, month, 1)
    day_of_week = first_day.weekday()  # 0 = Monday, 6 = Sunday
    
    if day_of_week == 6:  # Sunday
        return datetime.datetime(year, month, 2)
    elif day_of_week == 0:  # Monday
        return datetime.datetime(year, month, 1)
    else:
        days_until_monday = 7 - day_of_week
        return datetime.datetime(year, month, 1 + days_until_monday)

def get_week_for_date(date: datetime.datetime) -> Optional[Tuple[int, int, int]]:
    """Find which week a specific date belongs to: (year, month, week_number)"""
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

def academic_week_to_month_week(week_num: int, anchor_date: str = "2025-09-01") -> Optional[Tuple[int, int, int]]:
    """Convert academic week number to month-based week: (year, month, week_number)"""
    try:
        anchor = datetime.datetime.strptime(anchor_date, "%Y-%m-%d")
        target_date = anchor + datetime.timedelta(weeks=week_num - 1)
        return get_week_for_date(target_date)
    except Exception as e:
        logger.warning(f"Failed to convert academic week {week_num} to month week: {e}")
        return None

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_FILE_PATH = os.getenv("EHOME_SCHEDULE_FILE", 'data/Schedule.xlsx')
DEFAULT_SHEETS_ENV = os.getenv("EHOME_SHEET_NAMES", "").strip()
DAY_NAMES = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
SLOT_DURATION = datetime.timedelta(minutes=30)

# Map teacher name variants to a single canonical form to avoid duplicates
# Example: "Mr Zac", "Mr Zak", and misspellings like "Mr Zakiria" → "Mr Zakaria"
TEACHER_ALIAS_MAP = {
    "mr zac": "Mr Zakaria",
    "mr zak": "Mr Zakaria",
    "mr zakaria": "Mr Zakaria",
    "mr zakiria": "Mr Zakaria",
    "mr zack": "Mr Zakaria",
}

def normalize_teacher(name: Optional[str]) -> Optional[str]:
    if not name:
        return name
    s = str(name).strip()
    key = re.sub(r"\s+", " ", s).lower()
    return TEACHER_ALIAS_MAP.get(key, s)

def read_excel_sheets(file_path: str, sheet_names: Optional[List[str]]) -> Dict[str, pd.DataFrame]:
    """Read Excel sheets safely. If sheet_names is None or empty, read all sheets."""
    try:
        if sheet_names:
            dfs = {name: pd.read_excel(file_path, sheet_name=name, header=None) for name in sheet_names}
        else:
            dfs = pd.read_excel(file_path, sheet_name=None, header=None)
        logger.info(f"Successfully read {len(dfs)} sheets from {file_path}: {list(dfs.keys())}")
        return dfs
    except Exception as e:
        logger.error(f"Failed to read Excel file: {e}")
        raise

def build_tables(file_path: str, sheet_names: Optional[List[str]] = None):
    dfs = read_excel_sheets(file_path, sheet_names)

    # Patterns
    ENGLISH_NAME_PATTERN = re.compile(r'^(Mr|Ms|Mrs)\s+[A-Za-z]+$')
    TIME_PATTERN = re.compile(r"(\d{1,2}[:h]\d{2})\s*-\s*(\d{1,2}[:h]\d{2})")
    WEEK_PATTERN = re.compile(r"\bWEEK\s*(\d+)\b", flags=re.IGNORECASE)
    ROOM_PATTERN = re.compile(r"\b(?:Room|Rm|Cab|Aud|Aula)?\s*([A-Za-z]?[0-9]{1,4}[A-Za-z]?)\b", flags=re.IGNORECASE)

    campuses, teachers, classes, lessons = [], set(), [], []
    slot_keys = set()

    for sheet_name, df in dfs.items():
        # Extract campus from sheet structure - look for E-HOME patterns
        campus = "E1"  # Default to E1
        
        # Look for campus indicators in the sheet
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
        
        logger.info(f"Processing sheet: {sheet_name}")
        
        # Build column → week/day maps from header rows
        week_by_col = {}
        day_by_col = {}
        # Use global constant
        for col_idx in range(df.shape[1]):
            # scan first 3 rows for headers
            for header_row in range(min(3, df.shape[0])):
                val = df.iloc[header_row, col_idx]
                if pd.isna(val):
                    continue
                s = str(val).strip()
                # WEEK detection
                m = WEEK_PATTERN.search(s)
                if m and col_idx not in week_by_col:
                    week_by_col[col_idx] = int(m.group(1))
                # DAY detection
                tok = s.split()[0]
                if tok in DAY_NAMES and col_idx not in day_by_col:
                    day_by_col[col_idx] = tok
        
        # Forward-fill week numbers across columns to cover merged header regions
        last_week = None
        for col_idx in range(df.shape[1]):
            if col_idx in week_by_col:
                last_week = week_by_col[col_idx]
            elif last_week is not None:
                week_by_col[col_idx] = last_week
        
        # Collect all found lessons for analysis
        all_lessons_found = []
        processed_lesson_contents = set()  # Unique lessons by content
        
        # Detect file format by checking header row
        is_foreign_schedule = False
        if df.shape[0] > 1:
            header_row = df.iloc[1]
            if pd.notna(header_row[4]) and 'CLASS CODE' in str(header_row[4]):
                is_foreign_schedule = True
                logger.info(f"Detected foreign schedule format in sheet: {sheet_name}")
        
        # Build row_room_map to map row index to room number
        row_room_map = {}
        # Build row_teacher_map to map row index to teacher name
        row_teacher_map = {}
        
        for i, row in df.iterrows():
            if i < 2:  # skip headers
                continue
            
            if is_foreign_schedule:
                # Foreign schedule format: class_code=column 4, teacher=column 5, room=column 6
                # Extract room from column 6
                if len(row) > 6 and pd.notna(row[6]):
                    room_str = str(row[6]).strip()
                    # Convert "E1 - G1" to "E1-G1" for consistency
                    if ' - ' in room_str:
                        row_room_map[i] = room_str.replace(' - ', '-')
                    else:
                        row_room_map[i] = room_str
                        
                # Extract teacher from column 5
                if len(row) > 5 and pd.notna(row[5]):
                    teacher_str = str(row[5]).strip()
                    row_teacher_map[i] = normalize_teacher(teacher_str)
            else:
                # Original format: room=column 3, teacher=column 2
                # Extract room from R.NO column (column 3) - keep full format
                if len(row) > 3 and pd.notna(row[3]):
                    room_str = str(row[3]).strip()
                    # Keep the full room format as it appears in Excel
                    # Convert "E1 - 202" to "E1-202" for consistency
                    if ' - ' in room_str:
                        row_room_map[i] = room_str.replace(' - ', '-')
                    else:
                        row_room_map[i] = room_str
                        
                # Extract teacher from TEACHER column (column 2)
                if len(row) > 2 and pd.notna(row[2]):
                    teacher_str = str(row[2]).strip()
                    row_teacher_map[i] = normalize_teacher(teacher_str)
        
        for i, row in df.iterrows():
            if i < 2:  # skip headers
                continue
            
            if is_foreign_schedule:
                # Foreign schedule format: class_code=column 4, unit/description=column 7
                class_code = row[4] if len(row) > 4 and pd.notna(row[4]) else None
                class_name = row[7] if len(row) > 7 and pd.notna(row[7]) else None
            else:
                # Original format: class_code=column 1, unit/description=column 4
                class_code = row[1] if pd.notna(row[1]) else None
                class_name = row[4] if pd.notna(row[4]) else None
            
            if class_code:
                # Determine campus from class code if it starts with E1/E2
                class_campus = campus
                if class_code.startswith("E1 "):
                    class_campus = "E1"
                elif class_code.startswith("E2 "):
                    class_campus = "E2"
                
                # Add class only once
                class_key = (class_campus, class_code, class_name)
                classes.append({
                    "campus_name": class_campus,
                    "code_old": class_code,  # Use class_code as old code
                    "code_new": class_code,  # Use class_code as new code
                    "name": class_name or class_code,  # Use class_name as display name
                    "unique_key": class_key
                })
            
            # Process ALL columns to find all lessons
            for col_idx, cell in enumerate(row):
                if pd.isna(cell):
                    continue
                cell_str = str(cell).strip()
                if not cell_str:
                    continue
                lines = [p.strip() for p in cell_str.split('\n') if p.strip()]
                
                # Find time range anywhere in lines
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
                start_s = start_s.replace('h', ':')
                end_s = end_s.replace('h', ':')
                try:
                    t0 = datetime.datetime.strptime(start_s, '%H:%M')
                    t1 = datetime.datetime.strptime(end_s,   '%H:%M')
                except ValueError:
                    continue
                
                # Prefer header-derived week/day
                week = week_by_col.get(col_idx)
                day = day_by_col.get(col_idx)
                
                # Fallbacks from cell content
                if week is None and lines:
                    m = re.search(r"(\d+)", lines[0])
                    if m:
                        week = int(m.group(1))
                if day is None:
                    for ln in lines:
                        if ln in DAY_NAMES:
                            day = ln
                            break
                
                # Teacher heuristic: choose the line that is not time and not day/week label
                teacher_from_cell = None
                room = None
                for idx, ln in enumerate(lines):
                    if idx == time_idx:
                        continue
                    if ln in DAY_NAMES:
                        continue
                    if re.search(r"\bWEEK\b", ln, flags=re.IGNORECASE):
                        continue
                    # skip pure digits (like '4') and date ranges like (11/08-17/08)
                    if re.fullmatch(r"\d+", ln):
                        continue
                    if re.fullmatch(r"\(\d{2}/\d{2}-\d{2}/\d{2}\)", ln):
                        continue
                    if teacher_from_cell is None:
                        teacher_from_cell = ln
                        continue
                    # try to detect room on subsequent lines
                    m_room = ROOM_PATTERN.search(ln)
                    if m_room and room is None:
                        room = m_room.group(1)
                    # keep scanning remaining lines for potential room hints
                
                # Get primary teacher from row's Teacher column (column 6), fallback to cell content
                primary_teacher = row_teacher_map.get(i) or teacher_from_cell
                # Normalize cell-derived teacher alias variants
                teacher_from_cell = normalize_teacher(teacher_from_cell) if teacher_from_cell else None
                # Sanity check: only accept cell-derived teacher if it looks like a real teacher name
                if teacher_from_cell and not ENGLISH_NAME_PATTERN.match(teacher_from_cell):
                    teacher_from_cell = None
                
                if not primary_teacher or not class_code or not week or not day:
                    continue

                # Get room from row mapping
                lesson_room = row_room_map.get(i) or room
                
                # Create a unique lesson key by CONTENT, not by position
                lesson_content_key = (campus, class_code, week, day, primary_teacher, f"{start_s}-{end_s}")
                lesson_info = {
                    'campus': campus,
                    'class_code': class_code,
                    'week': week,
                    'day': day,
                    'teacher': primary_teacher,
                    'timerange': f"{start_s}-{end_s}",
                    'row': i,
                    'col': col_idx,
                    'content_key': lesson_content_key,
                    'room': lesson_room,
                    'teacher_from_cell': teacher_from_cell,  # Keep cell content teacher as additional info
                }
                all_lessons_found.append(lesson_info)
        
        # Analyze found lessons
        logger.info(f"Total lesson entries found: {len(all_lessons_found)}")
        
        # Group by content
        content_groups = {}
        for lesson in all_lessons_found:
            key = lesson['content_key']
            if key not in content_groups:
                content_groups[key] = []
            content_groups[key].append(lesson)
        
        # Show duplicates
        duplicates_count = 0
        for content_key, lessons_group in content_groups.items():
            if len(lessons_group) > 1:
                duplicates_count += 1
                logger.debug(f"DUPLICATE CONTENT: {content_key}")
                for lesson in lessons_group:
                    logger.debug(f"  Found at row {lesson['row']}, col {lesson['col']}")
        
        logger.info(f"Unique lesson contents: {len(content_groups)}")
        logger.info(f"Duplicate contents found: {duplicates_count}")
        
        # Process only unique lessons (take the first occurrence of each)
        unique_lessons_processed = 0
        for content_key, lessons_group in content_groups.items():
            # Take only the first occurrence of the lesson
            lesson = lessons_group[0]
            
            campus = lesson['campus']
            class_code = lesson['class_code'] 
            week = lesson['week']
            day = lesson['day']
            teacher = lesson['teacher']
            timerange = lesson['timerange']
            room = lesson.get('room')
            teacher_from_cell = lesson.get('teacher_from_cell')
            
            # Normalize time "18h30" → "18:30"
            start_s, end_s = [t.strip().replace('h', ':') for t in timerange.split('-', 1)]
            try:
                t0 = datetime.datetime.strptime(start_s, '%H:%M')
                t1 = datetime.datetime.strptime(end_s,   '%H:%M')
            except ValueError:
                logger.warning(f"Could not parse time range '{timerange}'")
                continue

            # Use room from lesson (already mapped during parsing)
            final_room = lesson.get('room')
            
            # Mark primary teacher (from Teacher column)
            teachers.add((teacher, bool(ENGLISH_NAME_PATTERN.match(teacher))))
            
            # Also add co-teaching teacher from cell content if different
            if teacher_from_cell and teacher_from_cell != teacher:
                teachers.add((teacher_from_cell, bool(ENGLISH_NAME_PATTERN.match(teacher_from_cell))))
            
            # Split into slots using global constant
            slot = SLOT_DURATION
            curr = t0
            while curr < t1:
                nxt = curr + slot
                key = (
                    campus,
                    class_code,
                    teacher,
                    week,
                    day,
                    curr.strftime('%H:%M'),
                    nxt.strftime('%H:%M'),
                )
                if key not in slot_keys:
                    # Determine lesson campus from class code
                    lesson_campus = campus
                    if class_code.startswith("E1 "):
                        lesson_campus = "E1"
                    elif class_code.startswith("E2 "):
                        lesson_campus = "E2"
                    
                    # Create lesson for primary teacher
                    # Convert academic week to month-based week
                    month_week_info = academic_week_to_month_week(week)
                    month_week_id = None
                    month = None
                    year = None
                    week_number = None
                    
                    if month_week_info:
                        year, month, week_number = month_week_info
                        month_week_id = f"{year}-{month:02d}-{week_number}"
                    
                    lessons.append({
                        "campus_name": lesson_campus,
                        "class_code": class_code,
                        "teacher_name": teacher,
                        "week": week,  # Keep for backward compatibility
                        "day": day,
                        "start_time": curr.strftime('%H:%M'),
                        "end_time":   nxt.strftime('%H:%M'),
                        "room": final_room,
                        # New month-based week fields
                        "month_week_id": month_week_id,
                        "month": month,
                        "year": year,
                        "week_number": week_number
                    })
                    slot_keys.add(key)
                    
                    # Also create lesson for co-teaching teacher if different
                    if teacher_from_cell and teacher_from_cell != teacher:
                        coteach_key = (
                            campus,
                            class_code,
                            teacher_from_cell,  # Different teacher
                            week,
                            day,
                            curr.strftime('%H:%M'),
                            nxt.strftime('%H:%M'),
                        )
                        if coteach_key not in slot_keys:
                            lessons.append({
                                "campus_name": lesson_campus,
                                "class_code": class_code,
                                "teacher_name": teacher_from_cell,
                                "week": week,  # Keep for backward compatibility
                                "day": day,
                                "start_time": curr.strftime('%H:%M'),
                                "end_time":   nxt.strftime('%H:%M'),
                                "room": final_room,
                                # New month-based week fields (reuse same values)
                                "month_week_id": month_week_id,
                                "month": month,
                                "year": year,
                                "week_number": week_number
                            })
                            slot_keys.add(coteach_key)
                curr = nxt
            
            unique_lessons_processed += 1
        
        logger.info(f"Processed {unique_lessons_processed} unique lessons")

    logger.info("=== FINAL SUMMARY ===")
    logger.info(f"Total 30-min lesson slots created: {len(lessons)}")

    # Create DataFrames
    campuses_df = pd.DataFrame(campuses, columns=["name"])
    teachers_df = pd.DataFrame(list(teachers), columns=["name","is_foreign"])
    # Stabilize teacher IDs across imports by sorting alphabetically by name
    teachers_df = teachers_df.sort_values(by=["name"], kind="mergesort").reset_index(drop=True)

    # Remove duplicate classes by unique_key
    classes_df = pd.DataFrame(classes, columns=["campus_name","code_old","code_new","name","unique_key"])
    classes_df = classes_df.drop_duplicates(subset=["unique_key"]).drop(columns=["unique_key"]).reset_index(drop=True)

    lessons_df = pd.DataFrame(lessons, columns=["campus_name","class_code","teacher_name","week","day","start_time","end_time","room","month_week_id","month","year","week_number"])

    # Check final duplicates in lessons_df
    final_dups = lessons_df[lessons_df.duplicated(subset=["campus_name","class_code","teacher_name","week","day","start_time","end_time"], keep=False)]
    if not final_dups.empty:
        logger.warning(f"Still found {len(final_dups)} duplicate lesson slots!")
        logger.warning(f"Sample: {final_dups.head().to_string()}")
    else:
        logger.info("✓ No duplicates found in final lesson slots")

    # Add IDs
    campuses_df["campus_id"] = campuses_df.index
    teachers_df["teacher_id"] = teachers_df.index  
    classes_df["class_id"] = classes_df.index

    logger.info("Final counts:")
    logger.info(f"Campuses: {len(campuses_df)}")
    logger.info(f"Teachers: {len(teachers_df)}")
    logger.info(f"Classes: {len(classes_df)}")
    logger.info(f"Lesson slots: {len(lessons_df)}")

    return campuses_df, teachers_df, classes_df, lessons_df

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/schedule_test.db")
ENGINE = create_engine(DATABASE_URL, echo=False)

def save_to_database(campuses_df: pd.DataFrame,
                     teachers_df: pd.DataFrame,
                     classes_df: pd.DataFrame,
                     lessons_df: pd.DataFrame) -> None:
    """Persist processed data into the configured database."""
    if lessons_df.empty:
        logger.error("No lesson data to import!")
        return

    # Ensure data directory exists for SQLite fallback
    if DATABASE_URL.startswith("sqlite"):
        os.makedirs("data", exist_ok=True)

    with ENGINE.begin() as connection:
        if not DATABASE_URL.startswith("sqlite"):
            # Detach users from teachers to allow truncation
            connection.execute(text("UPDATE \"user\" SET teacher_id = NULL"))
            # Truncate tables in dependency order and cascade for dependent rows
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

        if not DATABASE_URL.startswith("sqlite"):
            connection.execute(text("UPDATE teacher SET is_active = TRUE WHERE is_active IS NULL"))
            connection.execute(text("UPDATE class SET is_active = TRUE WHERE is_active IS NULL"))

        df = lessons_df.merge(
            classes_df[["campus_name", "code_new", "class_id"]],
            left_on=["campus_name", "class_code"],
            right_on=["campus_name", "code_new"],
            how="left"
        ).rename(columns={"class_id": "cid_tmp"})

        mask = df["cid_tmp"].isna()
        if mask.any():
            fallback_old = df.loc[mask].merge(
                classes_df[["campus_name", "code_old", "class_id"]],
                left_on=["campus_name", "class_code"],
                right_on=["campus_name", "code_old"],
                how="left"
            )
            df.loc[mask, "cid_tmp"] = fallback_old["class_id"]

        mask = df["cid_tmp"].isna()
        if mask.any():
            fallback_name = df.loc[mask].merge(
                classes_df[["campus_name", "name", "class_id"]],
                left_on=["campus_name", "class_code"],
                right_on=["campus_name", "name"],
                how="left"
            )
            df.loc[mask, "cid_tmp"] = fallback_name["class_id"]

        df.rename(columns={"cid_tmp": "class_id"}, inplace=True)

        df = df.merge(
            teachers_df[["name", "teacher_id"]],
            left_on="teacher_name",
            right_on="name",
            how="left"
        ).merge(
            campuses_df[["name", "campus_id"]],
            left_on="campus_name",
            right_on="name",
            how="left"
        )

        unmatched = df[df["class_id"].isna() | df["teacher_id"].isna() | df["campus_id"].isna()]
        if not unmatched.empty:
            logger.warning(f"{len(unmatched)} lessons could not be fully matched")

        final = df[[
            "class_id",
            "teacher_id",
            "week",
            "day",
            "start_time",
            "end_time",
            "room",
            "month_week_id",
            "month",
            "year",
            "week_number"
        ]].dropna(subset=["class_id", "teacher_id", "week", "day", "start_time", "end_time"]).reset_index(drop=True)

        final_duplicates = final[final.duplicated(subset=["class_id", "teacher_id", "week", "day", "start_time", "end_time"], keep=False)]
        if not final_duplicates.empty:
            logger.warning(f"FINAL WARNING: {len(final_duplicates)} duplicates in final data!")
        else:
            logger.info("✓ Final data is clean - no duplicates")

        if not final.empty:
            final["month_week_id"] = final["month_week_id"].apply(lambda v: None if pd.isna(v) else str(v))
            final.to_sql("lesson", connection, if_exists="append", index=True, index_label="id")
        else:
            logger.warning("No lessons to insert after processing; database tables truncated")

    logger.info(f"✓ Successfully imported {len(final)} lesson entries to database")

# Main execution
if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description="Import schedule Excel into SQLite DB")
        parser.add_argument("--file", dest="file_path", default=DEFAULT_FILE_PATH, help="Path to Excel file (default: data/Schedule.xlsx)")
        parser.add_argument("--sheets", dest="sheets", default=None, help="Comma-separated sheet names to import (default: all sheets)")
        args = parser.parse_args()

        # Derive sheet names from CLI or env var; None means import all
        if args.sheets:
            sheet_names = [s.strip() for s in args.sheets.split(",") if s.strip()]
        elif DEFAULT_SHEETS_ENV:
            sheet_names = [s.strip() for s in DEFAULT_SHEETS_ENV.split(",") if s.strip()]
        else:
            sheet_names = None

        logger.info(f"Starting import: file={args.file_path}, sheets={'ALL' if not sheet_names else sheet_names}")
        campuses_df, teachers_df, classes_df, lessons_df = build_tables(args.file_path, sheet_names)
        save_to_database(campuses_df, teachers_df, classes_df, lessons_df)
    except Exception as e:
        logger.error(f"Import process failed: {e}")
        raise
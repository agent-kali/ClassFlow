import os
import re
import datetime
import pandas as pd
from sqlalchemy import create_engine
import logging
from typing import Dict, Set, List, Tuple, Optional

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
FILE_PATH = 'data/Schedule.xlsx'
SHEET_NAMES = ["E1 2025 final AUGUST ", "E2 2025 final AUGUST"]
DAY_NAMES = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
SLOT_DURATION = datetime.timedelta(minutes=30)

def read_excel_sheets(file_path: str, sheet_names: List[str]) -> Dict[str, pd.DataFrame]:
    """Read Excel sheets safely"""
    try:
        dfs = {name: pd.read_excel(file_path, sheet_name=name, header=None)
               for name in sheet_names}
        logger.info(f"Successfully read {len(dfs)} sheets from {file_path}")
        return dfs
    except Exception as e:
        logger.error(f"Failed to read Excel file: {e}")
        raise

dfs = read_excel_sheets(FILE_PATH, SHEET_NAMES)

# Patterns
ENGLISH_NAME_PATTERN = re.compile(r'^(Mr|Ms|Mrs)\s+[A-Za-z]+$')
TIME_PATTERN = re.compile(r"(\d{1,2}[:h]\d{2})\s*-\s*(\d{1,2}[:h]\d{2})")
WEEK_PATTERN = re.compile(r"\bWEEK\s*(\d+)\b", flags=re.IGNORECASE)
ROOM_PATTERN = re.compile(r"\b(?:Room|Rm|Cab|Aud|Aula)?\s*([A-Za-z]?[0-9]{1,4}[A-Za-z]?)\b", flags=re.IGNORECASE)

campuses, teachers, classes, lessons = [], set(), [], []
slot_keys = set()

for sheet_name, df in dfs.items():
    campus = sheet_name.split()[0]
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

    # Build row_room_map to map row index to room number
    row_room_map = {}
    # Build row_teacher_map to map row index to teacher name
    row_teacher_map = {}
    
    for i, row in df.iterrows():
        if i < 2:  # skip headers
            continue
            
        # Extract room from R.NO column (column 7) - keep full format
        if len(row) > 7 and pd.notna(row[7]):
            room_str = str(row[7]).strip()
            # Keep the full room format as it appears in Excel
            # Convert "E1 - G1" to "E1-G1" for consistency
            if ' - ' in room_str:
                row_room_map[i] = room_str.replace(' - ', '-')
            else:
                row_room_map[i] = room_str
                
        # Extract teacher from TEACHER column (column 6)
        if len(row) > 6 and pd.notna(row[6]):
            teacher_str = str(row[6]).strip()
            row_teacher_map[i] = teacher_str

    for i, row in df.iterrows():
        if i < 2:  # skip headers
            continue

        old_code = row[4] if pd.notna(row[4]) else None
        new_code = row[5] if pd.notna(row[5]) else None
        class_code = new_code or old_code
        
        if class_code:
            # Add class only once
            class_key = (campus, class_code, old_code, new_code)
            classes.append({
                "campus_name": campus,
                "code_old": old_code,
                "code_new": new_code,
                "name": class_code,
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
                # Create lesson for primary teacher
                lessons.append({
                    "campus_name": campus,
                    "class_code": class_code,
                    "teacher_name": teacher,
                    "week": week,
                    "day": day,
                    "start_time": curr.strftime('%H:%M'),
                    "end_time":   nxt.strftime('%H:%M'),
                    "room": final_room,
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
                            "campus_name": campus,
                            "class_code": class_code,
                            "teacher_name": teacher_from_cell,
                            "week": week,
                            "day": day,
                            "start_time": curr.strftime('%H:%M'),
                            "end_time":   nxt.strftime('%H:%M'),
                            "room": final_room,
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

lessons_df = pd.DataFrame(lessons, columns=["campus_name","class_code","teacher_name","week","day","start_time","end_time","room"])

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

def save_to_database(campuses_df: pd.DataFrame, teachers_df: pd.DataFrame, 
                    classes_df: pd.DataFrame, lessons_df: pd.DataFrame) -> None:
    """Save processed data to SQLite database"""
    if lessons_df.empty:
        logger.error("No lesson data to import!")
        return
    
    os.makedirs("data", exist_ok=True)
    engine = create_engine("sqlite:///data/schedule_test.db", echo=False)
    
    try:
        campuses_df.to_sql("campus", engine, if_exists="replace", index=False)
        teachers_df.to_sql("teacher", engine, if_exists="replace", index=False)
        classes_df.to_sql("class", engine, if_exists="replace", index=False)

        # Attach class IDs
        df = lessons_df.merge(
            classes_df[["campus_name","code_new","class_id"]], 
            left_on=["campus_name","class_code"], right_on=["campus_name","code_new"], how="left"
        ).rename(columns={"class_id":"cid_tmp"})

        # Fallback to code_old
        mask = df["cid_tmp"].isna()
        if mask.any():
            df2 = df.loc[mask].merge(
                classes_df[["campus_name","code_old","class_id"]],
                left_on=["campus_name","class_code"], right_on=["campus_name","code_old"], how="left"
            )
            df.loc[mask, "cid_tmp"] = df2["class_id"].values

        # Fallback to name
        mask = df["cid_tmp"].isna()
        if mask.any():
            df3 = df.loc[mask].merge(
                classes_df[["campus_name","name","class_id"]], 
                left_on=["campus_name","class_code"], right_on=["campus_name","name"], how="left"
            )
            df.loc[mask, "cid_tmp"] = df3["class_id"].values

        df.rename(columns={"cid_tmp":"class_id"}, inplace=True)

        # Attach teacher_id and campus_id
        df = df.merge(
            teachers_df[["name","teacher_id"]], 
            left_on="teacher_name", right_on="name", how="left"
        ).merge(
            campuses_df[["name","campus_id"]],
            left_on="campus_name", right_on="name", how="left"
        )

        # Check unmatched records
        unmatched = df[df["class_id"].isna() | df["teacher_id"].isna() | df["campus_id"].isna()]
        if not unmatched.empty:
            logger.warning(f"{len(unmatched)} lessons could not be fully matched")

        # Final data
        # carry forward optional room
        df_room = df.get("room") if "room" in df.columns else None
        final = df[["class_id","teacher_id","week","day","start_time","end_time","room"]].dropna(subset=["class_id","teacher_id","week","day","start_time","end_time"]).reset_index(drop=True)
        
        # Last duplicate check
        final_duplicates = final[final.duplicated(subset=["class_id","teacher_id","week","day","start_time","end_time"], keep=False)]
        if not final_duplicates.empty:
            logger.warning(f"FINAL WARNING: {len(final_duplicates)} duplicates in final data!")
        else:
            logger.info("✓ Final data is clean - no duplicates")

        final.to_sql("lesson", engine, if_exists="replace", index=True, index_label="id")
        logger.info(f"✓ Successfully imported {len(final)} lesson entries to database")
    except Exception as e:
        logger.error(f"Database save failed: {e}")
        raise

# Main execution
if __name__ == "__main__":
    try:
        save_to_database(campuses_df, teachers_df, classes_df, lessons_df)
    except Exception as e:
        logger.error(f"Import process failed: {e}")
        raise
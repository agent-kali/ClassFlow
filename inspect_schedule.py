import os
import re
import datetime
import pandas as pd
from sqlalchemy import create_engine

# Path to the Excel file
file_path = 'data/Schedule.xlsx'

# Read sheets
sheet_names = ["E1 2025 final AUGUST ", "E2 2025 final AUGUST"]
dfs = {name: pd.read_excel(file_path, sheet_name=name, header=None)
       for name in sheet_names}

# Regex for foreign names
english_name_pattern = re.compile(r'^(Mr|Ms|Mrs)\s+[A-Za-z]+$')

campuses, teachers, classes, lessons = [], set(), [], []
slot_keys = set()

for sheet_name, df in dfs.items():
    campus = sheet_name.split()[0]
    campuses.append({"name": campus})
    
    print(f"\n=== Processing sheet: {sheet_name} ===")
    
    # Build column → week/day maps from header rows
    week_by_col = {}
    day_by_col = {}
    day_names = {"Mon","Tue","Wed","Thu","Fri","Sat","Sun"}
    for col_idx in range(df.shape[1]):
        # scan first 3 rows for headers
        for header_row in range(min(3, df.shape[0])):
            val = df.iloc[header_row, col_idx]
            if pd.isna(val):
                continue
            s = str(val).strip()
            # WEEK detection
            m = re.search(r"\bWEEK\s*(\d+)\b", s, flags=re.IGNORECASE)
            if m and col_idx not in week_by_col:
                week_by_col[col_idx] = int(m.group(1))
            # DAY detection
            tok = s.split()[0]
            if tok in day_names and col_idx not in day_by_col:
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
                tm = re.search(r"(\d{1,2}[:h]\d{2})\s*-\s*(\d{1,2}[:h]\d{2})", ln)
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
                    if ln in day_names:
                        day = ln
                        break
            
            # Teacher heuristic: choose the line that is not time and not day/week label
            teacher = None
            room = None
            for idx, ln in enumerate(lines):
                if idx == time_idx:
                    continue
                if ln in day_names:
                    continue
                if re.search(r"\bWEEK\b", ln, flags=re.IGNORECASE):
                    continue
                # skip pure digits (like '4') and date ranges like (11/08-17/08)
                if re.fullmatch(r"\d+", ln):
                    continue
                if re.fullmatch(r"\(\d{2}/\d{2}-\d{2}/\d{2}\)", ln):
                    continue
                if teacher is None:
                    teacher = ln
                    continue
                # try to detect room on subsequent lines
                m_room = re.search(r"\b(?:Room|Rm|Cab|Aud|Aula)?\s*([A-Za-z]?[0-9]{1,4}[A-Za-z]?)\b", ln, flags=re.IGNORECASE)
                if m_room and room is None:
                    room = m_room.group(1)
                # keep scanning remaining lines for potential room hints
            if not teacher or not class_code or not week or not day:
                continue

            # Create a unique lesson key by CONTENT, not by position
            lesson_content_key = (campus, class_code, week, day, teacher, f"{start_s}-{end_s}")
            lesson_info = {
                'campus': campus,
                'class_code': class_code,
                'week': week,
                'day': day,
                'teacher': teacher,
                'timerange': f"{start_s}-{end_s}",
                'row': i,
                'col': col_idx,
                'content_key': lesson_content_key,
                'room': room,
            }
            all_lessons_found.append(lesson_info)

    # Analyze found lessons
    print(f"Total lesson entries found: {len(all_lessons_found)}")
    
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
            print(f"DUPLICATE CONTENT: {content_key}")
            for lesson in lessons_group:
                print(f"  Found at row {lesson['row']}, col {lesson['col']}")
    
    print(f"Unique lesson contents: {len(content_groups)}")
    print(f"Duplicate contents found: {duplicates_count}")
    
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
        
        # Normalize time "18h30" → "18:30"
        start_s, end_s = [t.strip().replace('h', ':') for t in timerange.split('-', 1)]
        try:
            t0 = datetime.datetime.strptime(start_s, '%H:%M')
            t1 = datetime.datetime.strptime(end_s,   '%H:%M')
        except ValueError:
            print(f"Warning: Could not parse time range '{timerange}'")
            continue

        # Mark teacher
        teachers.add((teacher, bool(english_name_pattern.match(teacher))))

        # Split into 30-minute slots
        slot = datetime.timedelta(minutes=30)
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
                lessons.append({
                    "campus_name": campus,
                    "class_code": class_code,
                    "teacher_name": teacher,
                    "week": week,
                    "day": day,
                    "start_time": curr.strftime('%H:%M'),
                    "end_time":   nxt.strftime('%H:%M'),
                    "room": room,
                })
                slot_keys.add(key)
            curr = nxt
        
        unique_lessons_processed += 1
    
    print(f"Processed {unique_lessons_processed} unique lessons")

print(f"\n=== FINAL SUMMARY ===")
print(f"Total 30-min lesson slots created: {len(lessons)}")

# Create DataFrames
campuses_df = pd.DataFrame(campuses, columns=["name"])
teachers_df = pd.DataFrame(list(teachers), columns=["name","is_foreign"])

# Remove duplicate classes by unique_key
classes_df = pd.DataFrame(classes, columns=["campus_name","code_old","code_new","name","unique_key"])
classes_df = classes_df.drop_duplicates(subset=["unique_key"]).drop(columns=["unique_key"]).reset_index(drop=True)

lessons_df = pd.DataFrame(lessons, columns=["campus_name","class_code","teacher_name","week","day","start_time","end_time","room"])

# Check final duplicates in lessons_df
final_dups = lessons_df[lessons_df.duplicated(subset=["campus_name","class_code","teacher_name","week","day","start_time","end_time"], keep=False)]
if not final_dups.empty:
    print(f"WARNING: Still found {len(final_dups)} duplicate lesson slots!")
    print("Sample:")
    print(final_dups.head())
else:
    print("✓ No duplicates found in final lesson slots")

# Add IDs
campuses_df["campus_id"] = campuses_df.index
teachers_df["teacher_id"] = teachers_df.index  
classes_df["class_id"] = classes_df.index

print(f"\nFinal counts:")
print(f"Campuses: {len(campuses_df)}")
print(f"Teachers: {len(teachers_df)}")  
print(f"Classes: {len(classes_df)}")
print(f"Lesson slots: {len(lessons_df)}")

# Save to DB
if not lessons_df.empty:
    os.makedirs("data", exist_ok=True)
    engine = create_engine("sqlite:///data/schedule_test.db", echo=False)

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
        print(f"Warning: {len(unmatched)} lessons could not be fully matched")

    # Final data
    # carry forward optional room
    df_room = df.get("room") if "room" in df.columns else None
    final = df[["class_id","teacher_id","week","day","start_time","end_time","room"]].dropna(subset=["class_id","teacher_id","week","day","start_time","end_time"]).reset_index(drop=True)
    
    # Last duplicate check
    final_duplicates = final[final.duplicated(subset=["class_id","teacher_id","week","day","start_time","end_time"], keep=False)]
    if not final_duplicates.empty:
        print(f"FINAL WARNING: {len(final_duplicates)} duplicates in final data!")
    else:
        print("✓ Final data is clean - no duplicates")

    final.to_sql("lesson", engine, if_exists="replace", index=True, index_label="id")
    print(f"\n✓ Successfully imported {len(final)} lesson entries to database")

else:
    print("No lesson data to import!")
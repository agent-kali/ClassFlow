"""Schedule grouping and query helpers.

The grouping algorithm is a pure function (no DB access).
"""

import calendar
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from backend.app.models.schemas import LessonOut

logger = logging.getLogger(__name__)


# ── Month-based week utilities ───────────────────────────────────────

def get_first_monday_of_month(year: int, month: int) -> datetime:
    """Get the first Monday of a given month."""
    first_day = datetime(year, month, 1)
    days_ahead = 0 - first_day.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return first_day + timedelta(days=days_ahead)


def get_weeks_for_month(year: int, month: int) -> List[Tuple[int, datetime, datetime]]:
    """Get all weeks for a given month, each starting on Monday."""
    weeks = []
    first_monday = get_first_monday_of_month(year, month)
    week_num = 1
    current_monday = first_monday

    while current_monday.month == month or (
        current_monday.month == month % 12 + 1 and current_monday.day <= 7
    ):
        week_end = current_monday + timedelta(days=6)
        weeks.append((week_num, current_monday, week_end))
        current_monday += timedelta(days=7)
        week_num += 1
        if current_monday.month != month and current_monday.day > 7:
            break
    return weeks


def get_week_display_name(year: int, month: int, week_number: int) -> str:
    """Generate display name like 'Week 1 (Sep 2-8)'."""
    month_name = calendar.month_abbr[month]
    weeks = get_weeks_for_month(year, month)
    if week_number <= len(weeks):
        _, start_date, end_date = weeks[week_number - 1]
        return f"Week {week_number} ({month_name} {start_date.day}-{end_date.day})"
    return f"Week {week_number}"


def get_current_month_week() -> Tuple[int, int, int]:
    """Get current year, month, and week number."""
    now = datetime.now()
    year = now.year
    month = now.month
    weeks = get_weeks_for_month(year, month)
    for week_num, start_date, end_date in weeks:
        if start_date <= now <= end_date:
            return year, month, week_num
    return year, month, 1


# ── Pure grouping algorithm ──────────────────────────────────────────

def group_consecutive_lessons(lessons: List[LessonOut]) -> List[LessonOut]:
    """Group consecutive 30-minute slots into longer sessions.

    Pure function — no DB access. Requires lessons to be sorted by
    (week, day, start_time).
    """
    if not lessons:
        return []

    grouped = []
    current_group = [lessons[0]]

    for lesson in lessons[1:]:
        last_lesson = current_group[-1]
        if (
            lesson.week == last_lesson.week
            and lesson.day == last_lesson.day
            and lesson.class_code == last_lesson.class_code
            and lesson.teacher_name == last_lesson.teacher_name
            and lesson.campus_name == last_lesson.campus_name
            and last_lesson.end_time == lesson.start_time
        ):
            current_group.append(lesson)
        else:
            grouped.append(_create_grouped_lesson(current_group))
            current_group = [lesson]

    if current_group:
        grouped.append(_create_grouped_lesson(current_group))

    return grouped


def _create_grouped_lesson(group: List[LessonOut]) -> LessonOut:
    """Merge a list of consecutive slot LessonOuts into one."""
    first, last = group[0], group[-1]
    start_time = datetime.strptime(first.start_time, "%H:%M")
    end_time = datetime.strptime(last.end_time, "%H:%M")
    duration = int((end_time - start_time).total_seconds() / 60)

    merged_co: List[str] = []
    for item in group:
        if getattr(item, "co_teachers", None):
            for name in item.co_teachers:
                if name not in merged_co:
                    merged_co.append(name)

    return LessonOut(
        id=first.id,
        week=first.week,
        day=first.day,
        start_time=first.start_time,
        end_time=last.end_time,
        class_code=first.class_code,
        teacher_name=first.teacher_name,
        teacher_id=getattr(first, "teacher_id", None),
        class_id=getattr(first, "class_id", None),
        co_teacher_id=getattr(first, "co_teacher_id", None),
        co_teacher_name=getattr(first, "co_teacher_name", None),
        campus_name=first.campus_name,
        room=first.room,
        co_teachers=merged_co or None,
        duration_minutes=duration,
        notes=getattr(first, "notes", None),
        month=getattr(first, "month", None),
        year=getattr(first, "year", None),
        week_number=getattr(first, "week_number", None),
        month_week_display=getattr(first, "month_week_display", None),
    )


def deduplicate_lessons(lessons: List[LessonOut]) -> List[LessonOut]:
    """Remove duplicate lessons by unique key."""
    seen, unique = set(), []
    for item in lessons:
        key = (
            item.week, item.day, item.start_time, item.end_time,
            item.class_code, item.teacher_name, item.campus_name,
        )
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def build_lessons_from_rows(
    rows,
    co_map: Optional[Dict[Tuple[int, int, str, str, str], List[str]]] = None,
    exclude_teacher: Optional[str] = None,
    viewing_teacher_id: Optional[int] = None,
) -> List[LessonOut]:
    """Convert DB rows to LessonOut objects, optionally attaching co-teachers."""
    items: List[LessonOut] = []
    norm_exclude = exclude_teacher.strip().casefold() if exclude_teacher else None

    for row in rows:
        if len(row) == 3:
            lesson, cls, teacher = row
            co_teacher = None
        else:
            lesson, cls, teacher, co_teacher = row
        if lesson is None or cls is None or teacher is None:
            continue

        key = (cls.class_id, lesson.week, lesson.day, lesson.start_time, lesson.end_time)
        co_list = None
        if co_map is not None and key in co_map:
            names = co_map[key]
            if norm_exclude is not None:
                names = [n for n in names if n.strip().casefold() != norm_exclude]
            co_list = names or None

        # Swap roles for co-teacher viewing their own schedule
        if viewing_teacher_id and lesson.co_teacher_id and lesson.co_teacher_id == viewing_teacher_id:
            primary_teacher = co_teacher
            assistant_teacher = teacher
            primary_teacher_id = lesson.co_teacher_id
            assistant_teacher_id = lesson.teacher_id
        else:
            primary_teacher = teacher
            assistant_teacher = co_teacher
            primary_teacher_id = lesson.teacher_id
            assistant_teacher_id = lesson.co_teacher_id

        month_week_display = None
        if lesson.month and lesson.year and lesson.week_number:
            month_week_display = get_week_display_name(lesson.year, lesson.month, lesson.week_number)

        items.append(
            LessonOut(
                id=lesson.id,
                week=lesson.week,
                day=lesson.day,
                start_time=lesson.start_time,
                end_time=lesson.end_time,
                class_code=(cls.code_new or cls.code_old),
                teacher_name=primary_teacher.name,
                teacher_id=primary_teacher_id,
                class_id=cls.class_id,
                co_teacher_id=assistant_teacher_id,
                co_teacher_name=assistant_teacher.name if assistant_teacher else None,
                campus_name=cls.campus_name,
                room=getattr(lesson, "room", None),
                co_teachers=co_list,
                duration_minutes=30,
                notes=getattr(lesson, "notes", None),
                month=lesson.month,
                year=lesson.year,
                week_number=lesson.week_number,
                month_week_display=month_week_display,
            )
        )
    return items

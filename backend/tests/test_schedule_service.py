"""Unit tests for the pure grouping algorithm — no DB required."""

from backend.app.models.schemas import LessonOut
from backend.app.services.schedule_service import (
    group_consecutive_lessons, deduplicate_lessons,
    get_weeks_for_month, get_week_display_name,
)


def _make_lesson(**kwargs) -> LessonOut:
    defaults = dict(
        day="Mon", start_time="09:00", end_time="09:30",
        class_code="E1-A1", teacher_name="Mr Smith",
        campus_name="E1", duration_minutes=30,
    )
    defaults.update(kwargs)
    return LessonOut(**defaults)


class TestGroupConsecutiveLessons:
    def test_empty_input(self):
        assert group_consecutive_lessons([]) == []

    def test_single_lesson(self):
        lessons = [_make_lesson(week=1)]
        result = group_consecutive_lessons(lessons)
        assert len(result) == 1
        assert result[0].duration_minutes == 30

    def test_two_consecutive_slots(self):
        lessons = [
            _make_lesson(week=1, start_time="09:00", end_time="09:30"),
            _make_lesson(week=1, start_time="09:30", end_time="10:00"),
        ]
        result = group_consecutive_lessons(lessons)
        assert len(result) == 1
        assert result[0].start_time == "09:00"
        assert result[0].end_time == "10:00"
        assert result[0].duration_minutes == 60

    def test_non_consecutive_not_grouped(self):
        lessons = [
            _make_lesson(week=1, start_time="09:00", end_time="09:30"),
            _make_lesson(week=1, start_time="10:00", end_time="10:30"),
        ]
        result = group_consecutive_lessons(lessons)
        assert len(result) == 2

    def test_different_teachers_not_grouped(self):
        lessons = [
            _make_lesson(week=1, teacher_name="Mr Smith", start_time="09:00", end_time="09:30"),
            _make_lesson(week=1, teacher_name="Ms Jones", start_time="09:30", end_time="10:00"),
        ]
        result = group_consecutive_lessons(lessons)
        assert len(result) == 2


class TestDeduplicateLessons:
    def test_removes_duplicates(self):
        lessons = [
            _make_lesson(week=1, start_time="09:00", end_time="09:30"),
            _make_lesson(week=1, start_time="09:00", end_time="09:30"),
        ]
        result = deduplicate_lessons(lessons)
        assert len(result) == 1

    def test_keeps_different_lessons(self):
        lessons = [
            _make_lesson(week=1, start_time="09:00", end_time="09:30"),
            _make_lesson(week=1, start_time="09:30", end_time="10:00"),
        ]
        result = deduplicate_lessons(lessons)
        assert len(result) == 2


class TestWeekUtilities:
    def test_get_weeks_for_month_returns_list(self):
        weeks = get_weeks_for_month(2025, 9)
        assert len(weeks) >= 4

    def test_get_week_display_name(self):
        name = get_week_display_name(2025, 9, 1)
        assert "Week 1" in name
        assert "Sep" in name

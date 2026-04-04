"""API integration tests — minimum 8 required for Phase 1."""

import io
import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Health check is public — no auth required."""

    def test_health_returns_200(self, client: TestClient):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"

    def test_health_is_public(self, client: TestClient):
        """Health should work without any auth header."""
        resp = client.get("/health")
        assert resp.status_code == 200


class TestTeachersEndpoint:
    def test_list_teachers_requires_auth(self, client: TestClient):
        resp = client.get("/teachers")
        assert resp.status_code in (401, 403)

    def test_list_teachers_with_auth(self, client: TestClient, auth_headers):
        resp = client.get("/teachers", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_teacher_not_found(self, client: TestClient, auth_headers):
        resp = client.get("/teachers/99999", headers=auth_headers)
        assert resp.status_code == 404


class TestClassesEndpoint:
    def test_list_classes_requires_auth(self, client: TestClient):
        resp = client.get("/classes")
        assert resp.status_code in (401, 403)

    def test_list_classes_with_auth(self, client: TestClient, auth_headers):
        resp = client.get("/classes", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_class_not_found(self, client: TestClient, auth_headers):
        resp = client.get("/classes/99999", headers=auth_headers)
        assert resp.status_code == 404


class TestUploadEndpoint:
    def test_upload_rejects_non_excel(self, client: TestClient, auth_headers):
        fake_file = io.BytesIO(b"not an excel file")
        resp = client.post(
            "/upload",
            headers=auth_headers,
            files={"file": ("test.txt", fake_file, "text/plain")},
        )
        assert resp.status_code == 400

    def test_upload_requires_auth(self, client: TestClient):
        fake_file = io.BytesIO(b"data")
        resp = client.post(
            "/upload",
            files={"file": ("test.xlsx", fake_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code in (401, 403)

    def test_upload_requires_admin(self, client: TestClient, teacher_headers):
        fake_file = io.BytesIO(b"data")
        resp = client.post(
            "/upload",
            headers=teacher_headers,
            files={"file": ("test.xlsx", fake_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 403


class TestTeacherScheduleAuth:
    def test_my_schedule_requires_auth(self, client: TestClient):
        resp = client.get("/my/1")
        assert resp.status_code in (401, 403)

    def test_teacher_cannot_view_other_schedule(self, client: TestClient, teacher_headers, sample_teacher):
        """A teacher user should not be able to view another teacher's schedule."""
        resp = client.get(f"/my/{sample_teacher.teacher_id}", headers=teacher_headers)
        assert resp.status_code == 403


class TestAuthEndpoints:
    def test_login_public(self, client: TestClient, admin_user):
        resp = client.post("/auth/login", json={"username": "admin", "password": "password"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_invalid(self, client: TestClient):
        resp = client.post("/auth/login", json={"username": "nobody", "password": "wrong"})
        assert resp.status_code == 401


class TestDemoLogin:
    """Demo login endpoint and dataset generation."""

    def test_demo_login_returns_token(self, client: TestClient):
        resp = client.post("/auth/demo-login")
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["user"]["username"] == "demo_manager"
        assert body["user"]["role"] == "manager"

    def test_demo_login_is_idempotent(self, client: TestClient):
        """Calling demo-login twice should reuse the same user."""
        resp1 = client.post("/auth/demo-login")
        resp2 = client.post("/auth/demo-login")
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["user"]["user_id"] == resp2.json()["user"]["user_id"]

    def test_demo_login_creates_demo_data(self, client: TestClient, db):
        resp = client.post("/auth/demo-login")
        assert resp.status_code == 200

        from backend.app.models.db_models import Teacher, ClassModel, Lesson
        teachers = db.query(Teacher).filter(Teacher.name.like("[Demo] %")).all()
        classes = db.query(ClassModel).filter(ClassModel.code_new.like("DEMO-%")).all()
        lessons = db.query(Lesson).all()

        assert len(teachers) == 5
        assert len(classes) == 4
        assert len(lessons) >= 16

    def test_demo_token_works_for_authenticated_endpoints(self, client: TestClient):
        resp = client.post("/auth/demo-login")
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        teachers_resp = client.get("/teachers", headers=headers)
        assert teachers_resp.status_code == 200
        assert isinstance(teachers_resp.json(), list)

    def test_demo_user_cannot_access_admin_routes(self, client: TestClient):
        resp = client.post("/auth/demo-login")
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        admin_resp = client.get("/auth/users", headers=headers)
        assert admin_resp.status_code == 403

    def test_demo_data_not_regenerated_on_second_login(self, client: TestClient, db):
        """Demo data should persist across logins, not be regenerated."""
        client.post("/auth/demo-login")

        from backend.app.models.db_models import Teacher
        first_ids = sorted(
            t.teacher_id for t in db.query(Teacher).filter(Teacher.name.like("[Demo] %")).all()
        )

        client.post("/auth/demo-login")
        second_ids = sorted(
            t.teacher_id for t in db.query(Teacher).filter(Teacher.name.like("[Demo] %")).all()
        )
        assert first_ids == second_ids

    def test_demo_lessons_have_correct_days(self, client: TestClient, db):
        client.post("/auth/demo-login")

        from backend.app.models.db_models import Lesson
        days = {l.day for l in db.query(Lesson).all()}
        assert "Monday" in days
        assert "Wednesday" in days

    def test_demo_reset_requires_admin(self, client: TestClient):
        """Demo reset should not work without admin auth."""
        resp = client.post("/auth/demo-reset")
        assert resp.status_code in (401, 403)

    def test_demo_reset_regenerates_data(self, client: TestClient, admin_user, db):
        client.post("/auth/demo-login")

        from backend.app.core.security import create_access_token
        admin_token = create_access_token({"sub": admin_user.username})
        headers = {"Authorization": f"Bearer {admin_token}"}

        reset_resp = client.post("/auth/demo-reset", headers=headers)
        assert reset_resp.status_code == 200
        body = reset_resp.json()
        assert body["teachers_deleted"] == 5
        assert body["classes_deleted"] == 4
        assert body["lessons_deleted"] >= 16

        from backend.app.models.db_models import Teacher, ClassModel, Lesson
        assert db.query(Teacher).filter(Teacher.name.like("[Demo] %")).count() == 5
        assert db.query(ClassModel).filter(ClassModel.code_new.like("DEMO-%")).count() == 4
        assert db.query(Lesson).count() >= 16

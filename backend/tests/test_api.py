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

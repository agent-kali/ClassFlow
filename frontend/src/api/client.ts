const DEFAULT_BASE_URL = 'http://localhost:8000';

const baseUrl =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_API_BASE_URL) ||
  DEFAULT_BASE_URL;

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

// Authentication storage
class AuthStorage {
  private static TOKEN_KEY = 'ehome_token';
  private static USER_KEY = 'ehome_user';

  static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  static getUser(): any | null {
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  static setUser(user: any): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = AuthStorage.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers,
      ...init,
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        // Token expired or invalid, clear auth data
        AuthStorage.removeToken();
        window.location.href = '/login';
        return Promise.reject(new Error('Authentication failed'));
      }
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  } catch (error) {
    // Handle network errors more gracefully
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Network error: Unable to connect to server. Please check your connection and try again.');
    }
    throw error;
  }
}

export type ScheduleFilter = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
  // Month-based week parameters
  month?: number;
  year?: number;
  week_number?: number;
};

import type { 
  LessonOut, 
  Teacher, 
  ClassInfo, 
  UserLogin, 
  Token, 
  User, 
  UserCreate, 
  LessonCreate, 
  LessonUpdate, 
  ConflictCheck,
  TeacherCreate,
  TeacherUpdate,
  TeacherOut,
  ClassCreate,
  ClassUpdate,
  ClassOut,
  BulkCopyRequest,
  BulkMoveRequest,
  BulkAssignRequest,
  BulkDeleteRequest,
  BulkOperationResponse,
  MonthWeek,
  CurrentMonthWeek,
  ScheduleFilter
} from './types';

export const api = {
  // Schedule endpoints
  listTeachers: () => fetchJson<Teacher[]>('/teachers'),
  listClasses: () => fetchJson<ClassInfo[]>('/classes'),
  getAnchor: () => fetchJson<{ anchor_date: string }>(`/calendar/anchor`),
  getTeacherSchedule: (teacherId: number, filter: ScheduleFilter = {}) =>
    fetchJson<LessonOut[]>(`/my/${teacherId}${toQuery(filter)}`),
  getClassSchedule: (classId: number, filter: ScheduleFilter = {}) =>
    fetchJson<LessonOut[]>(`/class/${classId}${toQuery(filter)}`),
  
  // Month-based week endpoints
  getWeeksForMonth: (year: number, month: number) =>
    fetchJson<MonthWeek[]>(`/weeks/${year}/${month}`),
  getCurrentMonthWeek: () =>
    fetchJson<CurrentMonthWeek>('/current-month-week'),
  
  // Lesson Management
  listLessons: (filters: ScheduleFilter = {}) =>
    fetchJson<LessonOut[]>(`/lessons${toQuery(filters)}`),

  // Authentication endpoints
  login: async (credentials: UserLogin): Promise<Token> => {
    const token = await fetchJson<Token>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    AuthStorage.setToken(token.access_token);
    AuthStorage.setUser(token.user);
    return token;
  },

  demoLogin: async (): Promise<Token> => {
    const token = await fetchJson<Token>('/auth/demo-login', {
      method: 'POST',
    });
    AuthStorage.setToken(token.access_token);
    AuthStorage.setUser(token.user);
    return token;
  },

  logout: (): void => {
    AuthStorage.removeToken();
  },

  getCurrentUser: () => fetchJson<User>('/auth/me'),

  // Admin endpoints
  listUsers: () => fetchJson<User[]>('/auth/users'),
  createUser: (userData: UserCreate) =>
    fetchJson<User>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  updateUser: (userId: number, userData: UserCreate) =>
    fetchJson<User>(`/auth/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
  deleteUser: (userId: number) =>
    fetchJson<{ message: string }>(`/auth/users/${userId}`, {
      method: 'DELETE',
    }),

  // Lesson CRUD endpoints
  checkLessonConflicts: (lessonData: LessonCreate) =>
    fetchJson<ConflictCheck>('/lessons/check-conflicts', {
      method: 'POST',
      body: JSON.stringify(lessonData),
    }),
  
  createLesson: (lessonData: LessonCreate) =>
    fetchJson<LessonOut>('/lessons', {
      method: 'POST',
      body: JSON.stringify(lessonData),
    }),
  
  getLesson: (lessonId: number) =>
    fetchJson<LessonOut>(`/lessons/${lessonId}`),
  
  updateLesson: (lessonId: number, lessonData: LessonUpdate) =>
    fetchJson<LessonOut>(`/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(lessonData),
    }),
  
  deleteLesson: (lessonId: number) =>
    fetchJson<{ message: string }>(`/lessons/${lessonId}`, {
      method: 'DELETE',
    }),
  

  // Teacher Management
  listTeachersDetailed: (filters: {
    search?: string;
    is_active?: boolean;
  } = {}) =>
    fetchJson<TeacherOut[]>(`/teachers${toQuery(filters)}`),
  
  createTeacher: (data: TeacherCreate) =>
    fetchJson<TeacherOut>('/teachers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  getTeacher: (teacherId: number) =>
    fetchJson<TeacherOut>(`/teachers/${teacherId}`),
  
  updateTeacher: (teacherId: number, data: TeacherUpdate) =>
    fetchJson<TeacherOut>(`/teachers/${teacherId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  deleteTeacher: (teacherId: number, force: boolean = false) =>
    fetchJson<{message: string}>(`/teachers/${teacherId}${toQuery({force})}`, {
      method: 'DELETE',
    }),

  // Class Management
  listClassesDetailed: (filters: {
    search?: string;
    campus?: string;
    is_active?: boolean;
  } = {}) =>
    fetchJson<ClassOut[]>(`/classes${toQuery(filters)}`),
  
  createClass: (data: ClassCreate) =>
    fetchJson<ClassOut>('/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  getClass: (classId: number) =>
    fetchJson<ClassOut>(`/classes/${classId}`),
  
  updateClass: (classId: number, data: ClassUpdate) =>
    fetchJson<ClassOut>(`/classes/${classId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  deleteClass: (classId: number, force: boolean = false) =>
    fetchJson<{message: string}>(`/classes/${classId}${toQuery({force})}`, {
      method: 'DELETE',
    }),

  // Bulk Operations
  bulkCopyLessons: (request: BulkCopyRequest) =>
    fetchJson<BulkOperationResponse>('/lessons/bulk/copy', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  bulkMoveLessons: (request: BulkMoveRequest) =>
    fetchJson<BulkOperationResponse>('/lessons/bulk/move', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  bulkAssignTeacher: (request: BulkAssignRequest) =>
    fetchJson<BulkOperationResponse>('/lessons/bulk/assign', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  bulkDeleteLessons: (request: BulkDeleteRequest) =>
    fetchJson<BulkOperationResponse>('/lessons/bulk/delete', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

};

// Auth utilities
export const auth = {
  isAuthenticated: (): boolean => !!AuthStorage.getToken(),
  getUser: (): User | null => AuthStorage.getUser(),
  getToken: (): string | null => AuthStorage.getToken(),
  hasRole: (role: string): boolean => {
    const user = AuthStorage.getUser();
    return user?.role === role;
  },
  hasAnyRole: (roles: string[]): boolean => {
    const user = AuthStorage.getUser();
    return user ? roles.includes(user.role) : false;
  },
};

export { baseUrl };




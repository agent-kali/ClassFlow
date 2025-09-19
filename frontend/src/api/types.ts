export type LessonOut = {
  id?: number; // Add lesson ID for CRUD operations
  week: number;
  day: string;
  start_time: string;
  end_time: string;
  class_code: string;
  teacher_name: string;
  campus_name: string;
  room?: string | null;
  co_teachers?: string[] | null;
  duration_minutes: number;
};

export type Teacher = {
  teacher_id: number;
  name: string;
  is_foreign: boolean;
};

export type ClassInfo = {
  class_id: number;
  name: string;
  code_new: string | null;
  code_old: string | null;
};

// Authentication types
export type UserRole = 'admin' | 'manager' | 'teacher';

export type User = {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  teacher_id?: number | null;
  created_at: string;
};

export type UserCreate = {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  teacher_id?: number | null;
};

export type UserLogin = {
  username: string;
  password: string;
};

export type Token = {
  access_token: string;
  token_type: string;
  user: User;
};

// Lesson management types
export type LessonCreate = {
  teacher_id: number;
  class_id: number;
  week: number;
  day: string;
  start_time: string;
  end_time: string;
  room?: string | null;
};

export type LessonUpdate = {
  teacher_id?: number;
  class_id?: number;
  week?: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  room?: string | null;
};

export type ConflictCheck = {
  conflicts: string[];
  can_create: boolean;
};

// Teacher Management Types
export type TeacherCreate = {
  name: string;
  email?: string;
  phone?: string;
  specialization?: string;
  is_active?: boolean;
};

export type TeacherUpdate = {
  name?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  is_active?: boolean;
};

export type TeacherOut = {
  teacher_id: number;
  name: string;
  email?: string;
  phone?: string;
  specialization?: string;
  is_active: boolean;
  lesson_count: number;
};

// Class Management Types
export type ClassCreate = {
  code_new?: string;
  code_old?: string;
  campus_name: string;
  level?: string;
  capacity?: number;
  is_active?: boolean;
};

export type ClassUpdate = {
  code_new?: string;
  code_old?: string;
  campus_name?: string;
  level?: string;
  capacity?: number;
  is_active?: boolean;
};

export type ClassOut = {
  class_id: number;
  code_new?: string;
  code_old?: string;
  campus_name: string;
  level?: string;
  capacity?: number;
  is_active: boolean;
  lesson_count: number;
};



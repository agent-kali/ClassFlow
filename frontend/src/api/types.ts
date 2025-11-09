export type LessonOut = {
  id?: number;
  week?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  class_code: string;
  teacher_name: string;
  co_teacher_id?: number | null;
  co_teacher_name?: string | null;
  campus_name: string;
  room?: string | null;
  co_teachers?: string[] | null;
  duration_minutes: number;
  teacher_id?: number;
  class_id?: number;
  notes?: string;
  month?: number;
  year?: number;
  week_number?: number;
  month_week_display?: string;
};

export type Teacher = {
  teacher_id: number;
  name: string;
  is_foreign?: boolean | null;
};

export type ClassInfo = {
  class_id: number;
  name: string;
  code_new: string | null;
  code_old: string | null;
};

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

export type LessonCreate = {
  teacher_id: number;
  class_id: number;
  week?: number;
  day: string;
  start_time: string;
  end_time: string;
  room?: string;
  notes?: string;
  co_teacher_id?: number | null;
  month?: number;
  year?: number;
  week_number?: number;
};

export type LessonUpdate = Partial<LessonCreate>;

export type ConflictCheck = {
  conflicts: string[];
  can_create: boolean;
  teacher_conflict?: boolean;
  room_conflict?: boolean;
};

export type BulkCopyRequest = {
  lesson_ids: number[];
  target_week: number;
  target_day?: string;
};

export type BulkMoveRequest = {
  lesson_ids: number[];
  target_week: number;
  target_day?: string;
};

export type BulkAssignRequest = {
  lesson_ids: number[];
  teacher_id: number;
};

export type BulkDeleteRequest = {
  lesson_ids: number[];
};

export type BulkOperationResponse = {
  success: boolean;
  message: string;
  affected_lessons: number;
};

export type MonthWeek = {
  week_number: number;
  start_date: string;
  end_date: string;
  display_name: string;
};

export type CurrentMonthWeek = {
  year: number;
  month: number;
  week_number: number;
  display_name: string;
};

export type TeacherCreate = {
  name: string;
  email?: string;
  phone?: string;
  specialization?: string;
  is_active?: boolean;
};

export type TeacherUpdate = Partial<TeacherCreate>;

export type TeacherOut = {
  teacher_id: number;
  name: string;
  email?: string;
  phone?: string;
  specialization?: string;
  is_active: boolean;
  lesson_count: number;
  is_foreign?: boolean | null;
};

export type ClassCreate = {
  code_new?: string;
  code_old?: string;
  campus_name: string;
  level?: string;
  capacity?: number;
  is_active?: boolean;
};

export type ClassUpdate = Partial<ClassCreate>;

export type ClassOut = {
  class_id: number;
  code_new?: string;
  code_old?: string;
  name: string;
  campus_name: string;
  level?: string;
  capacity?: number;
  is_active: boolean;
  lesson_count: number;
};

export type ScheduleFilter = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
  month?: number;
  year?: number;
  week_number?: number;
};


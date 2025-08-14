export type LessonOut = {
  week: number;
  day: string;
  start_time: string;
  end_time: string;
  class_code: string;
  teacher_name: string;
  campus_name: string;
  room?: string | null;
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



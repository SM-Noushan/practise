import { Types } from "mongoose";

export type TDay = "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type TOfferedCourses = {
  semesterRegistration: Types.ObjectId;
  academicSemester: Types.ObjectId;
  academicFaculty: Types.ObjectId;
  academicDepartment: Types.ObjectId;
  course: Types.ObjectId;
  faculty: Types.ObjectId;
  maxCapacity: number;
  section: string;
  days: TDay;
  startTime: string;
  endTime: string;
};

import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import validateDoc from "../../utils/validateDoc";
import { Faculty } from "../faculty/faculty.model";
import { OfferedCourse } from "./offeredCourses.model";
import { TOfferedCourse } from "./offeredCourses.interface";
import { Course, CourseFaculty } from "../course/course.model";
import { hasTimeConflict, TSchedule } from "./offeredCourses.utils";
import { AcademicFaculty } from "../academicFaculty/academicFaculty.model";
import { AcademicDepartment } from "../academicDepartment/academicDepartment.model";
import { TAcademicDepartment } from "../academicDepartment/academicDepartment.interface";
import { SemesterRegistration } from "./../semesterRegistration/semesterRegistration.model";
import { TSemesterRegistration } from "../semesterRegistration/semesterRegistration.interface";

const getAllOfferedCoursesFromDB = async () => {
  const result = await OfferedCourse.find();
  return result;
};

const getOfferedCourseByIdFromDB = async (id: string) => {
  const result = await OfferedCourse.findById(id).populate(
    "semesterRegistration academicSemester academicFaculty academicDepartment course faculty",
  );
  return result;
};

const createOfferedCourseIntoDB = async (payload: TOfferedCourse) => {
  const {
    semesterRegistration,
    academicFaculty,
    academicDepartment,
    course,
    section,
    faculty,
    days,
    startTime,
    endTime,
  } = payload;
  /**
   * Step 1: check if the semester registration id is exists!
   * Step 2: check if the semester has ended!
   * Step 3: check if the academic faculty id is exists!
   * Step 4: check if the academic department id is exists!
   * Step 5: check if the department is belong to the  faculty!
   * Step 6: check if the course id is exists!
   * Step 7: check if the faculty id is exists!
   * Step 8: check if the faculty is eligible for the offer the course
   * Step 9: check if the same offered course same section in same registered semester exists
   * Step 10: get the schedules of the faculties
   * Step 11: create the offered course
   */

  //   check if the semester registration id is exists!
  const semesterRegistrationDoc = await validateDoc<TSemesterRegistration>({
    model: SemesterRegistration,
    query: { _id: semesterRegistration },
    errMsg: "Semester registration not found",
  });

  //   check if semester has ended
  if (semesterRegistrationDoc?.status === "ENDED")
    throw new AppError(400, "Courses can not be offered for ENDED semester");

  //  check if the academic faculty id is exists!
  await validateDoc({
    model: AcademicFaculty,
    query: { _id: academicFaculty },
    errMsg: "Academic faculty not found",
  });

  //   check if the academic department id is exists!
  const academicDepartmentDoc = await validateDoc<TAcademicDepartment>({
    model: AcademicDepartment,
    query: { _id: academicDepartment },
    errMsg: "Academic department not found",
  });

  //   check if department is belong to the faculty
  if (
    !(academicDepartmentDoc?.academicFaculty as Types.ObjectId)?.equals(
      academicFaculty,
    )
  )
    throw new AppError(
      400,
      "Academic department does not belong to the faculty",
    );

  // check if course id is exists
  await validateDoc({
    model: Course,
    query: { _id: course },
    errMsg: "Course not found",
  });

  //   check if faculty id is exists
  await validateDoc({
    model: Faculty,
    query: { _id: faculty },
    errMsg: "Faculty not found",
  });

  //check if the faculty is eligible for the offer the course
  await validateDoc({
    model: CourseFaculty,
    query: {
      course,
      faculties: faculty,
    },
    errMsg: "Faculty is not eligible to take the course",
  });

  //   check if the same offered course same section in same registered semester exists
  await validateDoc({
    model: OfferedCourse,
    query: {
      semesterRegistration,
      course,
      section,
    },
    trueValidate: false,
    errMsg: "Offered course already exists",
  });

  //   get the schedules of the faculties
  const assignedSchedules = (await OfferedCourse.find({
    semesterRegistration,
    faculty,
    days: { $in: days },
  }).select("-_id days startTime endTime")) as TSchedule[];
  const newSchedule = { days, startTime, endTime };
  const hasTimeConflictResult = hasTimeConflict(assignedSchedules, newSchedule);
  if (hasTimeConflictResult)
    throw new AppError(400, "Faculty is not available at that time");

  const result = await OfferedCourse.create({
    ...payload,
    academicSemester: semesterRegistrationDoc?.academicSemester,
  });
  return result;
};

const updateOfferedCourseIntoDB = async (
  id: string,
  payload: Partial<TOfferedCourse>,
) => {
  const { faculty, days, startTime, endTime } = payload;
  /**
   * Step 1: check if offered course exist!
   * Step 2: check if the semester is ongoing!
   * Step 3: check if the faculty id is exists!
   * Step 4: check if the faculty is eligible for the offer the course
   * Step 5: get the schedules of the faculties and check if there is a time conflict
   * Step 6: update the offered course
   */

  //   check if the offered course exists!
  const offeredCOurseDoc = await validateDoc<TOfferedCourse>({
    model: OfferedCourse,
    query: { _id: id },
    errMsg: "Offered course not found",
  });

  //   check if the semester is upcoming
  const semesterRegistration = await SemesterRegistration.findById(
    offeredCOurseDoc?.semesterRegistration,
  );
  if (semesterRegistration?.status !== "UPCOMING")
    throw new AppError(
      400,
      "Offered course can only be updated for UPCOMING semester",
    );

  //   check if faculty id is exists
  await validateDoc({
    model: Faculty,
    query: { _id: faculty },
    errMsg: "Faculty not found",
  });

  //check if the faculty is eligible for the offer the course
  await validateDoc({
    model: CourseFaculty,
    query: {
      course: offeredCOurseDoc?.course,
      faculties: faculty,
    },
    errMsg: "Faculty is not eligible to take the course",
  });

  //   get the schedules of the faculties
  if (
    !offeredCOurseDoc?.faculty?.equals(faculty) ||
    JSON.stringify(days) !== JSON.stringify(offeredCOurseDoc?.days) ||
    startTime !== offeredCOurseDoc?.startTime ||
    endTime !== offeredCOurseDoc?.endTime
  ) {
    const assignedSchedules = (await OfferedCourse.find({
      _id: { $ne: id },
      semesterRegistration: offeredCOurseDoc?.semesterRegistration,
      faculty,
      days: { $in: days },
    }).select("-_id days startTime endTime")) as TSchedule[];

    const newSchedule = { days, startTime, endTime } as TSchedule;

    const hasTimeConflictResult = hasTimeConflict(
      assignedSchedules,
      newSchedule,
    );
    if (hasTimeConflictResult)
      throw new AppError(400, "Faculty is not available at that time");
  }

  const result = await OfferedCourse.findByIdAndUpdate(id, payload, {
    new: true,
  });
  return result;
};

const deleteOfferedCourseFromDB = async (id: string) => {
  /**
   * Step 1: check if the offered course exists
   * Step 2: check if the semester registration status is upcoming
   * Step 3: delete the offered course
   */
  //   check if the offered course exists!
  const offeredCOurseDoc = await validateDoc<TOfferedCourse>({
    model: OfferedCourse,
    query: { _id: id },
    errMsg: "Offered course not found",
  });

  //   check if the semester is upcoming
  const semesterRegistration = await SemesterRegistration.findById(
    offeredCOurseDoc?.semesterRegistration,
  );
  if (semesterRegistration?.status !== "UPCOMING")
    throw new AppError(
      400,
      "Offered course can only be deleted for UPCOMING semester",
    );

  const result = await OfferedCourse.findByIdAndDelete(id);

  return result;
};

export const OfferedCourseServices = {
  getAllOfferedCoursesFromDB,
  getOfferedCourseByIdFromDB,
  createOfferedCourseIntoDB,
  updateOfferedCourseIntoDB,
  deleteOfferedCourseFromDB,
};

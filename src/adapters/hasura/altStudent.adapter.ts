import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import jwt_decode from "jwt-decode";
import { SuccessResponse } from "src/success-response";
import { StudentDto } from "src/altStudent/dto/alt-student.dto";
import { ErrorResponse } from "src/error-response";
import { decryptPassword, getUserRole } from "./adapter.utils";
import { ALTHasuraUserService } from "./altUser.adapter";
import { GroupMembershipService } from "./groupMembership.adapter";
import { GroupMembershipDtoById } from "src/groupMembership/dto/groupMembership.dto";
import { HasuraGroupService } from "./group.adapter";

@Injectable()
export class ALTStudentService {
  constructor(
    private groupService: HasuraGroupService,
    private userService: ALTHasuraUserService,
    private groupMembershipService: GroupMembershipService
  ) {}

  baseURL = process.env.ALTHASURA;
  adminSecret = process.env.ADMINSECRET;
  axios = require("axios");

  public async getStudent(userId: any, request: any) {
    const decoded: any = jwt_decode(request.headers.authorization);
    const altUserRoles =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-allowed-roles"];

    const data = {
      query: `query getStudent($userId:uuid!) {
      Students(where: {userId: {_eq: $userId}}) {
        annualIncome
        caste
        schoolUdise
        createdAt
        fatherEducation
        fatherOccupation
        updatedAt
        studentId
        religion
        noOfSiblings
        motherOccupation
        motherEducation
        groups
        board
        createdBy
        updatedBy
        user {
          userId
          email
          dateOfBirth
          gender
          mobile
          name
          role
          password
          username
        }
      }
    }`,
      variables: { userId: userId },
    };

    const config = {
      method: "post",
      url: this.baseURL,
      headers: {
        Authorization: request.headers.authorization,
        "x-hasura-role": getUserRole(altUserRoles),
        "Content-Type": "application/json",
      },
      data: data,
    };

    const response = await this.axios(config);

    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response.data.errors[0].extensions,
        errorMessage: response.data.errors[0].message,
      });
    }

    const responseData = response.data.data.Students;

    const studentResponse = await this.mappedResponse(responseData);
    return new SuccessResponse({
      statusCode: 200,
      message: "student found Successfully",
      data: studentResponse[0],
    });
  }

  public async createAndAddToGroup(
    request: any,
    studentDto: StudentDto,
    bulkToken: string
  ) {
    const decoded: any = jwt_decode(request.headers.authorization);
    const altUserRoles =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-allowed-roles"];

    const creatorUserId =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-user-id"];

    studentDto.createdBy = creatorUserId;
    studentDto.updatedBy = creatorUserId;
    studentDto.role = "student";

    if (!bulkToken) {
      studentDto.groups = [];
      const groupRes: any = await this.groupService.getGroupBySchoolClass(
        request,
        studentDto.schoolUdise,
        studentDto.className
      );
      if (!groupRes?.data[0]?.groupId) {
        return new ErrorResponse({
          errorCode: "400",
          errorMessage: "Please add atleast one class",
        });
      } else {
        studentDto.board = groupRes.data[0].board;
        studentDto.groups.push(groupRes.data[0].groupId);
      }
    }

    let createdUser;
    try {
      if (altUserRoles.includes("systemAdmin")) {
        const newCreatedStudent: any = await this.createStudent(
          request,
          studentDto,
          bulkToken
        );
        // console.log(newCreatedStudent, "test");
        if (
          newCreatedStudent?.statusCode === 200 &&
          newCreatedStudent?.data?.groups[0]?.groupId
        ) {
          return newCreatedStudent;
        } else if (newCreatedStudent.statusCode === 200) {
          studentDto.userId = newCreatedStudent?.data?.userId;
          createdUser = newCreatedStudent.data;
          createdUser.groupAddResponse = await this.addToGroups(
            studentDto,
            request
          );

          return new SuccessResponse({
            statusCode: 200,
            message: "Ok.",
            data: createdUser,
          });
        } else {
          // console.log(newCreatedStudent, "new Created user");
          return new ErrorResponse({
            errorCode: "400",
            errorMessage: `Create and add to group failed , ${newCreatedStudent?.errorMessage}`,
          });
        }
      }
    } catch (error) {
      const response = {
        msg: "Create and add to group failed",
        error,
      };
      console.log(response);
      return new ErrorResponse({
        errorCode: "500",
        errorMessage: response.msg + error.toString(),
      });
    }
  }

  public async createStudent(
    request: any,
    studentDto: StudentDto,
    bulkToken: string
  ) {
    const decoded: any = jwt_decode(request.headers.authorization);
    const altUserRoles =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-allowed-roles"];

    const creatorUserId =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-user-id"];

    studentDto.createdBy = creatorUserId;
    studentDto.updatedBy = creatorUserId;
    studentDto.role = "student";

    if (altUserRoles.includes("systemAdmin")) {
      const createdUser: any = await this.userService.checkAndAddUser(
        request,
        studentDto,
        bulkToken
      );
      // entry in student

      const userId = createdUser?.user.data.userId;

      if (!createdUser?.isNewlyCreated) {
        // console.log(createdUser, "created user is old");
        const existingStudent: any = await this.getStudentByUserId(
          userId,
          request,
          altUserRoles
        );
        if (existingStudent?.statusCode === 200) {
          if (existingStudent?.data) {
            existingStudent.data.userId = createdUser?.user.data.userId;
            existingStudent.data.username = createdUser?.user.data.username;
            existingStudent.data.message = "User Already exists";
            return existingStudent;
          } else {
            return this.createStudentInDatabase(
              studentDto,
              userId,
              request,
              altUserRoles
            );
          }
        }
      } else {
        if (createdUser?.user.statusCode === 200) {
          return this.createStudentInDatabase(
            studentDto,
            userId,
            request,
            altUserRoles
          );
        } else {
          return new ErrorResponse({
            errorCode: "500",
            errorMessage: createdUser?.errorMessage,
          });
        }
      }
    } else {
      return new ErrorResponse({
        errorCode: "401",
        errorMessage: "Unauthorized",
      });
    }
  }

  updateStudent(id: string, request: any, studentDto: StudentDto) {}

  public async mappedResponse(result: any) {
    const promises = [];
    for (const item of result) {
      const studentMapping = {
        userId: item?.user?.userId ? `${item.user.userId}` : "",
        password: await decryptPassword(item?.user.password),
        studentId: item?.studentId ? `${item.studentId}` : "",
        groups: item?.groups ? item.groups : [],
        board: item?.board ? `${item.board}` : "",
        religion: item?.religion ? `${item.religion}` : "",
        schoolUdise: item?.schoolUdise ? item.schoolUdise : "",
        caste: item?.caste ? `${item.caste}` : "",
        annualIncome: item?.annualIncome ? `${item.annualIncome}` : "",
        motherEducation: item?.motherEducation ? `${item.motherEducation}` : "",
        motherOccupation: item?.motherOccupation ? item.motherOccupation : "",
        fatherEducation: item?.fatherEducation ? `${item.fatherEducation}` : "",
        fatherOccupation: item?.fatherOccupation
          ? `${item.fatherOccupation}`
          : "",
        noOfSiblings: item?.noOfSiblings ? item.noOfSiblings : 0,
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
        email: item?.user?.email ? `${item.user.email}` : "",
        dateOfBirth: item?.user?.dateOfBirth ? `${item.user.dateOfBirth}` : "",
        gender: item?.user?.gender ? `${item.user.gender}` : "",
        mobile: item?.user?.mobile ? `${item.user.mobile}` : "",
        name: item?.user?.name ? `${item.user.name}` : "",
        role: item?.user?.role ? `${item.user.role}` : "",
        username: item?.user?.username ? `${item.user.username}` : "",
      };
      promises.push(new StudentDto(studentMapping, true));
      //  return new StudentDto(studentMapping, true);
    }

    //const promises = result.map(studentResponse);
    const promiseRes = await Promise.all(promises);
    // console.log("303", promiseRes);
    if (promiseRes) {
      return promiseRes;
    }
  }

  public async searchStudent(request: any, studentSearchDto: any) {
    const decoded: any = jwt_decode(request.headers.authorization);
    const altUserRoles =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-allowed-roles"];
    var axios = require("axios");
    let offset = 0;
    if (studentSearchDto.page > 1) {
      offset = studentSearchDto.limit * (studentSearchDto.page - 1);
    }

    let query = "";

    Object.keys(studentSearchDto.filters).forEach((e) => {
      if (studentSearchDto.filters[e] && studentSearchDto.filters[e] != "") {
        if (e === "") {
          query += `${e}:{_ilike: "%${studentSearchDto.filters[e]}%"}`;
        } else {
          query += `${e}:{_eq:"${studentSearchDto.filters[e].eq}"}`;
        }
      }
    });

    const data = {
      query: `query SearchStudent($limit:Int, $offset:Int) {
        Students_aggregate {
          aggregate {
            count
          }
        }
        Students(where:{ ${query}}, limit: $limit, offset: $offset,) {
              annualIncome
              caste
              schoolUdise
              createdAt
              fatherEducation
              fatherOccupation
              updatedAt
              studentId
              religion
              noOfSiblings
              motherOccupation
              motherEducation
              groups
              board
              createdBy
              updatedBy
              user {
                username
                userId
                updatedBy
                updatedAt
                status
                role
                password
                name
                mobile
                gender
                email
                dateOfBirth
                createdBy
                createdAt
              }
            }
          }`,
      variables: {
        limit: parseInt(studentSearchDto.limit),
        offset: offset,
      },
    };
    const config = {
      method: "post",
      url: this.baseURL,
      headers: {
        Authorization: request.headers.authorization,
        "x-hasura-role": getUserRole(altUserRoles),

        "Content-Type": "application/json",
      },
      data: data,
    };
    const response = await this.axios(config);

    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response.data.errors[0].extensions,
        errorMessage: response.data.errors[0].message,
      });
    }

    let result = response.data.data.Students;
    const studentResponse = await this.mappedResponse(result);

    return new SuccessResponse({
      statusCode: 200,
      message: "Ok.",
      data: studentResponse,
    });
  }

  async addToGroups(studentDto, request) {
    const groupMembershipIds = [];

    const errors = [];

    try {
      for (const group of studentDto.groups) {
        const groupMembershipDtoById = new GroupMembershipDtoById(studentDto);
        groupMembershipDtoById.groupId = group;
        const res: any =
          await this.groupMembershipService.createGroupMembershipById(
            request,
            groupMembershipDtoById
          );

        if (res.statusCode === 200) {
          groupMembershipIds.push({
            msg: `Added to group ${group}`,
            groupMembershipId: res.data.groupMembershipId,
          });
        } else {
          errors.push({
            msg: `Could not add to group ${group} , ${res?.errorMessage}`,
          });
        }
      }
      return {
        groupMembershipIds,
        errors,
      };
    } catch (error) {
      console.log(error);
      return new ErrorResponse({
        errorCode: "500",
        errorMessage: "Error while adding to group",
      });
    }
  }

  public mappedResponseForStudent(result: any) {
    const userResponse = result.map((item: any) => {
      const userMapping = {
        userId: item?.userId ? `${item.userId}` : "",
        studentId: item?.studentId ? `${item.studentId}` : "",
        schoolUdise: item?.schoolUdise ? `${item.schoolUdise}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        groups: item?.user?.GroupMemberships ? item.user.GroupMemberships : [],
        username: item?.user?.username ? item.user.username : "",
      };
      return userMapping;
    });
    return userResponse;
  }

  public async getStudentByUserId(userId: string, request: any, altUserRoles) {
    const data = {
      query: `query GetStudentByUserId($userId:uuid!) {
        Students(where: {userId: {_eq: $userId}}){
          createdAt
          createdBy
          studentId
          userId
          schoolUdise
          user {
            username
            GroupMemberships {
              groupId
            }
          }
        }
      }
      `,
      variables: { userId: userId },
    };

    const headers = {
      Authorization: request.headers.authorization,
      "x-hasura-role": getUserRole(altUserRoles),
      "Content-Type": "application/json",
    };

    const config = {
      method: "post",
      url: process.env.REGISTRYHASURA,
      headers: headers,
      data: data,
    };

    const response = await this.axios(config);

    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response.data.errors[0].extensions,
        errorMessage: response.data.errors[0].message,
      });
    } else {
      const result = response.data.data.Students;

      const userData = this.mappedResponseForStudent(result);

      return new SuccessResponse({
        statusCode: response.status,
        message: "Ok.",
        data: userData[0],
      });
    }
  }

  public async createStudentInDatabase(
    studentDto,
    createdUserId,
    request,
    altUserRoles
  ) {
    studentDto.userId = createdUserId;
    const studentSchema = new StudentDto(studentDto, false);
    let query = "";

    Object.keys(studentDto).forEach((e) => {
      if (
        (studentDto[e] || studentDto[e] === 0) &&
        studentDto[e] !== "" &&
        e != "password" &&
        Object.keys(studentSchema).includes(e)
      ) {
        if (Array.isArray(studentDto[e])) {
          query += `${e}: \"${JSON.stringify(studentDto[e])
            .replace("[", "{")
            .replace("]", "}")
            .replace(/\"/g, "")}\", `;
        } else {
          query += `${e}: ${JSON.stringify(studentDto[e])}, `;
        }
      }
    });

    const data = {
      query: `mutation CreateStudent {
        insert_Students_one(object: {${query}}) {
          studentId
          userId
          schoolUdise
          user {
            username
            GroupMemberships {
              groupId
            }
          }
        }
      }
      `,
      variables: {},
    };

    const headers = {
      Authorization: request.headers.authorization,
      "x-hasura-role": getUserRole(altUserRoles),
      "Content-Type": "application/json",
    };

    const config = {
      method: "post",
      url: process.env.REGISTRYHASURA,
      headers: headers,
      data: data,
    };

    const response = await this.axios(config);

    if (response?.data?.errors) {
      console.log(response.data.errors);
      return new ErrorResponse({
        errorCode: response.data.errors[0].extensions,
        errorMessage: response.data.errors[0].message,
      });
    } else {
      const result = response.data.data.insert_Students_one;
      const userData = this.mappedResponseForStudent([result]);
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: userData[0],
      });
    }
  }
}

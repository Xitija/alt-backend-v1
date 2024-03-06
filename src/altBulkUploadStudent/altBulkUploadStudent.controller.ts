import {
  CacheInterceptor,
  CACHE_MANAGER,
  Inject,
  Request,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  UseInterceptors,
  ClassSerializerInterceptor,
  SerializeOptions,
  Req,
} from "@nestjs/common";
import { ALTBulkUploadStudentService } from "src/adapters/hasura/altBulkUploadStudent.adapter";
import { StudentDto } from "src/altStudent/dto/alt-student.dto";

@ApiTags("ALT Bulk Student")
@Controller("student/bulkupload")
export class ALTBulkUploadStudentController {
  constructor(
    private altBulkUploadStudentService: ALTBulkUploadStudentService
  ) {}

  @Post()
  @ApiBasicAuth("access-token")
  @UsePipes(ValidationPipe)
  @ApiCreatedResponse({ description: "Student has been created successfully." })
  @ApiBody({ type: [StudentDto] })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @UseInterceptors(ClassSerializerInterceptor)
  public async createStudent(
    @Req() request: Request,
    @Body() bulkStudentDto: [StudentDto]
  ) {
    return this.altBulkUploadStudentService.createStudents(
      request,
      bulkStudentDto
    );
  }
}

import { IsIn, IsOptional, IsString } from 'class-validator';

export class UnassessedQueryDto {
  @IsOptional() @IsIn(['new_build','change_of_use']) type?: string;
  @IsOptional() @IsString() status?: string;
}

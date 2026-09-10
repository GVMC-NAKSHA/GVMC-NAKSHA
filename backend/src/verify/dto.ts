import { IsIn, IsOptional, IsString } from 'class-validator';

export class VerifyDto {
  @IsIn(['pending','verified','underassessed','false_positive','already_assessed']) status!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() updatedBy?: string;
}

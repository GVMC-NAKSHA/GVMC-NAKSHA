import { IsOptional, IsString } from 'class-validator';

export class UploadCsvDto {
  @IsString() fileContent!: string;
  @IsOptional() @IsString() filename?: string;
}

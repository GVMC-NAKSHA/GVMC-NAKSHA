import { IsString } from 'class-validator';

export class GenerateAlertDto {
  @IsString() wardId!: string;
}

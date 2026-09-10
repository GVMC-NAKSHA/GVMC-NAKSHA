import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTicketDto {
  @IsString() wardId!: string; @IsString() houseNumber!: string; @IsString() description!: string;
  @IsOptional() @IsUUID() propertyId?: string; @IsOptional() @IsUUID() parcelId?: string;
  @IsOptional() @IsNumber() taxPending?: number;
  @IsOptional() @IsNumber() gnssLat?: number; @IsOptional() @IsNumber() gnssLng?: number;
  @IsOptional() @IsNumber() gnssAccuracyM?: number; @IsOptional() @IsString() photoR2Key?: string;
}

export class ListTicketsDto {
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsString() status?: string;
}

export class ReviewTicketDto {
  @IsIn(['under_review', 'resolved']) status!: string;
  @IsOptional() @IsString() supervisorNotes?: string;
  @IsOptional() @IsString() reviewedBy?: string;
}

export class PhotoUploadDto {
  @IsOptional() @IsString() filename?: string;
}

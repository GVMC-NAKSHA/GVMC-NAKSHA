import { IsDateString, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class FlaggedTileDto {
  @IsString() wardId!: string;
  @IsString() r2Key!: string;
  @IsNumber() @Min(0) @Max(100) confidence!: number;
  @IsObject() bbox!: object;                       // GeoJSON Polygon
  @IsOptional() @IsDateString() capturedAt?: string;
}

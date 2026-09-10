import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListConflictsDto {
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsIn(['pending','resolved','needs_review','rejected']) status?: string;
  @IsOptional() @IsIn(['low','medium','high','critical']) severity?: string;
}
export class ResolveConflictDto {
  @IsIn(['resolved','needs_review','rejected']) status!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() resolvedBy?: string;
}

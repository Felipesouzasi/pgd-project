import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TransitionStatusDto {
  @IsInt()
  @Min(1)
  status_id: number;

  @IsOptional()
  @IsString()
  justificativa?: string;
}

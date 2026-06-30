import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryActionsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit: number = 50;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  status_id?: number;

  @IsOptional() @IsString()
  filial?: string;

  @IsOptional() @IsString()
  dt_inicio?: string;

  @IsOptional() @IsString()
  dt_fim?: string;

  @IsOptional() @IsString()
  sort_by?: string = 'acao_id';

  @IsOptional() @IsString()
  sort_dir?: 'asc' | 'desc' = 'desc';
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateVenueDto {
  @ApiPropertyOptional({ example: 'Stadium Putra' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Bukit Jalil, Kuala Lumpur' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;
}

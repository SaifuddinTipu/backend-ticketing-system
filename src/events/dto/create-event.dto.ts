import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Taylor Swift Eras Tour KL' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'The greatest tour of all time' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  @IsString()
  @IsNotEmpty()
  venueId: string;

  @ApiProperty({ example: '2026-08-15T20:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @ApiProperty({ example: '2026-08-15T23:30:00.000Z' })
  @Type(() => Date)
  @IsDate()
  endAt: Date;

  @ApiProperty({ example: 350.0 })
  @IsNumber()
  @Min(0)
  basePrice: number;

  @ApiProperty({ example: 'MYR' })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
